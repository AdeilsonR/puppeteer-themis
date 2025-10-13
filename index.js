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

  try {
    console.log(`🔎 Iniciando busca do processo: ${numeroProcesso}`);

    const browser = await puppeteer.launch({
      headless: true,
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

    // === LOGIN NO THEMIS ===
    console.log("🌐 Acessando página de login do Themis...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    const usuario = process.env.THEMIS_LOGIN;
    const senha = process.env.THEMIS_SENHA;

    if (!usuario || !senha) {
      throw new Error("As variáveis THEMIS_LOGIN e THEMIS_SENHA não foram definidas no Render.");
    }

    await page.type("input[name='login']", usuario);
    await page.type("input[name='senha']", senha);
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    console.log("✅ Login efetuado com sucesso!");

    // === BUSCA DO PROCESSO ===
    await page.goto("https://themia.themisweb.penso.com.br/themia/processos", {
      waitUntil: "networkidle2",
    });

    console.log("🔎 Buscando processo...");
    await page.type("input[name='numeroProcesso']", numeroProcesso);
    await page.click("button:has-text('Buscar')");
    await page.waitForSelector(".tabela-processos");

    const resultado = await page.evaluate(() => {
      const el = document.querySelector(".tabela-processos");
      return el ? el.innerText : "Nenhum resultado encontrado.";
    });

    await browser.close();
    console.log("✅ Busca concluída com sucesso!");

    res.json({ numeroProcesso, resultado });
  } catch (err) {
    console.error("❌ Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// === ENDPOINT DE STATUS ===
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

// === INICIALIZA SERVIDOR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
