import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

const log = (msg) =>
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =====================================================================
// ENDPOINT: BUSCAR PROCESSO
// =====================================================================

app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  try {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/usr/bin/google-chrome-stable",
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Abrir tela de busca
    const btnSelectors = [
      'a[title="Buscar processo"]',
      'a[tooltip="Buscar processo"]',
      'a[href*="buscar"]',
      '#btnBuscaProcessos',
      'i.fa-search',
    ];

    for (const sel of btnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 2500 });
        await page.click(sel);
        break;
      } catch {}
    }

    await page.waitForSelector("table.table.vertical-top.table-utilities");

    const resultado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((x) =>
          x.innerText.trim()
        );
        if (cols.some((c) => c.includes(numero))) {
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

    await browser.close();
    return res.json({ numeroProcesso, resultado });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
});

// =====================================================================
// ENDPOINT: CADASTRAR PROCESSO (COM TODAS AS CORREÇÕES)
// =====================================================================

app.post("/cadastrar-processo", async (req, res) => {
  const {
    processo,
    origem,
    valor_causa,
    valor_vencidas,
    valor_vincendas,
  } = req.body;

  if (!processo)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  log(`🧾 Iniciando cadastro do processo: ${processo}`);

  try {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/usr/bin/google-chrome-stable",
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // -------------------------------------------------------------
    // LOGIN
    // -------------------------------------------------------------
    log("🌐 Acessando Themis…");

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2" });
    log("✅ Login concluído.");

    // -------------------------------------------------------------
    // ABRIR BUSCA DE PROCESSOS (CORREÇÃO DEFINITIVA)
    // -------------------------------------------------------------

    log("📂 Tentando abrir tela de busca de processos…");

    const btnSelectors = [
      'a[title="Buscar processo"]',
      'a[tooltip="Buscar processo"]',
      'a[href*="buscar"]',
      '#btnBuscaProcessos',
      'i.fa-search',
    ];

    let abriu = false;

    for (const sel of btnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        abriu = true;
        break;
      } catch {}
    }

    if (!abriu)
      throw new Error("Botão de buscar processo não encontrado.");

    log("🔄 Aguardando campo de filtro…");

    await page.waitForSelector("input[ng-model='filtro.processo']", {
      timeout: 20000,
    });

    // -------------------------------------------------------------
    // DIGITAR O NÚMERO DO PROCESSO (LÓGICA DO VÍDEO)
    // -------------------------------------------------------------
    log("📝 Digitando número do processo…");

    await page.click("input[ng-model='filtro.processo']");
    await page.evaluate(() => {
      const el = document.querySelector("input[ng-model='filtro.processo']");
      if (el) el.value = "";
    });

    await page.type("input[ng-model='filtro.processo']", processo, {
      delay: 60,
    });

    await page.click("button[ng-click='buscar()'], i.fa-search");

    log("🔍 Buscando processo…");

    await page.waitForFunction(
      () => {
        const linhas = document.querySelectorAll(
          "table.table.vertical-top.table-utilities tbody tr"
        );
        return linhas.length === 1;
      },
      { timeout: 20000 }
    );

    log("📋 Apenas 1 processo encontrado.");

    // -------------------------------------------------------------
    // CLICAR NO BOTÃO CINZA (+)
    // -------------------------------------------------------------
    log("🔎 Localizando botão cinza…");

    const found = await page.evaluate(() => {
      const linha = document.querySelector(
        "table.table.vertical-top.table-utilities tbody tr"
      );
      if (!linha) return false;

      const botao = linha.querySelector(
        "i.icon-plus.pointer.btnCadastrarCapa"
      );
      if (!botao) return false;

      botao.setAttribute("data-proximo", "true");
      return true;
    });

    if (!found)
      throw new Error("Processo encontrado, mas sem botão de cadastro (+).");

    await page.evaluate(() => {
      const btn = document.querySelector(
        "i.icon-plus.pointer.btnCadastrarCapa[data-proximo='true']"
      );
      btn?.click();
    });

    await delay(1500);

    // -------------------------------------------------------------
    // SELECIONAR ÁREA
    // -------------------------------------------------------------
    await page.waitForSelector("#selectArea");
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    log("📌 Área selecionada.");

    // -------------------------------------------------------------
    // AUTOCOMPLETE (Cliente / Adv / Originador / Escritório)
    // -------------------------------------------------------------
    async function autocomplete(selector, value) {
      await page.click(selector);
      await page.type(selector, value, { delay: 60 });
      await delay(1200);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }

    // Cliente
    await autocomplete("input[ng-model='vm.capa.cliente']", "Themia");

    // Advogado interessado
    await autocomplete(
      "input[ng-model='vm.capa.advogadoInteressado']",
      "Bdyone"
    );

    // Originador FIXO
    await autocomplete(
      "input[ng-model='vm.capa.originador']",
      "MADM"
    );

    // Escritório FIXO
    await autocomplete(
      "input[ng-model='vm.capa.escritorio']",
      "Maria Fernanda de Luca Advogados"
    );

    // -------------------------------------------------------------
    // VALOR DA CAUSA
    // -------------------------------------------------------------
    if (valor_causa) {
      await page.evaluate(() => {
        const el = document.querySelector(
          "input[ng-model='vm.capa.valorCausa']"
        );
        if (el) el.value = "";
      });

      await page.type(
        "input[ng-model='vm.capa.valorCausa']",
        valor_causa.toString()
      );
    }

    // -------------------------------------------------------------
    // VENCIDAS / VINCENDAS
    // -------------------------------------------------------------
    const limparNumero = (v) =>
      v?.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".") || "";

    if (valor_vencidas) {
      await page.type("#var9", limparNumero(valor_vencidas));
    }

    if (valor_vincendas) {
      await page.type("#var10", limparNumero(valor_vincendas));
    }

    // -------------------------------------------------------------
    // WORKFLOW
    // -------------------------------------------------------------
    await page.select(
      "select[ng-model='tipoAndamentoWorkflow']",
      "Workflow | Conferir Cadastro"
    );

    // -------------------------------------------------------------
    // SALVAR
    // -------------------------------------------------------------
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await delay(4500);

    await browser.close();

    return respond(res, {
      processo,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso!",
    });
  } catch (e) {
    log(`❌ ERRO CRÍTICO: ${e.message}`);
    return res.status(500).json({ erro: e.message });
  }
});

// =====================================================================
// STATUS
// =====================================================================

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Servidor rodando na porta ${PORT}`)
);
