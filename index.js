import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// ===========================================================================
// 0. CONFIG DE LOG E UTILITÁRIOS
// ===========================================================================

function log(msg) {
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);
}

async function screenshotError(page, label = "erro") {
  try {
    const path = `/tmp/${label}_${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    log(`📸 Screenshot capturado: ${path}`);
  } catch (err) {
    log("❌ Falha ao capturar screenshot: " + err.message);
  }
}

async function waitFor(page, selector, timeout = 25000) {
  try {
    await page.waitForSelector(selector, { timeout });
  } catch (err) {
    await screenshotError(page, "missing_selector");
    throw new Error(`Selector não encontrado: ${selector}`);
  }
}

// ===========================================================================
// 1. BROWSER GLOBAL (PERSISTENTE, RÁPIDO)
// ===========================================================================

let browser;

async function startBrowser() {
  if (browser) return browser;

  log("🚀 Iniciando Chrome em modo turbo…");

  browser = await puppeteer.launch({
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      "/usr/bin/google-chrome-stable",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-infobars",
      "--disable-extensions",
      "--disable-breakpad",
      "--disable-sync",
      "--disable-default-apps",
      "--disable-translate",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--safebrowsing-disable-auto-update"
    ],
  });

  browser.on("disconnected", async () => {
    log("⚠️ Chrome caiu! Reiniciando…");
    browser = null;
    await startBrowser();
  });

  return browser;
}

// ===========================================================================
// 2. Nova página com otimizações pesadas
// ===========================================================================

async function novaPagina() {
  const browser = await startBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width: 1440, height: 900 });

  // BLOQUEIO DE RECURSOS DESNECESSÁRIOS
  await page.setRequestInterception(true);
  page.on("request", req => {
    const tipo = req.resourceType();

    if (["image", "stylesheet", "font", "media"].includes(tipo)) {
      return req.abort();
    }
    req.continue();
  });

  // Logando erros JS da página
  page.on("console", msg => {
    if (["error", "warning"].includes(msg.type()))
      log(`⚠️ Log do navegador: ${msg.text()}`);
  });

  page.on("pageerror", err => {
    log("❌ Erro JS dentro da página: " + err.message);
  });

  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(35000);

  return page;
}

// ===========================================================================
// 3. LOGIN (Reutilizado nos endpoints)
// ===========================================================================

async function loginThemis(page) {
  log("🌐 Acessando página do Themis…");

  await page.goto("https://themia.themisweb.penso.com.br/themia", {
    waitUntil: "domcontentloaded"
  });

  await waitFor(page, "#login");
  await page.type("#login", process.env.THEMIS_LOGIN, { delay: 15 });
  await page.type("#senha", process.env.THEMIS_SENHA, { delay: 15 });

  await page.click("#btnLogin");

  await page.waitForFunction(() => !location.href.includes("login"), {
    timeout: 60000
  });

  log("✅ Login concluído.");
}

// ===========================================================================
// 4. ENDPOINT: BUSCAR PROCESSO
// ===========================================================================

app.post("/buscar-processo", async (req, res) => {
  const inicio = Date.now();
  let page = null;

  try {
    const { numeroProcesso } = req.body;

    if (!numeroProcesso)
      return res.status(400).json({ erro: "Número do processo é obrigatório." });

    page = await novaPagina();
    await loginThemis(page);

    log("📂 Abrindo tela de busca…");

    await waitFor(page, "#btnBuscaProcessos");
    await page.click("#btnBuscaProcessos");

    await waitFor(page, "#adicionarBusca");
    await page.click("#adicionarBusca");

    await waitFor(page, "#numeroCNJ");
    await page.type("#numeroCNJ", numeroProcesso);
    await page.click("#btnPesquisar");

    await page.waitForTimeout(4500);

    const resultado = await page.evaluate(num => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length) return null;

      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map(td => td.innerText.trim());
        if (cols.some(c => c.includes(num))) {
          return {
            numero: cols[0],
            tipo: cols[1],
            ultimaAtualizacao: cols[2],
            status: cols[3],
          };
        }
      }
      return null;
    }, numeroProcesso);

    const duracao = Date.now() - inicio;
    log(`⏱️ Tempo total: ${duracao}ms`);

    res.json({
      numeroProcesso,
      encontrado: !!resultado,
      resultado,
      duracao_ms: duracao
    });

  } catch (err) {
    log("❌ ERRO buscar processo: " + err.message);
    if (page) await screenshotError(page, "buscarErro");
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ===========================================================================
// 5. ENDPOINT: CADASTRAR PROCESSO (OTIMIZADO + LOGS + PRINT)
// ===========================================================================

app.post("/cadastrar-processo", async (req, res) => {
  const inicio = Date.now();
  let page = null;

  try {
    const { processo, origem, valor_causa } = req.body;
    if (!processo)
      return res.status(400).json({ erro: "Número do processo é obrigatório." });

    page = await novaPagina();
    await loginThemis(page);

    log("📂 Abrindo lista de processos…");

    await waitFor(page, "#btnBuscaProcessos");
    await page.click("#btnBuscaProcessos");

    await waitFor(page, "table.table.vertical-top.table-utilities tbody tr");

    log("🔍 Localizando processo…");

    const encontrado = await page.evaluate(numero => {
      const linhas = document.querySelectorAll("table.table.vertical-top.table-utilities tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map(td => td.innerText.trim());
        const numeroCol = cols[0];
        const status = cols[cols.length - 1];

        if (numeroCol?.includes(numero) && status.includes("Pronto para cadastro")) {
          const botao = linha.querySelector(".btnCadastrarCapa");
          if (botao) {
            botao.setAttribute("data-target", "true");
          }
          return true;
        }
      }
      return false;
    }, processo);

    if (!encontrado) {
      return res.json({
        processo,
        status: "Ignorado",
        mensagem: "Processo não encontrado ou não pronto para cadastro."
      });
    }

    log("➕ Abrindo cadastro…");

    await page.evaluate(() => {
      const el = document.querySelector(".btnCadastrarCapa[data-target='true']");
      if (el) el.click();
    });

    await waitFor(page, "#selectArea");
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "domcontentloaded" });

    // =====================================================
    // CAMPOS PADRÃO (otimizados)
    // =====================================================

    async function autocomplete(selector, texto) {
      await waitFor(page, selector);
      await page.click(selector);
      await page.type(selector, texto, { delay: 10 });
      await page.waitForTimeout(800);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }

    await autocomplete("input[ng-model='vm.capa.cliente']", "Themia");
    await autocomplete("input[ng-model='vm.capa.advogadoInteressado']", "Bdyone");
    await autocomplete("input[ng-model='vm.capa.originador']", origem || "Themia");

    if (valor_causa) {
      await waitFor(page, "input[ng-model='vm.capa.valorCausa']");
      await page.evaluate(() => document.querySelector("input[ng-model='vm.capa.valorCausa']").value = "");
      await page.type("input[ng-model='vm.capa.valorCausa']", valor_causa.toString());
    }

    // PARTES
    await waitFor(page, "a[ng-click='vm.adicionarParteInteressada()']");
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await autocomplete("input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await autocomplete("input[ng-model='novaParteContraria.nome']", "INSS");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    // AÇÃO / INSTÂNCIA / FORO
    await autocomplete("input[ng-model='vm.capa.acao']", "Auxilio Acidente");
    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");
    await autocomplete("input[ng-model='vm.capa.foro']", "Preencher");

    // =====================================================
    // WORKFLOW DE ANDAMENTOS (NOVO)
    // =====================================================

    log("⚙️ Selecionando Workflow de andamentos…");

    await waitFor(page, "select#tipoAndamentoWorkflow");
    await page.select("select#tipoAndamentoWorkflow", "Workflow | Conferir Cadastro");

    await page.evaluate(() => {
      const sel = document.querySelector("select#tipoAndamentoWorkflow");
      if (sel) {
        const ev = new Event("change", { bubbles: true });
        sel.dispatchEvent(ev);
      }
    });

    log("✅ Workflow selecionado!");

    // SALVAR
    log("💾 Salvando…");
    await waitFor(page, "button[ng-click='vm.salvarProcesso()']");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(3500);

    const duracao = Date.now() - inicio;
    log(`⏱️ Tempo total do cadastro: ${duracao}ms`);

    res.json({
      processo,
      origem,
      valor_causa,
      status: "Cadastro concluído",
      duracao_ms: duracao
    });

  } catch (err) {
    log("❌ ERRO CRÍTICO cadastro: " + err.message);
    if (page) await screenshotError(page, "cadastroErro");
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ===========================================================================
// 6. STATUS
// ===========================================================================

app.get("/", (req, res) => res.send("🚀 Servidor com Puppeteer TURBO ativo"));

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", async () => {
  log(`✅ Servidor rodando na porta ${PORT}`);
  await startBrowser();
});
