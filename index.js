import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// ------------------------------
// FUNÇÃO LOG
// ------------------------------
function log(msg) {
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);
}

// ------------------------------
// NORMALIZADOR DE VALORES
// ------------------------------
function normalizarValor(valor) {
  if (!valor) return "";
  return valor
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
}

// ------------------------------
// AUTOCOMPLETE SEGURO
// ------------------------------
async function autocomplete(page, selector, texto) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, texto, { delay: 80 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

// ------------------------------
// ENDPOINT: CADASTRAR PROCESSO
// ------------------------------
app.post("/cadastrar-processo", async (req, res) => {
  const { processo, valor_causa, valor_vencidas, valor_vicendas } = req.body;

  log(`🧾 Iniciando cadastro do processo: ${processo}`);

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ------------------------------
    // 1) LOGIN
    // ------------------------------
    log("🌐 Acessando Themis…");
    await page.goto("https://themia.themisweb.penso.com.br/themia", { waitUntil: "networkidle2" });

    await page.waitForSelector("#login", { timeout: 60000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    log("✅ Login concluído.");

    // ------------------------------
    // 2) ABRIR MENU PROCESSOS
    // ------------------------------
    log("📂 Abrindo menu PROCESSOS…");

    const menuProcessosSelectors = [
      "a[title='Processos']",
      "span:contains('Processos')",
      "a:has(span:contains('Processos'))",
      "i.fa-folder",
    ];

    let abriuMenu = false;
    for (const sel of menuProcessosSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        abriuMenu = true;
        break;
      } catch (_) {}
    }

    if (!abriuMenu) throw new Error("Menu 'Processos' não encontrado.");

    await page.waitForTimeout(1500);

    // ------------------------------
    // 3) CLICAR EM BUSCAR PROCESSO
    // ------------------------------
    log("🔍 Clicando em 'Buscar Processo'…");

    const buscarSelectors = [
      "a[title='Buscar Processo']",
      "span:contains('Buscar Processo')",
      "i.fa-search",
      "a[href*='buscar']",
    ];

    let abriuBusca = false;
    for (const sel of buscarSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        abriuBusca = true;
        break;
      } catch (_) {}
    }

    if (!abriuBusca) throw new Error("Botão 'Buscar Processo' não encontrado.");

    // ------------------------------
    // 4) AGUARDAR FILTRO
    // ------------------------------
    log("🔄 Aguardando campo de filtro…");

    await page.waitForSelector("input[ng-model='filtro.processo']", {
      timeout: 20000,
    });

    // ------------------------------
    // 5) DIGITAR PROCESSO E PESQUISAR
    // ------------------------------
    log("✏ Digitando número do processo…");

    await page.click("input[ng-model='filtro.processo']", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("input[ng-model='filtro.processo']", processo, { delay: 60 });

    log("🔎 Pesquisando…");
    await page.click("button[ng-click='vm.pesquisar()']");
    await page.waitForTimeout(2000);

    // ------------------------------
    // 6) CLICAR NO BOTÃO CINZA "+"
    // ------------------------------
    log("➕ Clicando no botão de cadastrar…");

    await page.waitForSelector("table tbody tr td i.fa-plus", { timeout: 20000 });
    await page.click("table tbody tr td i.fa-plus");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    // ------------------------------
    // 7) SELECIONAR ÁREA
    // ------------------------------
    log("📌 Selecionando área Previdenciário…");

    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    // ------------------------------
    // 8) CAMPOS DO CADASTRO
    // ------------------------------

    log("👤 Cliente (Themia)...");
    await autocomplete(page, "input[ng-model='vm.capa.cliente']", "Themia");

    log("⚖ Advogado Interessado (Bdyone)...");
    await autocomplete(page, "input[ng-model='vm.capa.advogadoInteressado']", "Bdyone");

    log("🏢 Escritório...");
    await autocomplete(page, "input[ng-model='vm.capa.escritorio']", "Maria Fernanda de Luca Advogados");

    log("🧭 Originador (MADM)...");
    await autocomplete(page, "input[ng-model='vm.capa.originador']", "MADM");

    // Valores normalizados
    const vCausa = normalizarValor(valor_causa);
    const vVencidas = normalizarValor(valor_vencidas);
    const vVicendas = normalizarValor(valor_vicendas);

    if (vCausa) {
      log("💰 Valor da Causa…");
      await page.click("input[ng-model='vm.capa.valorCausa']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorCausa']", vCausa);
    }

    if (vVencidas) {
      log("💰 Valor Vencidas…");
      await page.click("input[ng-model='vm.capa.valorVencidas']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVencidas']", vVencidas);
    }

    if (vVicendas) {
      log("💰 Valor Vicendas…");
      await page.click("input[ng-model='vm.capa.valorVicendas']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVicendas']", vVicendas);
    }

    // PARTES
    log("👥 Parte interessada…");
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[ng-model='novaParte.nome']");
    await autocomplete(page, "input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    log("🏛 INSS (réu)…");
    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector("input[ng-model='novaParteContraria.nome']");
    await autocomplete(page, "input[ng-model='novaParteContraria.nome']", "INSS");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    log("📚 Ação…");
    await autocomplete(page, "input[ng-model='vm.capa.acao']", "Auxilio Acidente");

    log("🏛 Instância e fase…");
    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");

    log("📍 Foro…");
    await autocomplete(page, "input[ng-model='vm.capa.foro']", "Preencher");

    // ------------------------------
    // 9) SALVAR PROCESSO
    // ------------------------------
    log("💾 Salvando processo…");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(4000);

    log("✅ Cadastro finalizado com sucesso!");
    await browser.close();

    res.json({
      processo,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso no Themis.",
    });

  } catch (err) {
    log(`❌ ERRO CRÍTICO: ${err.message}`);

    res.status(500).json({ erro: err.message });
  }
});

// ------------------------------
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render"));
app.listen(process.env.PORT || 10000, "0.0.0.0", () => {
  console.log("Servidor rodando na porta 10000");
});
