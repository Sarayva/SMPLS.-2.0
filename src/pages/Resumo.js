import { onAuthChange } from '../firebase/auth.js';
import { calcularTotais, mesAtualISO, ouvirContas } from '../services/contasService.js';
import { ouvirFaturas } from '../services/faturasService.js';
import { ouvirParcelamentos } from '../services/parcelamentosService.js';
import { ouvirRendas } from '../services/rendaService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let mesSelecionado = mesAtualISO();
let contas = [];
let faturas = [];
let parcelamentos = [];
let rendas = [];

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Resumo do mês</h1>
        <p>Contas fixas, fatura do cartão e renda, juntos.</p>
      </div>
      <div class="topbar-actions">
        <a href="/index.html" class="icon-btn" title="Contas fixas">🏠</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura">💳</a>
        <a href="/parcelamentos.html" class="icon-btn" title="Parcelamentos">📊</a>
        <a href="/renda.html" class="icon-btn" title="Renda">💰</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <div class="month-nav">
      <button id="mes-anterior" class="icon-btn" type="button">&#8592;</button>
      <input type="month" id="mes-input">
      <button id="mes-proximo" class="icon-btn" type="button">&#8594;</button>
    </div>

    <div id="conteudo"></div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

document.getElementById('mes-input').value = mesSelecionado;
document.getElementById('mes-input').addEventListener('change', (e) => {
  mesSelecionado = e.target.value;
  renderizar();
});
document.getElementById('mes-anterior').onclick = () => mudarMes(-1);
document.getElementById('mes-proximo').onclick = () => mudarMes(1);

function mudarMes(delta) {
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const data = new Date(ano, mes - 1 + delta, 1);
  mesSelecionado = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('mes-input').value = mesSelecionado;
  renderizar();
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizar() {
  const totaisContas = calcularTotais(contas, mesSelecionado);
  const faturaDoMes = faturas.filter((f) => f.competencia === mesSelecionado);
  const totalFatura = faturaDoMes.reduce((soma, f) => soma + (f.valorTotal ?? 0), 0);
  const rendaTotal = rendas.filter((r) => r.ativa !== false).reduce((soma, r) => soma + r.valor, 0);

  const totalDevido = totaisContas.total + totalFatura;
  const saldo = rendaTotal - totalDevido;

  const limiteLiberado = parcelamentos
    .filter((p) => p.mesQuitacaoEstimado === mesSelecionado)
    .reduce((soma, p) => soma + p.valorParcela, 0);

  document.getElementById('conteudo').innerHTML = `
    <div class="elevated-card resumo-saldo ${saldo >= 0 ? 'positivo' : 'negativo'}">
      <span class="rotulo">Saldo do mês</span>
      <span class="valor">${formatarMoeda(saldo)}</span>
    </div>

    <div class="resumo-linhas">
      <div class="elevated-card resumo-linha">
        <span class="rotulo">Renda total</span>
        <span class="valor" style="color:var(--success);">${formatarMoeda(rendaTotal)}</span>
      </div>
      <div class="elevated-card resumo-linha">
        <span class="rotulo">Contas fixas do mês</span>
        <span class="valor">${formatarMoeda(totaisContas.total)}</span>
      </div>
      <div class="elevated-card resumo-linha">
        <span class="rotulo">Fatura do cartão do mês</span>
        <span class="valor">${faturaDoMes.length ? formatarMoeda(totalFatura) : '—'}</span>
      </div>
      <div class="elevated-card resumo-linha total">
        <span class="rotulo">Total devido</span>
        <span class="valor">${formatarMoeda(totalDevido)}</span>
      </div>
    </div>

    <div class="elevated-card resumo-limite">
      <span class="rotulo">Limite do cartão que libera esse mês (parcelas que terminam)</span>
      <span class="valor">${formatarMoeda(limiteLiberado)}</span>
    </div>
  `;
}

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  document.body.dataset.authReady = 'true';

  ouvirContas(user.uid, (novasContas) => {
    contas = novasContas;
    renderizar();
  });
  ouvirFaturas(user.uid, (novasFaturas) => {
    faturas = novasFaturas;
    renderizar();
  });
  ouvirParcelamentos(user.uid, (novosParcelamentos) => {
    parcelamentos = novosParcelamentos;
    renderizar();
  });
  ouvirRendas(user.uid, (novasRendas) => {
    rendas = novasRendas;
    renderizar();
  });
});
