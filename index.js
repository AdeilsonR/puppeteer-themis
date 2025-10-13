import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  try {
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

    await page.goto("https://seudominio.com.br/themis/login", {
      waitUntil: "networkidle2",
    });

    await page.type("input[name='login']", "SEU_USUARIO");
    await page.type("input[name='senha']", "SUA_SENHA");
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await page.goto("https://seudominio.com.br/themis/processos", {
      waitUntil: "networkidle2",
    });

    await page.type("input[name='numeroProcesso']", numeroProcesso);
    await page.click("button:has-text('Buscar')");
    await page.waitForSelector(".tabela-processos");

    const resultado = await page.evaluate(() => {
      const el = document.querySelector(".tabela-processos");
      return el ? el.innerText : "Nenhum resultado encontrado.";
    });

    await browser.close();
    res.json({ numeroProcesso, resultado });
  } catch (err) {
    console.error("Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
