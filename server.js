require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── ID real da planilha ───────────────────────────────────────
const PLANILHA_ID  = process.env.PLANILHA_ID || "1nkWQ23_SQKHa6skmkfjPjZQ-mZ328_79JG_9zXPZRRo";
const NOME_ABA     = process.env.NOME_ABA    || "Janeiro";
const URL_PLANILHA = `https://opensheet.elk.sh/${PLANILHA_ID}/${encodeURIComponent(NOME_ABA)}`;

// ─── Cache 2 minutos ───────────────────────────────────────────
let cache = { dados: null, timestamp: 0 };
const CACHE_TTL = 2 * 60 * 1000;

async function getDados() {
  const agora = Date.now();
  if (cache.dados && agora - cache.timestamp < CACHE_TTL) return cache.dados;
  const res = await fetch(URL_PLANILHA, { timeout: 8000 });
  if (!res.ok) throw new Error(`Planilha respondeu ${res.status}`);
  const dados = await res.json();
  cache = { dados, timestamp: agora };
  return dados;
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", planilha: PLANILHA_ID, aba: NOME_ABA });
});

// ─── Colunas da planilha ───────────────────────────────────────
// A: Código
// B: Empresa
// C: Tipo de amostra
// D: Situação do laudo
// E: Análises a serem realizadas
// F: Situação da análise
// --- Colunas extras sugeridas (adicione na planilha): ---
// G: Resultado
// H: Unidade
// I: Método
// J: Valor de Referência

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

  const linhas = dados.filter(
    r => (r["Código"] || "").trim().toUpperCase() === codigo
  );

  if (linhas.length === 0) {
    return res.status(404).json({ erro: "Código não encontrado" });
  }

  const base = linhas[0];

  const laudo = {
    codigo,
    empresa:     base["Empresa"]           || null,
    tipo:        base["Tipo de amostra"]   || null,
    status:      base["Situação do laudo"] || null,
    data:        base["Data de Entrada"]   || null,
    responsavel: base["Responsável"]       || null,
    analises: linhas.map(r => ({
      nome:       r["Análises a serem realizadas"] || "—",
      status:     r["Situação da análise"]         || null,
      resultado:  r["Resultado"]                   || null,
      unidade:    r["Unidade"]                     || null,
      metodo:     r["Método"]                      || null,
      referencia: r["Valor de Referência"]         || null,
    })),
    pdf: linhas.find(r => r["Link do Laudo"])?.["Link do Laudo"] || null
  };

  return res.json(laudo);
});

app.get("/laudos", async (_req, res) => {
  try {
    const dados   = await getDados();
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
