const API_BASE = "https://portal-laudos-production.up.railway.app";

// ─── Loading ──────────────────────────────────────────────────
function setLoading(on) {
  const btn     = document.getElementById("btnBuscar");
  const spinner = document.getElementById("btnSpinner");
  const text    = btn.querySelector(".btn-text");
  btn.disabled = on;
  spinner.classList.toggle("active", on);
  text.classList.toggle("hidden", on);
}

// ─── Helpers de status ────────────────────────────────────────
function statusAnalise(s) {
  if (!s) return { cls: "pend", label: "Pendente" };
  const l = s.toLowerCase();
  if (l.includes("conclu") || l.includes("ok") || l.includes("entregue")) return { cls: "ok",   label: s };
  if (l.includes("andamento") || l.includes("processo") || l.includes("análise"))  return { cls: "wip",  label: s };
  return { cls: "pend", label: s };
}

function badgeClass(status) {
  if (!status) return "status-wip";
  const l = status.toLowerCase();
  return (l.includes("entregue") || l.includes("conclu")) ? "status-ok" : "status-wip";
}

// ─── Abrir laudo para impressão/PDF ───────────────────────────
function abrirLaudo(data) {
  // Codifica os dados em base64 e passa para laudo.html via URL
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const win = window.open(`laudo.html?dados=${encoded}`, "_blank");
  // Fallback: postMessage caso a janela já esteja aberta
  if (win) {
    win.addEventListener("load", () => {
      win.postMessage({ laudo: data }, "*");
    });
  }
}

// ─── Renderizadores de estado ─────────────────────────────────
function renderErro(msg) {
  return `
    <div class="error-state">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="10" y1="6" x2="10" y2="10.5" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="10" cy="13.5" r="0.75" fill="#ef4444"/>
      </svg>
      ${msg}
    </div>`;
}

function renderVazio(codigo) {
  return `
    <div class="empty-state">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="#f59e0b" stroke-width="1.5"/>
        <line x1="10" y1="6" x2="10" y2="11" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="10" cy="13.5" r="0.75" fill="#f59e0b"/>
      </svg>
      Código <strong style="margin:0 4px;font-family:var(--mono)">${codigo}</strong> não encontrado. Verifique e tente novamente.
    </div>`;
}

function renderCard(data) {
  const analises = (data.analises || []).map(a => {
    const { cls, label } = statusAnalise(a.status);
    const temResultado = a.resultado;
    return `
      <div class="analise-item">
        <div>
          <span class="analise-nome">${a.nome || "—"}</span>
          ${temResultado ? `<span class="analise-resultado">${a.resultado}${a.unidade ? ' ' + a.unidade : ''}</span>` : ''}
        </div>
        <span class="analise-status ${cls}">${label}</span>
      </div>`;
  }).join("");

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-codigo">${data.codigo}</div>
          <div class="card-empresa">${data.empresa || "—"}</div>
        </div>
        <span class="status-badge ${badgeClass(data.status)}">${data.status || "Em análise"}</span>
      </div>

      <div class="card-body">
        <div class="meta-grid">
          <div class="meta-item">
            <label>Tipo de Amostra</label>
            <span>${data.tipo || "—"}</span>
          </div>
          ${data.data ? `<div class="meta-item"><label>Data de Entrada</label><span>${data.data}</span></div>` : ""}
          ${data.responsavel ? `<div class="meta-item"><label>Responsável</label><span>${data.responsavel}</span></div>` : ""}
        </div>

        <p class="analises-titulo">Análises (${data.analises?.length || 0})</p>
        ${analises || '<p style="color:var(--muted);font-size:14px">Nenhuma análise registrada.</p>'}
      </div>

      <div class="card-footer">
        <button class="btn-imprimir" onclick='abrirLaudo(${JSON.stringify(data)})'>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="2" y="1" width="11" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="4" y="7" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
            <line x1="5" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="5" y1="12" x2="8"  y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
          Imprimir / Salvar PDF
        </button>
        ${data.pdf ? `<a href="${data.pdf}" target="_blank" rel="noopener" class="btn-pdf">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="0.5" width="8" height="11" rx="1.2" stroke="currentColor" stroke-width="1.1"/>
            <line x1="3.5" y1="3.5" x2="7" y2="3.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <line x1="3.5" y1="5.5" x2="8.5" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
          </svg>
          PDF anexo
        </a>` : ""}
      </div>
    </div>`;
}

// ─── Busca principal ──────────────────────────────────────────
async function buscar() {
  const input        = document.getElementById("codigo");
  const resultadoDiv = document.getElementById("resultado");
  const codigo       = input.value.trim().toUpperCase();

  if (!codigo) {
    input.focus();
    document.getElementById("searchBox").style.borderColor = "var(--err)";
    setTimeout(() => document.getElementById("searchBox").style.borderColor = "", 1200);
    return;
  }

  setLoading(true);
  resultadoDiv.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/laudo/${encodeURIComponent(codigo)}`);
    if (res.status === 404) { resultadoDiv.innerHTML = renderVazio(codigo); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    resultadoDiv.innerHTML = renderCard(data);
  } catch (e) {
    console.error(e);
    resultadoDiv.innerHTML = renderErro("Não foi possível conectar ao servidor. Tente novamente.");
  } finally {
    setLoading(false);
  }
}

// ─── Enter para buscar ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("codigo").addEventListener("keydown", e => {
    if (e.key === "Enter") buscar();
  });
});
