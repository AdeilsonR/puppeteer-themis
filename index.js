import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

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
    await page.waitForSelector("#login", { timeout: 20000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    console.log("⏳ Aguardando validação do login...");

    // Aguarda mudança de URL após login
    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );

    // Espera até 60s o botão de busca aparecer
    try {
      await page.waitForSelector("#btnBuscaProcessos", { timeout: 60000 });
    } catch (e) {
      const currentUrl = await page.url();
      const html = await page.content();
      console.error("❌ Login aparentemente não chegou à tela principal.");
      await browser.close();
      return res.status(500).json({
        erro: "Falha ao carregar a tela principal após login.",
        url: currentUrl,
        trechoHTML: html.slice(0, 1000), // Retorna só o início do HTML pra debug
      });
    }

    console.log("✅ Login realizado com sucesso!");
    console.log("📁 Abrindo tela de busca de processos...");

    await page.click("#btnBuscaProcessos");
    await page.waitForSelector("#adicionarBusca", { timeout: 20000 });

    console.log("➕ Clicando em +Adicionar...");
    await page.click("#adicionarBusca");

    await page.waitForSelector("#numeroCNJ", { visible: true, timeout: 20000 });
    console.log("🧩 Campo de processo localizado.");
    await page.waitForTimeout(1000);

    try {
      await page.click("#numeroCNJ", { delay: 100 });
      console.log("🖱️ Campo de processo ativado via clique.");
    } catch {
      console.log("⚠️ Clique falhou, aplicando foco via DOM...");
      await page.evaluate(() => {
        const campo = document.querySelector("#numeroCNJ");
        if (campo) campo.focus();
      });
    }

    await page.waitForFunction(
      () => {
        const campo = document.querySelector("#numeroCNJ");
        return campo && !campo.disabled;
      },
      { timeout: 8000 }
    );

    await page.evaluate(() => {
      const input = document.querySelector("#numeroCNJ");
      if (input) input.value = "";
    });

    await page.type("#numeroCNJ", numeroProcesso, { delay: 75 });
    console.log("✍️ Número de processo inserido com sucesso.");

    console.log("🔍 Buscando processo...");
    await page.click("#btnPesquisar");
    console.log("📁 Aguardando resultados...");
    await page.waitForTimeout(7000);

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

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
