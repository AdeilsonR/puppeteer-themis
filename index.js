import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// ==============================
// ENDPOINT: CADASTRAR PROCESSO
// ==============================
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
    await page.setViewport({ width: 1366, height: 768 });

    // 1️⃣ Login
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

    // 2️⃣ Acessar a tela de busca de processos
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    await page.click("#btnBuscaProcessos");
    console.log("📁 Entrando na tela de busca de processos...");
    await page.waitForTimeout(5000);

    // 3️⃣ Localizar processo com status "Pronto para cadastro"
    console.log("🔍 Procurando processo na lista...");
    const processoLocalizado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map(td => td.innerText.trim());
        const numeroColuna = cols[0];
        const status = cols[cols.length - 1] || "";

        if (numeroColuna?.includes(numero) && status.includes("Pronto para cadastro")) {
          const botao = linha.querySelector(".icon-plus.pointer.btnCadastrarCapa");
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
        mensagem: "Processo não encontrado ou não está pronto para cadastro.",
      });
    }

    // 4️⃣ Clicar no botão "+"
    console.log("➕ Clicando no botão de cadastro...");
    await page.evaluate(() => {
      const botao = document.querySelector(".btnCadastrarCapa[data-encontrado='true']");
      if (botao) botao.click();
    });

    // 5️⃣ Esperar o modal aparecer e selecionar área "Previdenciário"
    console.log("📋 Selecionando área 'Previdenciário'...");
    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário"); // valor visível igual à opção

    // 6️⃣ Clicar em "Prosseguir"
    console.log("➡️ Clicando em 'Prosseguir'...");
    await page.click("#btnProsseguir");
    await page.waitForTimeout(3000);

    console.log("✅ Cadastro inicial concluído (área selecionada e prosseguido).");
    await browser.close();

    res.json({
      numeroProcesso,
      status: "Cadastro iniciado",
      mensagem: "Área 'Previdenciário' selecionada e prosseguimento realizado com sucesso.",
    });

  } catch (err) {
    console.error("❌ Erro no cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
