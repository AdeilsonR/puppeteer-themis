import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// --------------------------------------------------------------
// LOG
// --------------------------------------------------------------
function log(msg) {
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);
}

// --------------------------------------------------------------
// NORMALIZAÇÃO DE VALORES
// --------------------------------------------------------------
function normalizarValor(valor) {
  if (!valor) return "";
  return valor
    .replace(/[^\d,,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
}

// --------------------------------------------------------------
// AUTOCOMPLETE
// --------------------------------------------------------------
async function autocomplete(page, selector, texto) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, texto, { delay: 80 });
  await page.waitForTimeout(800);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

// --------------------------------------------------------------
// INICIALIZAÇÃO RESILIENTE DO CHROME
// --------------------------------------------------------------
const chromeFlags = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-setuid-sandbox",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--disable-features=site-per-process",
  "--disable-features=IsolateOrigins",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-domain-reliability",
  "--disable-breakpad",
  "--disable-component-update",
  "--disable-notifications",
  "--disable-translate",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];

async function launchBrowserWithRetry() {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      log(`🚀 Iniciando Chrome (tentativa ${tentativa}/3)...`);

      const browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH ||
          "/usr/bin/google-chrome-stable",
        headless: "new",
        timeout: 120000,
        args: chromeFlags,
      });

      log("🟢 Chrome iniciado com sucesso.");
      return browser;
    } catch (err) {
      log(`⚠️ Falha ao subir Chrome: ${err.message}`);
      if (tentativa === 3) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// --------------------------------------------------------------
// GLOBAL – CAPTURA FALHAS NÃO TRATADAS
// --------------------------------------------------------------
process.on("unhandledRejection", (err) =>
  log("🔥 Unhandled Rejection: " + err)
);
process.on("uncaughtException", (err) =>
  log("🔥 Uncaught Exception: " + err)
);

// --------------------------------------------------------------
// ENDPOINT RESTAURADO: BUSCAR PROCESSO
// --------------------------------------------------------------
app.post("/buscar-processo", async (req, res) => {
  const { processo } = req.body;

  log(`🔎 Buscando processo: ${processo}`);

  try {
    const browser = await launchBrowserWithRetry();
    const page = await browser.newPage();

    await page.setDefaultNavigationTimeout(180000);
    await page.setDefaultTimeout(180000);

    await page.setViewport({ width: 1366, height: 768 });

    log("🌐 Acessando Themis…");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("#login");
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 30 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 30 });
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2" });
    log("✅ Login concluído.");

    log("📂 Abrindo menu PROCESSOS…");
    await page.waitForSelector("a[title='Processos']", { timeout: 60000 });
    await page.click("a[title='Processos']");
    await page.waitForTimeout(1500);

    log("🔎 Acessando Buscar Processo…");
    await page.waitForSelector("a[title='Buscar Processo']");
    await page.click("a[title='Buscar Processo']");

    await page.waitForSelector("#numeroCNJ", { timeout: 30000 });

    log("✏ Inserindo CNJ…");
    await page.click("#numeroCNJ", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#numeroCNJ", processo);

    await page.click("button[ng-click='vm.pesquisarProcesso()']");
    await page.waitForSelector("table.table", { timeout: 60000 });

    log("📄 Extraindo dados…");

    const rows = await page.evaluate(() => {
      const tabela = document.querySelectorAll("table.table tbody tr");
      if (!tabela.length) return [];

      return Array.from(tabela).map((tr) => {
        const cols = tr.querySelectorAll("td");
        return {
          numero: cols[0]?.innerText?.trim() || "",
          status: cols[1]?.innerText?.trim() || "",
          valor: cols[2]?.innerText?.trim() || "",
        };
      });
    });

    await browser.close();

    res.json({
      processo,
      registros: rows,
    });
  } catch (err) {
    log(`❌ ERRO CRÍTICO: ${err.message}`);
    res.status(500).json({ erro: err.message });
  }
});

// --------------------------------------------------------------
// ENDPOINT: CADASTRAR PROCESSO — COM FLUXO NOVO
// --------------------------------------------------------------
app.post("/cadastrar-processo", async (req, res) => {
  const { processo, valor_causa, valor_vencidas, valor_vicendas } = req.body;

  log(`🧾 Iniciando cadastro do processo: ${processo}`);

  try {
    const browser = await launchBrowserWithRetry();
    const page = await browser.newPage();

    await page.setDefaultNavigationTimeout(180000);
    await page.setDefaultTimeout(180000);

    await page.setViewport({ width: 1366, height: 768 });

    // LOGIN
    log("🌐 Acessando Themis…");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("#login", { timeout: 60000 });
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    log("✅ Login concluído.");
    log("📂 Abrindo menu PROCESSOS…");

    await page.waitForSelector("a[title='Processos']", { timeout: 60000 });
    await page.click("a[title='Processos']");
    await page.waitForTimeout(1200);

    log("🔎 Acessando Buscar Processo…");
    await page.waitForSelector("a[title='Buscar Processo']", {
      timeout: 60000,
    });
    await page.click("a[title='Buscar Processo']");

    log("🔄 Aguardando campo de filtro…");
    await page.waitForSelector("input[ng-model='filtro.processo']", {
      timeout: 60000,
    });

    // Filtro
    log("✏ Digitando número do processo…");
    await page.click("input[ng-model='filtro.processo']", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("input[ng-model='filtro.processo']", processo);

    log("🔍 Pesquisando…");
    await page.click("button[ng-click='vm.pesquisar()']");
    await page.waitForTimeout(2000);

    // Botão "+"
    log("➕ Clicando no botão cinza de cadastro…");
    await page.waitForSelector("table tbody tr td i.fa-plus", {
      timeout: 60000,
    });
    await page.click("table tbody tr td i.fa-plus");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Seleção de área
    log("📌 Selecionando área…");
    await page.waitForSelector("#selectArea");
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // CAMPOS
    log("👤 Cliente...");
    await autocomplete(page, "input[ng-model='vm.capa.cliente']", "Themia");

    log("⚖ Advogado...");
    await autocomplete(
      page,
      "input[ng-model='vm.capa.advogadoInteressado']",
      "Bdyone"
    );

    log("🏢 Escritório...");
    await autocomplete(
      page,
      "input[ng-model='vm.capa.escritorio']",
      "Maria Fernanda de Luca Advogados"
    );

    log("🧭 Originador...");
    await autocomplete(
      page,
      "input[ng-model='vm.capa.originador']",
      "MADM"
    );

    // Valores
    const vCausa = normalizarValor(valor_causa);
    const vVencidas = normalizarValor(valor_vencidas);
    const vVicendas = normalizarValor(valor_vicendas);

    if (vCausa) {
      await page.click("input[ng-model='vm.capa.valorCausa']", {
        clickCount: 3,
      });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorCausa']", vCausa);
    }

    if (vVencidas) {
      await page.click("input[ng-model='vm.capa.valorVencidas']", {
        clickCount: 3,
      });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVencidas']", vVencidas);
    }

    if (vVicendas) {
      await page.click("input[ng-model='vm.capa.valorVicendas']", {
        clickCount: 3,
      });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVicendas']", vVicendas);
    }

    // Partes
    log("👥 Parte interessada...");
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[ng-model='novaParte.nome']");
    await autocomplete(page, "input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    log("🏛 Réu...");
    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector(
      "input[ng-model='novaParteContraria.nome']"
    );
    await autocomplete(
      page,
      "input[ng-model='novaParteContraria.nome']",
      "INSS"
    );
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    log("📚 Ação…");
    await autocomplete(
      page,
      "input[ng-model='vm.capa.acao']",
      "Auxilio Acidente"
    );

    log("🏛 Instância e fase…");
    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");

    log("📍 Foro…");
    await autocomplete(page, "input[ng-model='vm.capa.foro']", "Preencher");

    // Salvar
    log("💾 Salvando processo…");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(4000);

    log("✅ Cadastro concluído!");
    await browser.close();

    res.json({
      processo,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso.",
    });
  } catch (err) {
    log(`❌ ERRO CRÍTICO: ${err.message}`);
    res.status(500).json({ erro: err.message });
  }
});

// ------------------------------------------------------
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo"));
app.listen(process.env.PORT || 10000, "0.0.0.0", () =>
  console.log("Servidor rodando na porta 10000")
);
