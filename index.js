import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// ==============================
// ENDPOINT: BUSCAR PROCESSO
// ==============================
app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  console.log("🔎 Iniciando busca do processo:", numeroProcesso);

  try {
    console.log("🚀 Iniciando navegador...");
    const browser = await puppeteer.launch({
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    console.log("🌐 Página carregada, iniciando login...");
    await page.waitForSelector("#login", { timeout: 30000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    console.log("⏳ Aguardando validação do login...");
    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );

    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    console.log("✅ Login realizado com sucesso!");

    console.log("📁 Abrindo tela de busca de processos...");
    await page.click("#btnBuscaProcessos");

    await page.waitForSelector("#adicionarBusca", { timeout: 60000 });
    console.log("➕ Clicando em +Adicionar...");
    await page.click("#adicionarBusca");

    await page.waitForFunction(() => {
      const input = document.querySelector("#numeroCNJ");
      const modal = document.querySelector(".modal, .ui-dialog");
      return (input && input.offsetParent !== null) || modal;
    }, { timeout: 60000 });

    console.log("🧩 Campo de processo localizado.");
    await page.waitForSelector("#numeroCNJ", { visible: true, timeout: 60000 });
    await page.click("#numeroCNJ");
    await page.type("#numeroCNJ", numeroProcesso, { delay: 75 });
    console.log("✍️ Número de processo inserido com sucesso.");

    console.log("🔍 Buscando processo...");
    await page.click("#btnPesquisar");
    console.log("📁 Aguardando resultados...");
    await page.waitForTimeout(8000);

    const resultado = await page.evaluate((numeroProcesso) => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length)
        return "Nenhum resultado encontrado na tabela principal.";

      let achou = null;
      for (const linha of linhas) {
        const colunas = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );
        if (colunas.some((c) => c.includes(numeroProcesso))) {
          achou = {
            numero: colunas[0] || "N/I",
            tipo: colunas[1] || "N/I",
            ultimaAtualizacao: colunas[2] || "N/I",
            status: colunas[3] || "N/I",
          };
          break;
        }
      }
      return achou || "Nenhum resultado encontrado na tabela principal.";
    }, numeroProcesso);

    await browser.close();
    console.log("📄 Resultado obtido:", resultado);
    res.json([{ numeroProcesso, resultado }]);

  } catch (err) {
    console.error("❌ Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ==============================
// ENDPOINT: CADASTRAR PROCESSO
// ==============================
app.post("/cadastrar-processo", async (req, res) => {
  const { numeroProcesso, origem } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  console.log("🧾 Iniciando cadastro do processo:", numeroProcesso);

  try {
    const browser = await puppeteer.launch({
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Login
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });
    console.log("🌐 Página carregada, iniciando login...");
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );
    console.log("✅ Login efetuado com sucesso.");

    // Entrar na busca
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    await page.click("#btnBuscaProcessos");
    console.log("📁 Entrando na tela de busca de processos...");
    await page.waitForTimeout(5000);

    // Procurar processo “Pronto para cadastro”
    console.log("🔍 Procurando processo na lista...");
    const processoLocalizado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );
        const numeroColuna = cols[0];
        const status = cols[cols.length - 1] || "";

        if (
          numeroColuna?.includes(numero) &&
          status.includes("Pronto para cadastro")
        ) {
          const botao = linha.querySelector(
            ".icon-plus.pointer.btnCadastrarCapa"
          );
          if (botao) {
            botao.scrollIntoView();
            botao.setAttribute("data-encontrado", "true");
          }
          return true;
        }
      }
      return false;
    }, numeroProcesso);

    if (!processoLocalizado) {
      console.log("⚠️ Processo não encontrado ou não está 'Pronto para cadastro'.");
      await browser.close();
      return res.json({
        numeroProcesso,
        status: "Ignorado",
        mensagem:
          "Processo não encontrado ou não está pronto para cadastro.",
      });
    }

    // Clicar em "+"
    console.log("➕ Clicando no botão de cadastro...");
    await page.evaluate(() => {
      const botao = document.querySelector(
        ".btnCadastrarCapa[data-encontrado='true']"
      );
      if (botao) botao.click();
    });

    // Selecionar área "Previdenciário"
    console.log("📋 Selecionando área 'Previdenciário'...");
    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário");
    await page.waitForTimeout(500);

    // Prosseguir
    console.log("➡️ Clicando em 'Prosseguir'...");
    await page.click("#btnProsseguir");
    await page.waitForTimeout(3000);

    // Preencher Cliente, Advogado e Originador
    console.log("🏢 Preenchendo campo Cliente...");
    await page.waitForSelector("input[ng-model='vm.capa.cliente']", {
      visible: true,
      timeout: 60000,
    });
    await page.click("input[ng-model='vm.capa.cliente']");
    await page.type("input[ng-model='vm.capa.cliente']", "Themia", { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("⚖️ Preenchendo campo Advogado interessado...");
    await page.click("input[ng-model='vm.capa.advogado']");
    await page.type("input[ng-model='vm.capa.advogado']", "Nathalia", {
      delay: 75,
    });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("🧭 Preenchendo campo Originador...");
    await page.click("input[ng-model='vm.capa.originador']");
    await page.type("input[ng-model='vm.capa.originador']", origem, { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("✅ Campos iniciais preenchidos com sucesso.");

    await browser.close();

    res.json({
      numeroProcesso,
      origem,
      status: "Campos iniciais preenchidos com sucesso.",
      mensagem:
        "Área 'Previdenciário' selecionada e campos iniciais preenchidos.",
    });
  } catch (err) {
    console.error("❌ Erro no cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ==============================
// ENDPOINT PADRÃO
// ==============================
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

// ==============================
// INICIALIZA SERVIDOR
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
