require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração da planilha
const PLANILHA_ID = process.env.PLANILHA_ID || "1nkWQ23_SQKHa6skmkfjPjZQ-mZ328_79JG_9zXPZRRo";
const NOME_ABA = process.env.NOME_ABA || "Janeiro";
const SHEETS_API_KEY = process.env.SHEETS_API_KEY;

if (!SHEETS_API_KEY) {
  console.error("❌ SHEETS_API_KEY não definida. Defina a variável de ambiente.");
  process.exit(1);
}

const URL_PLANILHA = `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_ID}/values/${encodeURIComponent(NOME_ABA)}?key=${SHEETS_API_KEY}`;

let cache = { dados: null, timestamp: 0 };
const CACHE_TTL = 2 * 60 * 1000;

async function getDados() {
  const agora = Date.now();
  if (cache.dados && agora - cache.timestamp < CACHE_TTL) return cache.dados;

  try {
    const res = await fetch(URL_PLANILHA, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Planilha respondeu ${res.status}`);
    const data = await res.json();

    if (!data.values || data.values.length < 2) throw new Error("Planilha sem dados");

    const headers = data.values[0];
    const rows = data.values.slice(1);
    const dadosFormatados = rows.map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] || null;
      });
      return obj;
    });

    cache = { dados: dadosFormatados, timestamp: agora };
    return dadosFormatados;
  } catch (error) {
    console.error("Erro ao buscar planilha:", error.message);
    throw error;
  }
}

process.on("uncaughtException", (err) => {
  console.error("❌ Exceção não capturada:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada não tratada:", reason);
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${req.method} ${req.path}`);
  next();
});

app.get("/api/status", (_req, res) => {
  res.json({ status: "ok", planilha: PLANILHA_ID, aba: NOME_ABA });
});

app.get("/laudo/:codigo", async (req, res) => {
  const codigo = req.params.codigo.trim().toUpperCase();
  if (!codigo) return res.status(400).json({ erro: "Código não informado" });

  let dados;
  try {
    dados = await getDados();
  } catch (e) {
    console.error("Erro planilha:", e.message);
    return res.status(502).json({ erro: "Não foi possível acessar a planilha." });
  }

  const linhas = dados.filter(r => (r["Código"] || "").trim().toUpperCase() === codigo);
  if (linhas.length === 0) {
    return res.status(404).json({ erro: "Código não encontrado" });
  }

  const base = linhas[0];

  // Mapeamento dos campos da planilha para o objeto do laudo
  const laudo = {
    codigo: base["Código"] || codigo,
    empresa: base["Empresa"] || null,
    solicitante: base["Solicitante"] || base["Empresa"] || null,
    responsavelTecnico: base["Responsável Técnico"] || base["Responsável"] || null,
    dataRecebimento: base["Data de Recebimento"] || base["Data de Entrada"] || null,
    dataEntrega: base["Data de Entrega"] || null,
    amostra: base["Amostra"] || base["Tipo de amostra"] || null,
    codigoProduto: base["Código do Produto"] || base["Código"] || codigo,
    validade: base["Validade"] || null,
    lote: base["Lote"] || null,
    status: base["Situação do laudo"] || null,
    assinante: base["Assinante"] || "Dra. Luiza H. Meller da Silva",
    analises: linhas.map(r => ({
      nome: r["Análise"] || r["Análises a serem realizadas"] || "—",
      status: r["Situação da análise"] || null,
      resultado: r["Resultado"] || null,
      unidade: r["Unidade"] || null,
      metodo: r["Método"] || null,
      referencia: r["Valor de Referência"] || null,
    })),
    pdf: linhas.find(r => r["Link do Laudo"])?.["Link do Laudo"] || null,
  };

  return res.json(laudo);
});

app.get("/laudos", async (_req, res) => {
  try {
    const dados = await getDados();
    const codigos = [...new Set(dados.map(d => d["Código"]).filter(Boolean))];
    res.json({ total: codigos.length, aba: NOME_ABA, codigos });
  } catch (e) {
    res.status(502).json({ erro: "Erro ao acessar a planilha" });
  }
});

app.listen(PORT, () => {
  console.log(`\n🔬 Portal de Laudos API`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Planilha: ${PLANILHA_ID}`);
  console.log(`   Aba:      ${NOME_ABA}\n`);
});