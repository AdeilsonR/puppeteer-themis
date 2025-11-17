import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// Função global de log
const log = (msg) =>
  console.log(`📌 ${new Date().toISOString()} | ${msg}`);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const responseError = (res, msg) => res.status(500).json({ erro: msg });

// ====================================================================================
// ENDPOINT: BUSCAR PROCESSO (sem alterações estruturais)
// ====================================================================================

app.post("/buscar-processo", async (req, res) => {
  const { numeroProcesso } = req.body;
  if (!numeroProcesso)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  log(`🔎 Iniciando busca (CNJ: ${numeroProcesso})`);

  try {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/usr/bin/google-chrome-stable",
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await page.click("#btnBuscaProcessos");
    await page.waitForSelector("table.table.vertical-top.table-utilities");

    const resultado = await page.evaluate((numero) => {
      const linhas = document.querySelectorAll("table tbody tr");
      for (const linha of linhas) {
        const cols = [...linha.querySelectorAll("td")].map((x) =>
          x.innerText.trim()
        );
        if (cols.some((c) => c.includes(numero))) {
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

    await browser.close();
    return res.json({ numeroProcesso, resultado });
  } catch (e) {
    return responseError(res, e.message);
  }
});

// ====================================================================================
// ENDPOINT: CADASTRAR PROCESSO (COMPLETO E AJUSTADO)
// ====================================================================================

app.post("/cadastrar-processo", async (req, res) => {
  const { processo, origem, valor_causa, valor_vencidas, valor_vincendas } =
    req.body;

  if (!processo)
    return res.status(400).json({ erro: "Número do processo é obrigatório." });

  log(`🧾 Iniciando cadastro do processo: ${processo}`);

  try {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/usr/bin/google-chrome-stable",
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // LOGIN
    log("🌐 Acessando Themis…");
    await page.goto("https://themia.themisweb.penso.com.br/themia", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("#login");
    await page.type("#login", process.env.THEMIS_LOGIN);
    await page.type("#senha", process.env.THEMIS_SENHA);
    await page.click("#btnLogin");

    await page.waitForNavigation({ waitUntil: "networkidle2" });
    log("✅ Login concluído.");

    // ABRIR LISTA
    log("📂 Abrindo lista de processos…");
    await page.click("#btnBuscaProcessos");
    await page.waitForSelector("table.table.vertical-top.table-utilities");

    // BUSCAR PROCESSO COM O BOTÃO CINZA (STATUS == 1)
    log("🔍 Procurando processo na tabela…");

    const localizado = await page.evaluate((num) => {
      num = num.trim();
      const linhas = document.querySelectorAll(
        "table.table.vertical-top.table-utilities tbody tr"
      );

      for (const linha of linhas) {
        const cols = linha.querySelectorAll("td");
        if (cols.length === 0) continue;

        const numeroLinha = cols[0]?.innerText?.trim() || "";
        const botao = linha.querySelector(
          "i.icon-plus.pointer.btnCadastrarCapa"
        );

        console.log("🧪 linha:", numeroLinha, "btn:", !!botao);

        if (numeroLinha.includes(num) && botao) {
          botao.setAttribute("data-proximo", "true");
          return true;
        }
      }
      return false;
    }, processo);

    if (!localizado) {
      log("⚠ Processo não encontrado ou sem botão de cadastro.");
      await browser.close();
      return res.json({
        processo,
        status: "Ignorado",
        mensagem:
          "Processo não possui botão de cadastro (status != 1).",
      });
    }

    log("➕ Processo localizado — clicando no botão cinza…");

    await page.evaluate(() => {
      const btn = document.querySelector(
        "i.icon-plus.pointer.btnCadastrarCapa[data-proximo='true']"
      );
      btn?.click();
    });

    await delay(2000);

    // SELECIONAR ÁREA
    await page.waitForSelector("#selectArea");
    await page.select("#selectArea", "Previdenciário");
    await page.click("#btnProsseguir");

    await page.waitForNavigation({ waitUntil: "networkidle2" });
    log("📌 Área selecionada.");

    // AUTOCOMPLETE
    async function autocomplete(selector, text) {
      await page.click(selector);
      await page.type(selector, text, { delay: 70 });
      await delay(1200);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }

    await autocomplete("input[ng-model='vm.capa.cliente']", "Themia");
    await autocomplete(
      "input[ng-model='vm.capa.advogadoInteressado']",
      "Bdyone"
    );
    await autocomplete(
      "input[ng-model='vm.capa.originador']",
      origem || "Themia"
    );

    // VALOR DA CAUSA
    if (valor_causa) {
      await page.click("input[ng-model='vm.capa.valorCausa']");
      await page.evaluate(() => {
        const el = document.querySelector(
          "input[ng-model='vm.capa.valorCausa']"
        );
        if (el) el.value = "";
      });
      await page.type(
        "input[ng-model='vm.capa.valorCausa']",
        valor_causa.toString()
      );
    }

    // PARTES
    await autocomplete("a[ng-click='vm.adicionarParteInteressada()']", "");
    await autocomplete("input[ng-model='novaParte.nome']", "Parte Autor");
    await page.select("select[ng-model='novaParte.posicao']", "Autor");

    await autocomplete("a[ng-click='vm.adicionarParteContraria()']", "");
    await autocomplete(
      "input[ng-model='novaParteContraria.nome']",
      "INSS"
    );
    await page.select("select[ng-model='novaParteContraria.posicao']", "Réu");

    await autocomplete("input[ng-model='vm.capa.acao']", "Auxilio Acidente");

    // WORKFLOW DE ANDAMENTOS
    log("📌 Selecionando workflow…");

    await page.waitForSelector(
      "select[ng-model='tipoAndamentoWorkflow']"
    );
    await page.select(
      "select[ng-model='tipoAndamentoWorkflow']",
      "Workflow | Conferir Cadastro"
    );

    // VALORES PERSONALIZADOS (#var9 e #var10)
    if (valor_vencidas) {
      await page.type("#var9", valor_vencidas.toString());
    }
    if (valor_vincendas) {
      await page.type("#var10", valor_vincendas.toString());
    }

    log("💾 Salvando cadastro…");
    await page.click("button[ng-click='vm.salvarProcesso()']");
    await delay(4000);

    await browser.close();

    return res.json({
      processo,
      origem,
      valor_causa,
      status: "Cadastro concluído",
      mensagem: "Processo cadastrado com sucesso!",
    });
  } catch (e) {
    log(`❌ ERRO CRÍTICO cadastro: ${e.message}`);
    return responseError(res, e.message);
  }
});

// ====================================================================================
// STATUS
// ====================================================================================

app.get("/", (req, res) => res.send("🚀 Puppeteer Themis ativo!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Servidor rodando na porta ${PORT}`)
);
