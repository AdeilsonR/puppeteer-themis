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
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // ===== LOGIN =====
    await page.goto("https://seudominio.com.br/themis/login", {
      waitUntil: "networkidle2",
    });

    await page.type("input[name='login']", "SEU_USUARIO_AQUI");
    await page.type("input[name='senha']", "SUA_SENHA_AQUI");
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // ===== BUSCA PROCESSO =====
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

app.get("/", (req, res) => {
  res.send("Serviço Puppeteer Themis ativo!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Rodando na porta ${PORT}`));
