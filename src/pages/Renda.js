import { abrirModalRenda } from '../components/RendaModal.js';
import { onAuthChange } from '../firebase/auth.js';
import { ouvirRendas } from '../services/rendaService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let rendas = [];
let pararDeOuvir = null;

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Renda</h1>
        <p>Suas fontes de renda mensal, e de quem é cada uma.</p>
      </div>
      <div class="topbar-actions">
        <a href="/index.html" class="icon-btn" title="Contas fixas">🏠</a>
        <a href="/resumo.html" class="icon-btn" title="Resumo do mês">🧮</a>
        <a href="/analises.html" class="icon-btn" title="Análises">📈</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura">💳</a>
        <a href="/parcelamentos.html" class="icon-btn" title="Parcelamentos">📊</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <div class="elevated-card renda-resumo">
      <span class="label" style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-sec); display:block; margin-bottom:6px;">Renda total mensal</span>
      <span class="valor" style="font-weight:800; color:var(--success);" id="renda-total">R$ 0,00</span>
    </div>

    <div class="lista-header">
      <h2>Fontes de renda</h2>
      <button id="btn-nova-renda" class="btn-primary" type="button" disabled>+ Nova renda</button>
    </div>

    <div id="lista-rendas">
      <p class="vazio">Carregando...</p>
    </div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

document.getElementById('btn-nova-renda').onclick = () => {
  if (!uid) return;
  abrirModalRenda(uid);
};

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizar() {
  const rendasAtivas = rendas.filter((r) => r.ativa !== false);
  const total = rendasAtivas.reduce((soma, r) => soma + r.valor, 0);
  document.getElementById('renda-total').textContent = formatarMoeda(total);

  const lista = document.getElementById('lista-rendas');

  if (rendasAtivas.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhuma renda cadastrada ainda. Clique em "+ Nova renda" para começar.</p>';
    return;
  }

  const porDono = {};
  for (const renda of rendasAtivas) {
    if (!porDono[renda.dono]) porDono[renda.dono] = [];
    porDono[renda.dono].push(renda);
  }

  const donos = Object.keys(porDono).sort();
  lista.innerHTML = donos
    .map((dono) => {
      const subtotal = porDono[dono].reduce((soma, r) => soma + r.valor, 0);
      const itens = porDono[dono]
        .map(
          (r) => `
          <div class="elevated-card renda-item" data-id="${r.id}">
            <div>
              <div class="renda-nome">${escapeHTML(r.nome)}</div>
            </div>
            <span class="renda-valor">${formatarMoeda(r.valor)}</span>
          </div>
        `
        )
        .join('');
      return `
        <div class="categoria-grupo">
          <p class="categoria-titulo">${escapeHTML(dono)} · ${formatarMoeda(subtotal)}</p>
          ${itens}
        </div>
      `;
    })
    .join('');

  lista.querySelectorAll('[data-id]').forEach((node) => {
    node.onclick = () => {
      const renda = rendas.find((r) => r.id === node.dataset.id);
      abrirModalRenda(uid, renda);
    };
  });
}

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  document.getElementById('btn-nova-renda').disabled = false;

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirRendas(uid, (novasRendas) => {
    rendas = novasRendas;
    renderizar();
  });
});
