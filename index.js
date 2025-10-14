import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// === ENDPOINT PRINCIPAL ===
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
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    const page = await browser.newPage();

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    console.log("🌐 Página carregada, iniciando login...");

    await page.waitForSelector("#login", { timeout: 15000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    console.log("⏳ Aguardando validação do login...");
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 20000 });
    console.log("✅ Login realizado com sucesso!");

    // === ETAPA 1: Abrir tela de busca de processos ===
    console.log("📁 Abrindo tela de busca de processos...");
    await page.click("#btnBuscaProcessos");
    await page.waitForSelector("#adicionarBusca", { timeout: 20000 });

    // === ETAPA 2: Clicar em “+ Adicionar” ===
    console.log("➕ Clicando em +Adicionar...");
    await page.click("#adicionarBusca");

    // === ETAPA 3: Esperar campo de processo ===
    await page.waitForSelector("#numeroCNJ", { timeout: 20000 });
    console.log("🧩 Campo de processo localizado.");

    await page.type("#numeroCNJ", numeroProcesso, { delay: 75 });

    // === ETAPA 4: Buscar processo ===
    console.log("🔍 Buscando processo...");
    await page.click("#btnPesquisar");

    // Espera a tela atualizar e carregar o resultado
    await page.waitForSelector(".themis-control-group", { timeout: 20000 });

    const resultado = await page.evaluate(() => {
      const tabela = document.querySelector(".themis-control-group");
      return tabela ? tabela.innerText : "Nenhum resultado encontrado.";
    });

    await browser.close();
    console.log("📄 Resultado obtido:", resultado);

    res.json({ numeroProcesso, resultado });
  } catch (err) {
    console.error("❌ Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
