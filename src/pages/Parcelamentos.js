import { onAuthChange } from '../firebase/auth.js';
import { PADRAO_CARTAO, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import {
  atualizarCategoriaParcelamento,
  encontrarDuplicatas,
  mesclarDuplicata,
  ouvirParcelamentos,
} from '../services/parcelamentosService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let pararDeOuvir = null;
let categoriasCartao = [];
let parcelamentosAtuais = [];

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
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <datalist id="lista-categorias-cartao"></datalist>

    <div id="aviso-duplicatas"></div>

    <div id="lista-parcelamentos">
      <p class="vazio">Carregando...</p>
    </div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

document.getElementById('lista-parcelamentos').addEventListener('click', (e) => {
  const badge = e.target.closest('.badge-categoria');
  if (badge && uid) editarCategoriaInline(badge);
});

function editarCategoriaInline(badge) {
  const parcelamentoId = badge.dataset.categoriaId;
  const parcelamento = parcelamentosAtuais.find((p) => p.id === parcelamentoId);
  if (!parcelamento) return;

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.setAttribute('list', 'lista-categorias-cartao');
  campo.value = parcelamento.categoria;
  campo.className = 'campo-categoria-inline';
  badge.replaceWith(campo);
  campo.focus();
  campo.select();

  let salvo = false;
  async function salvar() {
    if (salvo) return;
    salvo = true;
    const nova = campo.value.trim();
    if (nova && nova !== parcelamento.categoria) {
      const conhecidas = (categoriasCartao.length ? categoriasCartao.map((c) => c.nome) : PADRAO_CARTAO).map((c) => c.toLowerCase());
      if (!conhecidas.includes(nova.toLowerCase())) {
        await adicionarCategoria(uid, 'cartao', nova);
        categoriasCartao = await buscarCategorias(uid, 'cartao');
      }
      await atualizarCategoriaParcelamento(uid, parcelamento.id, nova);
    }
  }

  campo.addEventListener('blur', salvar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') campo.blur();
    if (e.key === 'Escape') {
      salvo = true;
      campo.replaceWith(badge);
    }
  });
}

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
          <span class="badge badge-pendente badge-categoria" data-categoria-id="${p.id}" title="Clique para mudar a categoria">${escapeHTML(p.categoria)}</span>
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

function renderAvisoDuplicatas(parcelamentos) {
  const avisoEl = document.getElementById('aviso-duplicatas');
  const duplicatas = encontrarDuplicatas(parcelamentos);

  if (duplicatas.length === 0) {
    avisoEl.innerHTML = '';
    return;
  }

  avisoEl.innerHTML = `
    <div class="elevated-card aviso-duplicatas">
      <span>Encontrei ${duplicatas.length} compra(s) que parecem estar duplicadas (registradas em duas linhas por engano, de uma versão anterior do app).</span>
      <button id="btn-corrigir-duplicatas" class="btn-secondary" type="button">Corrigir</button>
    </div>
  `;

  document.getElementById('btn-corrigir-duplicatas').onclick = async () => {
    const nomes = duplicatas.map((grupo) => `"${grupo[0].descricao}"`).join(', ');
    if (!confirm(`Vou juntar essas compras em uma linha só, mantendo a parcela mais avançada de cada uma: ${nomes}. Confirma?`)) return;

    const botao = document.getElementById('btn-corrigir-duplicatas');
    botao.disabled = true;
    botao.textContent = 'Corrigindo...';
    for (const grupo of duplicatas) {
      await mesclarDuplicata(uid, grupo);
    }
  };
}

function renderizar(parcelamentos) {
  parcelamentosAtuais = parcelamentos;
  renderAvisoDuplicatas(parcelamentos);
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

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  await garantirCategoriasPadrao(uid);
  categoriasCartao = await buscarCategorias(uid, 'cartao');
  document.getElementById('lista-categorias-cartao').innerHTML = categoriasCartao
    .map((c) => `<option value="${escapeHTML(c.nome)}">`)
    .join('');

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirParcelamentos(uid, renderizar);
});
