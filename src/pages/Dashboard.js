import { abrirModalConta } from '../components/ContaModal.js';
import { onAuthChange, signOut } from '../firebase/auth.js';
import { buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { desmarcarPago, marcarPago, mesAtualISO, ouvirContas, statusConta } from '../services/contasService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let contas = [];
let categoriasContas = [];
let pararDeOuvir = null;
let mesSelecionado = mesAtualISO();

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1 id="saudacao">Olá 👋</h1>
        <p>Suas contas fixas, organizadas por mês.</p>
      </div>
      <div class="topbar-actions">
        <a href="/resumo.html" class="icon-btn" title="Resumo do mês">🧮</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura de cartão">💳</a>
        <a href="/parcelamentos.html" class="icon-btn" title="Parcelamentos">📊</a>
        <a href="/renda.html" class="icon-btn" title="Renda">💰</a>
        <a href="/analises.html" class="icon-btn" title="Análises">📈</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
        <button id="btn-sair" class="icon-btn" title="Sair" type="button">⏻</button>
      </div>
    </div>

    <div class="month-nav">
      <button id="mes-anterior" class="icon-btn" type="button">&#8592;</button>
      <input type="month" id="mes-input">
      <button id="mes-proximo" class="icon-btn" type="button">&#8594;</button>
    </div>

    <div class="resumo">
      <div class="elevated-card resumo-card">
        <span class="label">Total do mês</span>
        <span class="valor" id="resumo-total">R$ 0,00</span>
      </div>
      <div class="elevated-card resumo-card resumo-pago">
        <span class="label">Pago</span>
        <span class="valor" id="resumo-pago">R$ 0,00</span>
      </div>
      <div class="elevated-card resumo-card resumo-pendente">
        <span class="label">Pendente</span>
        <span class="valor" id="resumo-pendente">R$ 0,00</span>
      </div>
      <div class="elevated-card resumo-card resumo-atrasado">
        <span class="label">Atrasado</span>
        <span class="valor" id="resumo-atrasado">R$ 0,00</span>
      </div>
    </div>

    <div class="lista-header">
      <h2>Suas contas</h2>
      <button id="btn-nova-conta" class="btn-primary" type="button">+ Nova conta</button>
    </div>

    <div id="lista-contas">
      <p class="vazio">Carregando...</p>
    </div>
  </div>
`;

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizar() {
  const contasAtivas = contas.filter((c) => c.ativa !== false);

  let total = 0;
  let pago = 0;
  let pendente = 0;
  let atrasado = 0;
  const porCategoria = {};

  for (const conta of contasAtivas) {
    const status = statusConta(conta, mesSelecionado);
    if (status === 'pago') {
      const valorPago = conta.pagamentos?.[mesSelecionado]?.valorPago ?? conta.valor ?? 0;
      total += valorPago;
      pago += valorPago;
    } else {
      total += conta.valor ?? 0;
      if (status === 'atrasado') atrasado += conta.valor ?? 0;
      else pendente += conta.valor ?? 0;
    }

    if (!porCategoria[conta.categoria]) porCategoria[conta.categoria] = [];
    porCategoria[conta.categoria].push(conta);
  }

  document.getElementById('resumo-total').textContent = formatarMoeda(total);
  document.getElementById('resumo-pago').textContent = formatarMoeda(pago);
  document.getElementById('resumo-pendente').textContent = formatarMoeda(pendente);
  document.getElementById('resumo-atrasado').textContent = formatarMoeda(atrasado);

  const listaEl = document.getElementById('lista-contas');

  if (contasAtivas.length === 0) {
    listaEl.innerHTML = '<p class="vazio">Nenhuma conta cadastrada ainda. Clique em "+ Nova conta" para começar.</p>';
    return;
  }

  const categorias = Object.keys(porCategoria).sort();
  listaEl.innerHTML = categorias
    .map((categoria) => {
      const itens = porCategoria[categoria]
        .sort((a, b) => a.diaVencimento - b.diaVencimento)
        .map(renderConta)
        .join('');
      return `
        <div class="categoria-grupo">
          <p class="categoria-titulo">${escapeHTML(categoria)}</p>
          ${itens}
        </div>
      `;
    })
    .join('');
}

function renderConta(conta) {
  const status = statusConta(conta, mesSelecionado);
  const texto = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' }[status];

  let valorTexto;
  if (status === 'pago') {
    valorTexto = formatarMoeda(conta.pagamentos?.[mesSelecionado]?.valorPago ?? conta.valor ?? 0);
  } else if (conta.valor == null) {
    valorTexto = 'Valor a definir';
  } else {
    valorTexto = formatarMoeda(conta.valor);
  }

  return `
    <div class="elevated-card conta-item">
      <button class="conta-check ${status === 'pago' ? 'pago' : ''}" data-id="${conta.id}" title="Marcar pago/pendente">
        ${status === 'pago' ? '✓' : ''}
      </button>
      <div class="conta-info" data-edit-id="${conta.id}">
        <div class="conta-nome">${escapeHTML(conta.nome)}</div>
        <div class="conta-detalhe">Vence dia ${conta.diaVencimento}</div>
      </div>
      <span class="badge badge-${status}">${texto}</span>
      <span class="conta-valor">${valorTexto}</span>
    </div>
  `;
}

function mudarMes(delta) {
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const data = new Date(ano, mes - 1 + delta, 1);
  mesSelecionado = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('mes-input').value = mesSelecionado;
  renderizar();
}

document.getElementById('mes-input').value = mesSelecionado;
document.getElementById('mes-input').addEventListener('change', (e) => {
  mesSelecionado = e.target.value;
  renderizar();
});
document.getElementById('mes-anterior').onclick = () => mudarMes(-1);
document.getElementById('mes-proximo').onclick = () => mudarMes(1);

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

document.getElementById('btn-sair').onclick = () => signOut();

document.getElementById('btn-nova-conta').disabled = true;
document.getElementById('btn-nova-conta').onclick = async () => {
  if (!uid) return;
  categoriasContas = await buscarCategorias(uid, 'contas');
  abrirModalConta(uid, null, categoriasContas);
};

document.getElementById('lista-contas').addEventListener('click', async (e) => {
  if (!uid) return;

  const check = e.target.closest('[data-id]');
  if (check) {
    const conta = contas.find((c) => c.id === check.dataset.id);
    const status = statusConta(conta, mesSelecionado);
    if (status === 'pago') {
      await desmarcarPago(uid, conta.id, mesSelecionado);
    } else if (conta.valor == null) {
      const digitado = prompt(`Qual foi o valor de "${conta.nome}" neste mês?`);
      if (digitado === null) return;
      const valor = Number(digitado.replace(',', '.'));
      if (!Number.isFinite(valor) || valor < 0) {
        alert('Valor inválido.');
        return;
      }
      await marcarPago(uid, conta.id, mesSelecionado, valor);
    } else {
      await marcarPago(uid, conta.id, mesSelecionado, conta.valor);
    }
    return;
  }

  const info = e.target.closest('[data-edit-id]');
  if (info) {
    const conta = contas.find((c) => c.id === info.dataset.editId);
    categoriasContas = await buscarCategorias(uid, 'contas');
    abrirModalConta(uid, conta, categoriasContas);
  }
});

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  const primeiroNome = (user.displayName || '').split(' ')[0];
  document.getElementById('saudacao').textContent = primeiroNome ? `Olá, ${primeiroNome} 👋` : 'Olá 👋';

  await garantirCategoriasPadrao(uid);
  categoriasContas = await buscarCategorias(uid, 'contas');

  document.getElementById('btn-nova-conta').disabled = false;
  document.body.dataset.authReady = 'true';

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirContas(uid, (novasContas) => {
    contas = novasContas;
    renderizar();
  });
});
