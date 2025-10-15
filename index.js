import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

/* =========================================================
   ENDPOINT: BUSCAR PROCESSO
========================================================= */
app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;
  if (!numeroProcesso)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  console.log("🔎 Iniciando busca do processo:", numeroProcesso);
  try {
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
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");
    console.log("⏳ Aguardando autenticação...");

    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );
    console.log("✅ Login realizado com sucesso!");

    await page.click("#btnBuscaProcessos");
    console.log("📁 Tela de busca aberta...");
    await page.waitForSelector("#adicionarBusca", { timeout: 60000 });
    await page.click("#adicionarBusca");
    console.log("➕ Clicando em +Adicionar...");
    await page.waitForSelector("#numeroCNJ", { visible: true });
    await page.type("#numeroCNJ", numeroProcesso, { delay: 75 });
    console.log("✍️ Número de processo inserido:", numeroProcesso);
    await page.click("#btnPesquisar");
    console.log("🔍 Realizando pesquisa...");
    await page.waitForTimeout(8000);

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
            numero: cols[0],
            tipo: cols[1],
            ultimaAtualizacao: cols[2],
            status: cols[3],
          };
        }
      }
      return "Nenhum resultado encontrado.";
    }, numeroProcesso);

    await browser.close();
    console.log("📄 Resultado obtido:", resultado);
    res.json([{ numeroProcesso, resultado }]);
  } catch (err) {
    console.error("❌ Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

/* =========================================================
   ENDPOINT: CADASTRAR PROCESSO
========================================================= */
app.post("/cadastrar-processo", async (req, res) => {
  const { processo, originador, valor_causa } = req.body;
  if (!processo)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  console.log("🧾 Iniciando cadastro do processo:", processo);

  try {
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
    await page.setViewport({ width: 1366, height: 768 });

    /* LOGIN */
    console.log("🌐 Acessando Themis...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });
    console.log("🔑 Efetuando login...");
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");
    await page.waitForFunction(
      () => !window.location.href.includes("login"),
      { timeout: 60000 }
    );
    console.log("✅ Login efetuado com sucesso.");

    /* BUSCA E LOCALIZAÇÃO */
    console.log("📂 Acessando tela de busca de processos...");
    await page.click("#btnBuscaProcessos");
    await page.waitForTimeout(4000);

    console.log("🔍 Procurando processo na lista...");
    const localizado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );
        const numeroColuna = cols[0];
        const status = cols[cols.length - 1] || "";
        if (
          numeroColuna?.includes(numero) &&
          status.includes("Pronto para cadastro")
        ) {
          const botao = linha.querySelector(".icon-plus.pointer.btnCadastrarCapa");
          if (botao) {
            botao.scrollIntoView();
            botao.setAttribute("data-encontrado", "true");
          }
          return true;
        }
      }
      return false;
    }, processo);

    if (!localizado) {
      console.log("⚠️ Processo não encontrado ou não está pronto para cadastro.");
      await browser.close();
      return res.json({
        processo,
        status: "Ignorado",
        mensagem: "Não encontrado ou não pronto para cadastro.",
      });
    }

    /* CLICAR EM + */
    console.log("➕ Clicando em '+' para iniciar cadastro...");
    await page.evaluate(() => {
      const botao = document.querySelector(
        ".btnCadastrarCapa[data-encontrado='true']"
      );
      if (botao) botao.click();
    });

    /* SELECIONAR ÁREA PREVIDENCIÁRIO */
    console.log("📋 Selecionando área 'Previdenciário'...");
    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");
    await page.waitForTimeout(4000);
    console.log("✅ Área selecionada, avançando...");

    /* CLIENTE */
    console.log("👥 Selecionando Cliente: THEMIA...");
    await page.click("input[ng-model='vm.capa.cliente']");
    await page.type("input[ng-model='vm.capa.cliente']", "Themia", { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    /* ADVOGADO */
    console.log("⚖️ Selecionando Advogado: Nathalia Prata...");
    await page.click("input[ng-model='vm.capa.advogado']");
    await page.type("input[ng-model='vm.capa.advogado']", "Nathalia", { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    /* ORIGINADOR */
    console.log("🧭 Selecionando Originador:", originador);
    await page.click("input[ng-model='vm.capa.originador']");
    await page.type("input[ng-model='vm.capa.originador']", originador || "", {
      delay: 75,
    });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    /* EXTRAIR PARTE INTERESSADA */
    console.log("🕵️‍♂️ Extraindo Parte Interessada (Autor)...");
    const parte = await page.evaluate(() => {
      const el = document.querySelector("#partesProcesso dd.justificado");
      if (!el) return { nome: "", cpf: "" };
      const texto = el.innerText;
      const nome = texto.split("CPF")[0]?.trim() || "";
      const cpfMatch = texto.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      const cpf = cpfMatch ? cpfMatch[0] : "";
      if (cpf.includes("XXX")) return { nome, cpf: "" };
      return { nome, cpf };
    });
    console.log("👤 Parte Interessada:", parte.nome, "| CPF:", parte.cpf || "N/I");

    /* PARTE INTERESSADA */
    console.log("🧩 Adicionando Parte Interessada...");
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[name='nome']", { timeout: 20000 });
    await page.type("input[name='nome']", parte.nome, { delay: 75 });
    if (parte.cpf) await page.type("input[name='cpf']", parte.cpf);
    await page.waitForTimeout(500);
    await page.click("button[type='submit']");
    await page.waitForTimeout(2000);
    console.log("✅ Parte Interessada adicionada com sucesso.");

    /* PARTE CONTRÁRIA */
    console.log("🏛️ Adicionando Parte Contrária (INSS - Réu)...");
    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector("input[name='nome']", { timeout: 20000 });
    await page.type("input[name='nome']", "INSS", { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    console.log("✅ Parte Contrária adicionada.");

    /* AÇÃO */
    console.log("📑 Adicionando Ação: Auxílio Acidente...");
    await page.click("a[ng-click='vm.adicionarAcao()']");
    await page.waitForSelector("input[name='acao']", { timeout: 20000 });
    await page.type("input[name='acao']", "Auxílio Acidente", { delay: 75 });
    await page.keyboard.press("Enter");

    /* INSTÂNCIA / FASE / FORO */
    console.log("⚙️ Preenchendo Instância, Fase e Foro...");
    await page.select("#processoInstancia", "1");
    await page.select("#processoFase", "Inicial");
    await page.click("input[ng-model='vm.capa.foro']");
    await page.type("input[ng-model='vm.capa.foro']", "Preencher", { delay: 75 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    /* VALOR DA CAUSA */
    if (valor_causa) {
      console.log("💰 Inserindo Valor da Causa:", valor_causa);
      await page.click("input[ng-model='vm.capa.valorCausa']");
      await page.type("input[ng-model='vm.capa.valorCausa']", valor_causa, {
        delay: 50,
      });
    } else {
      console.log("💰 Valor da Causa vazio — campo ignorado.");
    }

    /* SALVAR */
    console.log("💾 Salvando processo...");
    await page.click("button[ng-click='vm.salvar()']");
    await page.waitForTimeout(5000);
    console.log("✅ Processo cadastrado com sucesso!");

    await browser.close();
    res.json({
      processo,
      originador,
      status: "Cadastro completo",
      mensagem: "Processo cadastrado com sucesso.",
    });
  } catch (err) {
    console.error("❌ Erro no cadastro:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

/* =========================================================
   DEFAULT ROUTE & START
========================================================= */
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
