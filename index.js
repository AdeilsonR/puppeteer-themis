import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// =====================================================
// 1) BROWSER GLOBAL (Mantém o Chrome sempre ativo)
// =====================================================

let browser;

async function startBrowser() {
  if (!browser) {
    console.log("🚀 Iniciando Puppeteer (modo persistente)...");

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
      ],
    });

    browser.on("disconnected", async () => {
      console.log("⚠️ Chrome desconectou! Reiniciando...");
      browser = null;
      await startBrowser();
    });
  }

  return browser;
}

// =====================================================
// Helper: cria nova página sempre limpa
// =====================================================

async function novaPagina() {
  const browser = await startBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  return page;
}

// =====================================================
// ENDPOINT: BUSCAR PROCESSO
// =====================================================

app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  let page = null;

  try {
    console.log("🔎 Buscando processo:", numeroProcesso);
    page = await novaPagina();

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 30 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 30 });
    await page.click("#btnLogin");

    await page.waitForFunction(() => !location.href.includes("login"), {
      timeout: 60000,
    });

    await page.waitForSelector("#btnBuscaProcessos");
    await page.click("#btnBuscaProcessos");

    await page.waitForSelector("#adicionarBusca");
    await page.click("#adicionarBusca");

    await page.waitForSelector("#numeroCNJ");
    await page.type("#numeroCNJ", numeroProcesso);

    await page.click("#btnPesquisar");

    await page.waitForTimeout(6000);

    const resultado = await page.evaluate((numeroProcesso) => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length)
        return "Nenhum resultado encontrado na tabela principal.";

      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );

        if (cols.some((c) => c.includes(numeroProcesso))) {
          return {
            numero: cols[0] || "N/I",
            tipo: cols[1] || "N/I",
            ultimaAtualizacao: cols[2] || "N/I",
            status: cols[3] || "N/I",
          };
        }
      }

      return "Nenhum resultado encontrado.";
    }, numeroProcesso);

    res.json({ numeroProcesso, resultado });
  } catch (err) {
    console.error("❌ Erro buscar processo:", err.message);
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// =====================================================
// ENDPOINT: CADASTRAR PROCESSO (ATUALIZADO + WORKFLOW)
// =====================================================

app.post("/cadastrar-processo", async (req, res) => {
  const { processo, origem, valor_causa } = req.body;

  if (!processo) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  let page = null;

  try {
    console.log("🧾 Iniciando cadastro do processo:", processo);

    page = await novaPagina();

    // LOGIN
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 30 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 30 });
    await page.click("#btnLogin");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    console.log("✅ Login efetuado!");

    // ABRIR RESULTADOS
    await page.waitForSelector("#btnBuscaProcessos a.btn, a[href*='resultadoBusca'], i.icon-cloud-download", { timeout: 30000 });
    await page.click("#btnBuscaProcessos a.btn, a[href*='resultadoBusca'], i.icon-cloud-download");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("table.table.vertical-top.table-utilities tbody tr");

    // LOCALIZAR PROCESSO
    console.log("🔍 Localizando processo na tabela...");

    const processoLocalizado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table.table.vertical-top.table-utilities tbody tr");

      for (const linha of linhas) {
        const colunas = [...linha.querySelectorAll("td")].map(td => td.innerText.trim());
        const numeroColuna = colunas[0];
        const status = colunas[colunas.length - 1] || "";

        if (numeroColuna?.includes(numero) && status.includes("Pronto para cadastro")) {
          const botao = linha.querySelector(".icon-plus.pointer.btnCadastrarCapa");
          if (botao) {
            botao.scrollIntoView();
            botao.setAttribute("data-encontrado", "true");
          }
          return true;
        }
      }
      return false;
    }, processo);

    if (!processoLocalizado) {
      return res.json({
        processo,
        status: "Ignorado",
        mensagem: "Processo não encontrado ou não está pronto para cadastro.",
      });
    }

    console.log("➕ Iniciando cadastro…");
    await page.evaluate(() => {
      const botao = document.querySelector(".btnCadastrarCapa[data-encontrado='true']");
      if (botao) botao.click();
    });

    // SELECIONAR ÁREA
    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // CAMPOS GERAIS
    await page.type("input[ng-model='vm.capa.cliente']", "Themia");
    await page.waitForTimeout(1200);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await page.type("input[ng-model='vm.capa.advogadoInteressado']", "Nathalia");
    await page.waitForTimeout(1200);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await page.type("input[ng-model='vm.capa.originador']", origem || "Themia");
    await page.waitForTimeout(1200);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    if (valor_causa) {
      await page.evaluate(() => {
        const input = document.querySelector("input[ng-model='vm.capa.valorCausa']");
        if (input) input.value = "";
      });
      await page.type("input[ng-model='vm.capa.valorCausa']", valor_causa.toString());
    }

    // PARTES
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[ng-model='novaParte.nome']");
    await page.type("input[ng-model='novaParte.nome']", "Parte Autor");
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector("input[ng-model='novaParteContraria.nome']");
    await page.type("input[ng-model='novaParteContraria.nome']", "INSS");
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    // AÇÃO / INSTÂNCIA / FASE / FORO
    await page.type("input[ng-model='vm.capa.acao']", "Auxilio Acidente");
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");

    await page.type("input[ng-model='vm.capa.foro']", "Preencher");
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // =====================================================
    // WORKFLOW DE ANDAMENTOS (NOVO)
    // =====================================================

    console.log("⚙️ Selecionando Workflow de andamentos...");

    await page.waitForSelector("select#tipoAndamentoWorkflow", { timeout: 20000 });

    await page.select("select#tipoAndamentoWorkflow", "Workflow | Conferir Cadastro");

    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const select = document.querySelector("select#tipoAndamentoWorkflow");
      if (select) {
        const event = new Event("change", { bubbles: true });
        select.dispatchEvent(event);
      }
    });

    console.log("✅ Workflow: Workflow | Conferir Cadastro selecionado!");

    // SALVAR
    console.log("💾 Salvando processo...");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(5000);

    res.json({
      processo,
      origem,
      valor_causa,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso no Themis.",
    });
  } catch (err) {
    console.error("❌ Erro no cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// =====================================================
// STATUS SERVER
// =====================================================

app.get("/", (req, res) => res.send("🚀 Puppeteer persistente ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  await startBrowser();
});
