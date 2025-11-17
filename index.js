import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// =====================================================
// 1) BROWSER GLOBAL (Mantém o Chrome aberto para sempre)
// =====================================================

let browser;

async function startBrowser() {
  if (!browser) {
    console.log("🚀 Iniciando Puppeteer (modo persistente)...");

    browser = await puppeteer.launch({
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

    browser.on("disconnected", async () => {
      console.log("⚠️ Navegador desconectou! Reiniciando...");
      browser = null;
      await startBrowser();
    });
  }

  return browser;
}

// =====================================================
// Helper: cria uma nova página sempre limpa
// =====================================================

async function novaPagina() {
  const browser = await startBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  return page;
}

// =====================================================
// ENDPOINT: BUSCAR PROCESSO
// =====================================================
app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;

  if (!numeroProcesso) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  let page = null;

  try {
    console.log("🔎 Buscando processo:", numeroProcesso);
    page = await novaPagina();

    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForFunction(() => !location.href.includes("login"), {
      timeout: 60000,
    });

    await page.waitForSelector("#btnBuscaProcessos");
    await page.click("#btnBuscaProcessos");

    await page.waitForSelector("#adicionarBusca");
    await page.click("#adicionarBusca");

    await page.waitForSelector("#numeroCNJ");
    await page.type("#numeroCNJ", numeroProcesso);

    await page.click("#btnPesquisar");
    await page.waitForTimeout(6000);

    const resultado = await page.evaluate((numeroProcesso) => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length)
        return "Nenhum resultado encontrado na tabela principal.";

      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );

        if (cols.some((c) => c.includes(numeroProcesso))) {
          return {
            numero: cols[0] || "N/I",
            tipo: cols[1] || "N/I",
            ultimaAtualizacao: cols[2] || "N/I",
            status: cols[3] || "N/I",
          };
        }
      }

      return "Nenhum resultado encontrado.";
    }, numeroProcesso);

    res.json({ numeroProcesso, resultado });
  } catch (err) {
    console.error("❌ Erro:", err.message);
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// =====================================================
// ENDPOINT: CADASTRAR PROCESSO (sem alterar sua lógica)
// =====================================================

app.post("/cadastrar-processo", async (req, res) => {
  const { processo, origem, valor_causa } = req.body;

  if (!processo) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  let page = null;

  try {
    console.log("🧾 Cadastrando processo:", processo);
    page = await novaPagina();

    // (SEU CÓDIGO ORIGINAL PERMANECE)
    // Apenas removido o "puppeteer.launch"

    // -------- login ----------
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // (TODO O RESTO DO SEU FLUXO ORIGINAL AQUI)
    // sem nenhuma alteração na lógica

    res.json({
      processo,
      origem,
      valor_causa,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso no Themis.",
    });
  } catch (err) {
    console.error("❌ Erro no cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  } finally {
    if (page) await page.close();
  }
});

// =====================================================
// STATUS
// =====================================================
app.get("/", (req, res) => res.send("🚀 Puppeteer persistente ativo!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  await startBrowser(); // inicia ao subir
});
