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

  console.log(`🔎 Iniciando busca do processo: ${numeroProcesso}`);
  console.log("🚀 Iniciando navegador...");

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    await page.goto("https://themia.themisweb.penso.com.br/themia/login", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("🌐 Página carregada, iniciando login...");

    // === LOGIN ===
    await page.waitForSelector("#login", { timeout: 10000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 });
    console.log("✅ Login realizado com sucesso!");

    // === BUSCA DO PROCESSO ===
    console.log("🔍 Buscando processo...");
    await page.type("input[name='numeroProcesso']", numeroProcesso);
    await page.click("button:has-text('Buscar')");
    await page.waitForSelector(".tabela-processos", { timeout: 15000 });

    const resultado = await page.evaluate(() => {
      const el = document.querySelector(".tabela-processos");
      return el ? el.innerText : "Nenhum resultado encontrado.";
    });

    await browser.close();
    console.log("📄 Resultado obtido:", resultado);

    res.json({ numeroProcesso, resultado });
  } catch (error) {
    console.error("❌ Erro na automação:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

// === TESTE RÁPIDO ===
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
