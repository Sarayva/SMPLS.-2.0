import { abrirModalConta } from '../components/ContaModal.js';
import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { PADRAO_CONTAS, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { desmarcarPago, marcarPago, mesAtualISO, ouvirContas, salvarConta, statusConta } from '../services/contasService.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let contas = [];
let categoriasContas = [];
let pararDeOuvir = null;
let mesSelecionado = mesAtualISO();
let proximoValorParaFocar = null;

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('contas')}

    <main class="painel-conteudo">
    <div class="page">
    <div class="topbar">
      <div>
        <h1>Contas fixas</h1>
        <p>Suas contas fixas, organizadas por mês.</p>
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
      <div style="display:flex; gap:8px;">
        <a href="/importar-contas.html" class="btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center;">Importar planilha</a>
        <button id="btn-nova-conta" class="btn-primary" type="button">+ Nova conta</button>
      </div>
    </div>

    <datalist id="lista-categorias-inline"></datalist>

    <div id="lista-contas">
      <p class="vazio">Carregando...</p>
    </div>
    </div>
    </main>
  </div>
`;

ligarSidebar();

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

  if (proximoValorParaFocar) {
    const idParaFocar = proximoValorParaFocar;
    proximoValorParaFocar = null;
    const el = listaEl.querySelector(`.conta-valor-editavel[data-valor-conta-id="${idParaFocar}"]`);
    if (el) editarValorContaInline(el);
  }
}

function renderConta(conta) {
  const status = statusConta(conta, mesSelecionado);
  const texto = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' }[status];
  const valorEditavel = status !== 'pago' && conta.valor != null;

  let valorTexto;
  if (status === 'pago') {
    valorTexto = formatarMoeda(conta.pagamentos?.[mesSelecionado]?.valorPago ?? conta.valor ?? 0);
  } else if (conta.valor == null) {
    valorTexto = 'Valor a definir';
  } else {
    valorTexto = formatarMoeda(conta.valor);
  }

  const valorHTML = valorEditavel
    ? `<span class="conta-valor conta-valor-editavel" data-valor-conta-id="${conta.id}" title="Clique para editar">${valorTexto}</span>`
    : `<span class="conta-valor">${valorTexto}</span>`;

  return `
    <div class="elevated-card conta-item">
      <button class="conta-check ${status === 'pago' ? 'pago' : ''}" data-id="${conta.id}" title="Marcar pago/pendente">
        ${status === 'pago' ? '✓' : ''}
      </button>
      <div class="conta-info" data-edit-id="${conta.id}">
        <div class="conta-nome">${escapeHTML(conta.nome)}</div>
        <div class="conta-detalhe">
          Vence dia ${conta.diaVencimento} ·
          <button class="badge badge-categoria-conta" data-categoria-conta-id="${conta.id}" title="Clique para mudar a categoria">${escapeHTML(conta.categoria)}</button>
        </div>
      </div>
      <span class="badge badge-${status}">${texto}</span>
      ${valorHTML}
    </div>
  `;
}

function atualizarDatalistCategorias() {
  document.getElementById('lista-categorias-inline').innerHTML = categoriasContas
    .map((c) => `<option value="${escapeHTML(c.nome)}">`)
    .join('');
}

function editarCategoriaContaInline(botao) {
  const contaId = botao.dataset.categoriaContaId;
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) return;

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.setAttribute('list', 'lista-categorias-inline');
  campo.value = conta.categoria;
  campo.className = 'campo-categoria-inline';
  botao.replaceWith(campo);
  campo.focus();
  campo.select();

  let resolvido = false;
  async function salvar() {
    if (resolvido) return;
    resolvido = true;
    const nova = campo.value.trim();
    if (nova && nova !== conta.categoria) {
      const conhecidas = new Set((categoriasContas.length ? categoriasContas.map((c) => c.nome) : PADRAO_CONTAS).map((c) => c.toLowerCase()));
      if (!conhecidas.has(nova.toLowerCase())) {
        await adicionarCategoria(uid, 'contas', nova);
        categoriasContas = await buscarCategorias(uid, 'contas');
        atualizarDatalistCategorias();
      }
      await salvarConta(uid, { categoria: nova }, conta.id);
    } else {
      renderizar();
    }
  }

  campo.addEventListener('blur', salvar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') campo.blur();
    if (e.key === 'Escape') {
      resolvido = true;
      renderizar();
    }
  });
}

function editarValorContaInline(spanEl) {
  const contaId = spanEl.dataset.valorContaId;
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) return;

  const itens = Array.from(document.querySelectorAll('.conta-valor-editavel'));
  const idxAtual = itens.findIndex((el) => el.dataset.valorContaId === contaId);
  const proximoEl = itens[idxAtual + 1];
  const proximoContaId = proximoEl ? proximoEl.dataset.valorContaId : null;

  const campo = document.createElement('input');
  campo.type = 'number';
  campo.step = '0.01';
  campo.min = '0';
  campo.value = conta.valor;
  campo.className = 'campo-valor-inline';
  spanEl.replaceWith(campo);
  campo.focus();
  campo.select();

  let resolvido = false;
  async function salvar(avancarPara) {
    if (resolvido) return;
    resolvido = true;
    const novo = Number(campo.value);
    const mudou = Number.isFinite(novo) && novo >= 0 && novo !== conta.valor;

    if (mudou) {
      proximoValorParaFocar = avancarPara;
      await salvarConta(uid, { valor: novo }, conta.id);
    } else if (avancarPara) {
      renderizar();
      const el = document.querySelector(`.conta-valor-editavel[data-valor-conta-id="${avancarPara}"]`);
      if (el) editarValorContaInline(el);
    } else {
      renderizar();
    }
  }

  campo.addEventListener('blur', () => salvar(null));
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      salvar(proximoContaId);
    }
    if (e.key === 'Escape') {
      resolvido = true;
      renderizar();
    }
  });
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

document.getElementById('btn-nova-conta').disabled = true;
document.getElementById('btn-nova-conta').onclick = async () => {
  if (!uid) return;
  categoriasContas = await buscarCategorias(uid, 'contas');
  abrirModalConta(uid, null, categoriasContas);
};

document.getElementById('lista-contas').addEventListener('click', async (e) => {
  if (!uid) return;

  const badgeCategoria = e.target.closest('[data-categoria-conta-id]');
  if (badgeCategoria) {
    editarCategoriaContaInline(badgeCategoria);
    return;
  }

  const valorEditavel = e.target.closest('[data-valor-conta-id]');
  if (valorEditavel) {
    editarValorContaInline(valorEditavel);
    return;
  }

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
  atualizarPerfilSidebar(user.displayName);

  await garantirCategoriasPadrao(uid);
  categoriasContas = await buscarCategorias(uid, 'contas');
  atualizarDatalistCategorias();

  document.getElementById('btn-nova-conta').disabled = false;
  document.body.dataset.authReady = 'true';

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirContas(uid, (novasContas) => {
    contas = novasContas;
    renderizar();
  });
});
