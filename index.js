import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";

const app = express();
app.use(express.json());

// ==============================
// ENDPOINT: BUSCAR PROCESSO
// ==============================
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

    console.log("🌐 Acessando página de login...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    console.log("🔑 Efetuando login...");
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("✅ Login efetuado com sucesso!");

    console.log("📂 Acessando tela de busca de processos...");
    await page.waitForSelector("a[title='Buscar processo'], i.fa-search", { timeout: 30000 });
    await page.click("a[title='Buscar processo'], i.fa-search");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("table.table.vertical-top.table-utilities tbody tr", { timeout: 60000 });
    console.log("📋 Tela de resultados carregada!");

    console.log("🔍 Procurando processo na tabela...");
    const resultado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      if (!linhas.length)
        return "Nenhum resultado encontrado na tabela principal.";

      for (const linha of linhas) {
        const colunas = [...linha.querySelectorAll("td")].map((td) =>
          td.innerText.trim()
        );
        const numeroColuna = colunas[0];
        const tipo = colunas[1];
        const ultimaAtualizacao = colunas[3];
        const status = colunas[colunas.length - 1];

        if (numeroColuna?.includes(numero)) {
          return {
            numero: numeroColuna || "N/I",
            tipo: tipo || "N/I",
            ultimaAtualizacao: ultimaAtualizacao || "N/I",
            status: status || "N/I",
          };
        }
      }
      return "Nenhum resultado encontrado na tabela principal.";
    }, numeroProcesso);

    await browser.close();
    console.log("📄 Resultado obtido:", resultado);
    res.json([{ numeroProcesso, resultado }]);
  } catch (err) {
    console.error("❌ Erro na automação:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ==============================
// ENDPOINT: CADASTRAR PROCESSO
// ==============================
app.post("/cadastrar-processo", async (req, res) => {
  const { processo, origem, valor_causa } = req.body;

  if (!processo) {
    return res.status(400).json({ erro: "Número do processo é obrigatório." });
  }

  console.log("🧾 Iniciando cadastro do processo:", processo);

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

    // 1️⃣ LOGIN
    console.log("🌐 Acessando Themis...");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    console.log("🔑 Efetuando login...");
    await page.type("#login", process.env.THEMIS_LOGIN, { delay: 50 });
    await page.type("#senha", process.env.THEMIS_SENHA, { delay: 50 });
    await page.click("#btnLogin");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("✅ Login efetuado com sucesso.");

    // 2️⃣ BUSCA E LOCALIZAÇÃO
    console.log("📡 Acessando tela de busca de processos...");
    await page.waitForSelector("a[title='Buscar processo'], i.fa-search", { timeout: 20000 });
    await page.click("a[title='Buscar processo'], i.fa-search");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("table.table.vertical-top.table-utilities tbody tr", { timeout: 60000 });
    console.log("📋 Tela de resultados carregada.");

    console.log(`🔍 Procurando processo ${processo} com status 'Pronto para cadastro'...`);
    const processoLocalizado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table.table.vertical-top.table-utilities tbody tr");
      for (const linha of linhas) {
        const colunas = [...linha.querySelectorAll("td")].map(td => td.innerText.trim());
        const numeroColuna = colunas[0];
        const status = colunas[colunas.length - 1] || "";

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
    }, processo);

    if (!processoLocalizado) {
      console.log("⚠️ Processo não encontrado ou não está 'Pronto para cadastro'.");
      await browser.close();
      return res.json({
        processo,
        status: "Ignorado",
        mensagem: "Processo não encontrado ou não está pronto para cadastro.",
      });
    }

    // 3️⃣ ABRE CADASTRO
    console.log("➕ Clicando no botão de cadastro...");
    await page.evaluate(() => {
      const botao = document.querySelector(".btnCadastrarCapa[data-encontrado='true']");
      if (botao) botao.click();
    });

    // 4️⃣ SELECIONA ÁREA
    console.log("📋 Selecionando área 'Previdenciário'...");
    await page.waitForSelector("#selectArea", { timeout: 20000 });
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("✅ Área selecionada e cadastro iniciado.");

    // 5️⃣ CAMPOS GERAIS
    console.log("👤 Cliente: Themia");
    await page.click("input[ng-model='vm.capa.cliente']");
    await page.type("input[ng-model='vm.capa.cliente']", "Themia", { delay: 100 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("⚖️ Advogado Interessado: Nathalia");
    await page.click("input[ng-model='vm.capa.advogadoInteressado']");
    await page.type("input[ng-model='vm.capa.advogadoInteressado']", "Nathalia", { delay: 100 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("🧭 Originador:", origem);
    await page.click("input[ng-model='vm.capa.originador']");
    await page.type("input[ng-model='vm.capa.originador']", origem || "Themia", { delay: 75 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    if (valor_causa) {
      console.log("💰 Valor da Causa:", valor_causa);
      await page.click("input[ng-model='vm.capa.valorCausa']");
      await page.evaluate(() => {
        const input = document.querySelector("input[ng-model='vm.capa.valorCausa']");
        if (input) input.value = "";
      });
      await page.type("input[ng-model='vm.capa.valorCausa']", valor_causa.toString(), { delay: 75 });
    }

    // 6️⃣ PARTE INTERESSADA / CONTRÁRIA / DEMAIS CAMPOS
    console.log("👥 Parte Interessada (Autor)...");
    await page.click("a[ng-click='vm.adicionarParteInteressada()']");
    await page.waitForSelector("input[ng-model='novaParte.nome']", { timeout: 20000 });
    await page.type("input[ng-model='novaParte.nome']", "Parte Autor", { delay: 100 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    console.log("🏛️ Parte Contrária (INSS)...");
    await page.click("a[ng-click='vm.adicionarParteContraria()']");
    await page.waitForSelector("input[ng-model='novaParteContraria.nome']", { timeout: 20000 });
    await page.type("input[ng-model='novaParteContraria.nome']", "INSS", { delay: 100 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    console.log("📚 Ação: Auxílio Acidente");
    await page.click("input[ng-model='vm.capa.acao']");
    await page.type("input[ng-model='vm.capa.acao']", "Auxilio Acidente", { delay: 100 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("🏛️ Instância: 1ª Instância");
    await page.select("select[ng-model='vm.capa.instancia']", "1ª Instância");

    console.log("📘 Fase: Inicial");
    await page.select("#processoFase", "Inicial");

    console.log("📍 Foro: Preencher");
    await page.click("input[ng-model='vm.capa.foro']");
    await page.type("input[ng-model='vm.capa.foro']", "Preencher", { delay: 100 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // 7️⃣ SALVAR
    console.log("💾 Salvando processo...");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await page.waitForTimeout(5000);
    console.log("✅ Cadastro finalizado com sucesso!");

    await browser.close();
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
  }
});

// ==============================
// STATUS SERVER
// ==============================
app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo no Render!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Servidor rodando na porta ${PORT}`)
);
