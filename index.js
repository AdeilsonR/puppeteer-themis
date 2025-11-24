import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// ------------------------------
// LOG
// ------------------------------
function log(msg) {
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);
}

// ------------------------------
// NORMALIZA VALORES MONETÁRIOS
// ------------------------------
function normalizarValor(valor) {
  if (!valor) return "";
  return valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
}

// ------------------------------
// AUTOCOMPLETE
// ------------------------------
async function autocomplete(page, selector, texto) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, texto, { delay: 70 });
  await page.waitForTimeout(800);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

// ------------------------------
// ENDPOINT ORIGINAL RESTAURADO
// ------------------------------
app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  log(`🔎 Buscando processo: ${numeroProcesso}`);

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    log("🌐 Acessando Themis...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", { waitUntil: "networkidle2" });

    // LOGIN
    await page.waitForSelector("#login", { timeout: 60000 });
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    log("📂 Abrindo tela de busca de processos...");

    // MESMO BOTÃO DO CADASTRO
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    await page.click("#btnBuscaProcessos");

    // ADICIONAR BUSCA
    await page.waitForSelector("#adicionarBusca", { timeout: 60000 });
    await page.click("#adicionarBusca");

    // DIGITAR PROCESSO NO MODAL ANTIGO (#numeroCNJ)
    await page.waitForSelector("#numeroCNJ", { timeout: 60000 });
    await page.click("#numeroCNJ");
    await page.keyboard.press("Backspace");
    await page.type("#numeroCNJ", numeroProcesso, { delay: 70 });

    // PESQUISAR
    await page.click("#btnPesquisar");
    await page.waitForTimeout(6000);

    const resultado = await page.evaluate((numeroProcesso) => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length)
        return "Nenhum resultado encontrado na tabela principal.";

      for (const linha of linhas) {
        const colunas = [...linha.querySelectorAll("td")].map((td) => td.innerText.trim());
        if (colunas.some((c) => c.includes(numeroProcesso))) {
          return {
            numero: colunas[0] || "N/I",
            tipo: colunas[1] || "N/I",
            ultimaAtualizacao: colunas[2] || "N/I",
            status: colunas[3] || "N/I",
          };
        }
      }
      return "Nenhum resultado encontrado na tabela principal.";
    }, numeroProcesso);

    await browser.close();

    log("📄 Resultado encontrado e retornado.");
    res.json({ numeroProcesso, resultado });

  } catch (err) {
    log(`❌ ERRO: ${err.message}`);
    res.status(500).json({ erro: err.message });
  }
});

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
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // LOGIN
    log("🌐 Acessando Themis...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", { waitUntil: "networkidle2" });

    await page.waitForSelector("#login", { timeout: 60000 });
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    log("✅ Login concluído.");

    // MESMO CAMINHO INICIAL DO FLUXO ORIGINAL
    log("📂 Abrindo tela de busca de processos...");
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    await page.click("#btnBuscaProcessos");

    // AQUI COMEÇA A LÓGICA NOVA (IGUAL AO VÍDEO)
    log("🔄 Aguardando campo de filtro...");
    await page.waitForSelector("input[ng-model='filtro.processo']", { timeout: 60000 });

    await page.click("input[ng-model='filtro.processo']", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("input[ng-model='filtro.processo']", processo, { delay: 70 });

    log("🔎 Pesquisando...");
    await page.click("button[ng-click='vm.pesquisar()']");
    await page.waitForTimeout(3000);

    // CLICA NO BOTÃO CINZA "+"
    log("➕ Clicando no botão cinza...");
    await page.waitForSelector("table tbody tr td i.fa-plus", { timeout: 60000 });
    await page.click("table tbody tr td i.fa-plus");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    // ÁREA
    log("📌 Selecionando área...");
    await page.waitForSelector("#selectArea", { timeout: 60000 });
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    // CAMPOS DO CADASTRO
    await autocomplete(page, "input[ng-model='vm.capa.cliente']", "Themia");
    await autocomplete(page, "input[ng-model='vm.capa.advogadoInteressado']", "Bdyone");
    await autocomplete(page, "input[ng-model='vm.capa.escritorio']", "Maria Fernanda de Luca Advogados");
    await autocomplete(page, "input[ng-model='vm.capa.originador']", "MADM");

    const vCausa = normalizarValor(valor_causa);
    const vVencidas = normalizarValor(valor_vencidas);
    const vVicendas = normalizarValor(valor_vicendas);

    if (vCausa) {
      await page.click("input[ng-model='vm.capa.valorCausa']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorCausa']", vCausa);
    }

    if (vVencidas) {
      await page.click("input[ng-model='vm.capa.valorVencidas']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVencidas']", vVencidas);
    }

    if (vVicendas) {
      await page.click("input[ng-model='vm.capa.valorVicendas']", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("input[ng-model='vm.capa.valorVicendas']", vVicendas);
    }

    // PARTES
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[ng-model='novaParte.nome']");
    await autocomplete(page, "input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector("input[ng-model='novaParteContraria.nome']");
    await autocomplete(page, "input[ng-model='novaParteContraria.nome']", "INSS");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    await autocomplete(page, "input[ng-model='vm.capa.acao']", "Auxilio Acidente");

    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");
    await page.select("#processoFase", "Inicial");

    await autocomplete(page, "input[ng-model='vm.capa.foro']", "Preencher");

    // SALVAR
    log("💾 Salvando processo...");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(4000);

    log("✅ Cadastro finalizado!");
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
