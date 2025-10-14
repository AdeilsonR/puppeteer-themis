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
    await page.waitForSelector("#login", { timeout: 15000 });
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    console.log("⏳ Aguardando validação do login...");
    await page.waitForSelector("#btnBuscaProcessos", { timeout: 20000 });
    console.log("✅ Login realizado com sucesso!");

    // === ABRIR BUSCA DE PROCESSOS ===
    console.log("📁 Abrindo tela de busca de processos...");
    await page.click("#btnBuscaProcessos");
    await page.waitForSelector("#adicionarBusca", { timeout: 20000 });

    // === CLICAR EM +ADICIONAR ===
    console.log("➕ Clicando em +Adicionar...");
    await page.click("#adicionarBusca");

    // === AGUARDAR CAMPO DE PROCESSO ===
    await page.waitForSelector("#numeroCNJ", { visible: true, timeout: 20000 });
    console.log("🧩 Campo de processo localizado.");

    // ✅ Espera um tempo adicional (para o Angular habilitar o campo)
    await page.waitForTimeout(1000);

    // ✅ Clicar no campo (tentativa padrão)
    try {
      await page.click("#numeroCNJ", { delay: 100 });
      console.log("🖱️ Campo de processo ativado via clique.");
    } catch {
      console.log("⚠️ Clique falhou, forçando foco direto via DOM...");
      await page.evaluate(() => {
        const campo = document.querySelector("#numeroCNJ");
        if (campo) campo.focus();
      });
      console.log("🎯 Foco aplicado diretamente no campo via JavaScript.");
    }

    // ✅ Esperar campo habilitar
    await page.waitForFunction(
      () => {
        const campo = document.querySelector("#numeroCNJ");
        return campo && !campo.disabled;
      },
      { timeout: 8000 }
    );

    // ✅ Limpar e digitar o número do processo
    await page.evaluate(() => {
      const input = document.querySelector("#numeroCNJ");
      if (input) input.value = "";
    });

    await page.type("#numeroCNJ", numeroProcesso, { delay: 75 });
    console.log("✍️ Número de processo inserido com sucesso.");

    // === CLICAR EM "BUSCAR PROCESSO" ===
    console.log("🔍 Buscando processo...");
    await page.click("#btnPesquisar");

    // ✅ Aguarda resposta e renderização
    console.log("📁 Aguardando resultados...");
    await page.waitForTimeout(7000);

    // === COLETAR RESULTADO ===
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
