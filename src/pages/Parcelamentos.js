import { onAuthChange } from '../firebase/auth.js';
import { ouvirParcelamentos } from '../services/parcelamentosService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let pararDeOuvir = null;

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Parcelamentos</h1>
        <p>Compras parceladas no cartão, atualizadas a cada fatura importada.</p>
      </div>
      <div class="topbar-actions">
        <a href="/index.html" class="icon-btn" title="Contas fixas">🏠</a>
        <a href="/resumo.html" class="icon-btn" title="Resumo do mês">🧮</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura">💳</a>
        <a href="/renda.html" class="icon-btn" title="Renda">💰</a>
        <a href="/categorias.html" class="icon-btn" title="Categorias">🏷️</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <div id="lista-parcelamentos">
      <p class="vazio">Carregando...</p>
    </div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarCompetencia(competencia) {
  if (!competencia) return '—';
  const [ano, mes] = competencia.split('-');
  const nomesMeses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomesMeses[Number(mes) - 1]}/${ano}`;
}

function renderItem(p) {
  const saldoDevedor = Math.round((p.parcelaTotal - p.parcelaAtual) * p.valorParcela * 100) / 100;
  const progresso = Math.round((p.parcelaAtual / p.parcelaTotal) * 100);

  return `
    <div class="elevated-card parcela-item ${p.quitado ? 'quitado' : ''}">
      <div class="parcela-info">
        <div class="parcela-nome">
          ${escapeHTML(p.descricao)}
          <span class="badge badge-pendente">${escapeHTML(p.categoria)}</span>
        </div>
        <div class="parcela-detalhe">
          Parcela ${p.parcelaAtual}/${p.parcelaTotal} · ${p.quitado ? 'Quitado' : `Quita em ${formatarCompetencia(p.mesQuitacaoEstimado)}`}
        </div>
        <div class="progresso-barra">
          <div class="progresso-preenchido" style="width:${progresso}%;"></div>
        </div>
      </div>
      <div class="parcela-valores">
        <div class="valor-parcela">${formatarMoeda(p.valorParcela)}</div>
        <div class="saldo-devedor">${p.quitado ? 'Sem saldo restante' : `Restam ${formatarMoeda(saldoDevedor)}`}</div>
      </div>
    </div>
  `;
}

function renderizar(parcelamentos) {
  const lista = document.getElementById('lista-parcelamentos');

  if (parcelamentos.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhum parcelamento ainda. Importe uma fatura com compras parceladas.</p>';
    return;
  }

  const ativos = parcelamentos
    .filter((p) => !p.quitado)
    .sort((a, b) => (a.mesQuitacaoEstimado || '').localeCompare(b.mesQuitacaoEstimado || ''));
  const quitados = parcelamentos
    .filter((p) => p.quitado)
    .sort((a, b) => (b.ultimaCompetencia || '').localeCompare(a.ultimaCompetencia || ''));

  let html = '';
  html += '<p class="secao-titulo">Ativos</p>';
  html += ativos.length ? ativos.map(renderItem).join('') : '<p class="vazio">Nenhum parcelamento ativo.</p>';

  if (quitados.length) {
    html += '<p class="secao-titulo">Quitados</p>';
    html += quitados.map(renderItem).join('');
  }

  lista.innerHTML = html;
}

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirParcelamentos(user.uid, renderizar);
});
