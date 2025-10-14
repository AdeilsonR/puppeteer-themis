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

    // === LOGIN AJUSTADO ===
    await page.waitForSelector("#login", { timeout: 10000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    console.log("⏳ Aguardando validação do login...");

    try {
      // Espera até 20 segundos o desaparecimento do campo de login
      await page.waitForSelector("body:not(:has(#login))", { timeout: 20000 });
      console.log("✅ Login realizado com sucesso!");
    } catch {
      console.warn("⚠️ Login pode não ter sido concluído, verificando mensagens...");
      const erroLogin = await page.evaluate(() => document.body.innerText);
      throw new Error(
        erroLogin.includes("Usuário ou senha inválido")
          ? "Usuário ou senha incorretos no Themis."
          : "O login não redirecionou (possível bloqueio ou captcha)."
      );
    }

    console.log("✅ Login efetuado, buscando processo...");

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
