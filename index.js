import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

/* ===========================================================
   ENDPOINT 1 - BUSCAR PROCESSO
=========================================================== */
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

    console.log("⏳ Aguardando o campo de processo aparecer...");
    let campoSelector = "#numeroCNJ";

    try {
      await page.waitForSelector(campoSelector, { visible: true, timeout: 60000 });
    } catch {
      const alternativas = [
        "input[name='numeroCNJ']",
        "#inputNumeroProcesso",
        "input[type='text']"
      ];
      for (const alt of alternativas) {
        const exists = await page.$(alt);
        if (exists) {
          campoSelector = alt;
          console.log(`⚙️ Usando seletor alternativo: ${alt}`);
          break;
        }
      }

      const screenshot = "/tmp/error_numeroCNJ.png";
      await page.screenshot({ path: screenshot });
      const base64 = fs.readFileSync(screenshot).toString("base64");
      const urlAtual = await page.url();
      const titulo = await page.title();

      await browser.close();
      return res.status(500).json({
        erro: "Campo de número de processo não foi encontrado.",
        url: urlAtual,
        titulo,
        screenshot: `data:image/png;base64,${base64}`
      });
    }

    console.log("🧩 Campo de processo localizado.");
    await page.waitForTimeout(1000);

    try {
      await page.click(campoSelector, { delay: 100 });
      console.log("🖱️ Campo de processo ativado via clique.");
    } catch {
      console.log("⚠️ Clique falhou, aplicando foco via DOM...");
      await page.evaluate((sel) => {
        const campo = document.querySelector(sel);
        if (campo) campo.focus();
      }, campoSelector);
    }

    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) input.value = "";
    }, campoSelector);

    await page.type(campoSelector, numeroProcesso, { delay: 75 });
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

/* ===========================================================
   ENDPOINT 2 - CADASTRAR PROCESSO (estrutura base)
=========================================================== */
app.post("/cadastrar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  console.log("🧾 Iniciando cadastro do processo:", numeroProcesso);

  try {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
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
    console.log("🌐 Página de login carregada.");

    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );
    console.log("✅ Login efetuado com sucesso.");

    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    await page.click("#btnBuscaProcessos");
    console.log("📁 Entrando na tela de busca de processos...");

    console.log("🧩 Preparando para identificar processos 'Pronto para cadastro'...");
    await page.waitForTimeout(5000);

    console.log("✅ Estrutura do endpoint de cadastro validada — aguardando lógica de campos.");
    await browser.close();

    res.json({
      numeroProcesso,
      status: "Estrutura de cadastro pronta",
      mensagem: "Login, navegação e base concluídas com sucesso.",
    });
  } catch (err) {
    console.error("❌ Erro na automação de cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

/* ===========================================================
   ENDPOINT BASE
=========================================================== */
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
