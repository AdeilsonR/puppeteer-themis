import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// ===========================================================================
// LOG & HELPERS
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
// BROWSER PERSISTENTE (Chrome sempre ativo)
// ===========================================================================

let browser;

async function startBrowser() {
  if (browser) return browser;

  log("🚀 Iniciando Chrome…");

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
      "--disable-breakpad",
      "--disable-extensions",
      "--disable-infobars",
      "--no-first-run",
      "--no-default-browser-check",
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
// NOVA PÁGINA — sem bloqueio de recursos! (o Themis quebra se bloquear)
// ===========================================================================

async function novaPagina() {
  const browser = await startBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width: 1440, height: 900 });

  // 🔥 NÃO BLOQUEAR RECURSOS — Themis depende de CSS, fontes e scripts
  await page.setRequestInterception(false);

  page.on("console", msg => {
    if (["error", "warning"].includes(msg.type()))
      log(`⚠️ Log do navegador: ${msg.text()}`);
  });

  page.on("pageerror", err => {
    log("❌ Erro JS dentro da página (Angular): " + err.message);
  });

  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);

  return page;
}

// ===========================================================================
// LOGIN CONSISTENTE
// ===========================================================================

async function loginThemis(page) {
  try {
    log("🌐 Acessando Themis…");

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForTimeout(1200);

    const possíveis = ["#login", "input[id='login']", "input[type='text']"];
    let encontrado = null;

    for (const sel of possíveis) {
      try {
        await page.waitForSelector(sel, { timeout: 2500 });
        encontrado = sel;
        break;
      } catch {}
    }

    if (!encontrado) {
      log("⚠️ Login não encontrado — recarregando…");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      await page.waitForSelector("#login", { timeout: 4000 });
      encontrado = "#login";
    }

    log(`🔑 Campo login detectado: ${encontrado}`);

    await page.type(encontrado, process.env.THEMIS_LOGIN, { delay: 15 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 15 });
    await page.click("#btnLogin");

    await page.waitForFunction(() => !location.href.includes("login"), {
      timeout: 60000,
    });

    log("✅ Login concluído.");
  } catch (err) {
    await screenshotError(page, "login_falhou");
    throw err;
  }
}

// ===========================================================================
// BUSCAR PROCESSO
// ===========================================================================

app.post("/buscar-processo", async (req, res) => {
  const início = Date.now();
  let page = null;

  try {
    const { numeroProcesso } = req.body;

    if (!numeroProcesso)
      return res.status(400).json({ erro: "Número do processo é obrigatório" });

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

    await page.waitForTimeout(4000);

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

    res.json({
      ok: true,
      numeroProcesso,
      resultado,
      duracao_ms: Date.now() - início
    });

  } catch (err) {
    log("❌ ERRO BUSCAR: " + err.message);
    await screenshotError(page, "buscar_erro");
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ===========================================================================
// CADASTRAR PROCESSO
// ===========================================================================

app.post("/cadastrar-processo", async (req, res) => {
  const início = Date.now();
  let page = null;

  try {
    const { processo, origem, valor_causa } = req.body;

    if (!processo)
      return res.status(400).json({ erro: "Número do processo é obrigatório" });

    page = await novaPagina();
    await loginThemis(page);

    log("📂 Abrindo lista de processos…");

    await waitFor(page, "#btnBuscaProcessos");
    await page.click("#btnBuscaProcessos");

    // 🔥 PATCH IMPORTANTE: garantir carregamento REAL da tabela
    await waitFor(page, "table.table.vertical-top.table-utilities tbody", 45000);

    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "table.table.vertical-top.table-utilities tbody tr"
        ).length > 0,
      { timeout: 45000 }
    );

    log("📋 Tabela carregada — iniciando busca…");

    // Localizar processo
    log("🔍 Procurando processo…");

    const encontrado = await page.evaluate(num => {
      const linhas = document.querySelectorAll(
        "table.table.vertical-top.table-utilities tbody tr"
      );

      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map(td =>
          td.innerText.trim()
        );
        const numero = cols[0];
        const status = cols[cols.length - 1];

        if (numero?.includes(num) && status.includes("Pronto para cadastro")) {
          const btn = linha.querySelector(".btnCadastrarCapa");
          btn?.setAttribute("data-ok", "true");
          return true;
        }
      }
      return false;
    }, processo);

    if (!encontrado) {
      return res.json({
        processo,
        status: "Ignorado",
        mensagem: "Processo não encontrado ou não está pronto."
      });
    }

    log("➕ Abrindo cadastro…");

    await page.evaluate(() => {
      const btn = document.querySelector(".btnCadastrarCapa[data-ok='true']");
      if (btn) btn.click();
    });

    // ÁREA
    await waitFor(page, "#selectArea");
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation();

    // autocomplete helper
    async function autocomplete(selector, texto) {
      await waitFor(page, selector);
      await page.click(selector);
      await page.type(selector, texto, { delay: 10 });
      await page.waitForTimeout(800);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }

    // preenchimentos
    await autocomplete("input[ng-model='vm.capa.cliente']", "Themia");
    await autocomplete("input[ng-model='vm.capa.advogadoInteressado']", "Bdyone");
    await autocomplete("input[ng-model='vm.capa.originador']", origem || "Themia");

    if (valor_causa) {
      await waitFor(page, "input[ng-model='vm.capa.valorCausa']");
      await page.evaluate(() => {
        document.querySelector("input[ng-model='vm.capa.valorCausa']").value = "";
      });
      await page.type("input[ng-model='vm.capa.valorCausa']", valor_causa.toString());
    }

    // Partes
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await autocomplete("input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await autocomplete("input[ng-model='novaParteContraria.nome']", "INSS");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    await autocomplete("input[ng-model='vm.capa.acao']", "Auxilio Acidente");

    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");

    await autocomplete("input[ng-model='vm.capa.foro']", "Preencher");

    // WORKFLOW
    log("⚙️ Selecionando Workflow…");

    await waitFor(page, "select#tipoAndamentoWorkflow");
    await page.select("select#tipoAndamentoWorkflow", "Workflow | Conferir Cadastro");

    await page.evaluate(() => {
      const sel = document.querySelector("select#tipoAndamentoWorkflow");
      if (sel)
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    log("💾 Salvando…");

    await waitFor(page, "button[ng-click='vm.salvarProcesso()']");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(3500);

    res.json({
      ok: true,
      processo,
      origem,
      valor_causa,
      status: "Cadastro concluído",
      duracao_ms: Date.now() - início
    });

  } catch (err) {
    log("❌ ERRO CRÍTICO CADASTRO: " + err.message);
    await screenshotError(page, "cadastro_erro");
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ===========================================================================
// STATUS
// ===========================================================================

app.get("/", (req, res) => res.send("🚀 Puppeteer persistente ativo e estável"));

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", async () => {
  log(`✅ Servidor rodando na porta ${PORT}`);
  await startBrowser();
});
