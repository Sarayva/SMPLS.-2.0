import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { calcularMediaGastoCartao } from '../services/analisesService.js';
import { mesAtualISO, ouvirContas } from '../services/contasService.js';
import { ouvirFaturas } from '../services/faturasService.js';
import { ouvirParcelamentos } from '../services/parcelamentosService.js';
import { ouvirRendas } from '../services/rendaService.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

const NOMES_MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const QTD_MESES = 6;

let contas = [];
let parcelamentos = [];
let rendas = [];
let faturas = [];

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('planejamento')}

    <main class="painel-conteudo">
      <div class="painel-topo">
        <h1>Planejamento</h1>
        <p>O que você já sabe que vai pagar nos próximos meses — pra se programar antes de apertar.</p>
      </div>

      <div class="elevated-card painel-card planejamento-aviso">
        Isso mostra contas fixas e parcelas já compromissadas (certas), mais uma estimativa de gastos variáveis no cartão baseada no seu histórico de faturas. Como a estimativa é uma média, o valor real de cada mês pode ficar acima ou abaixo dela.
      </div>

      <div id="planejamento-corpo">
        <p class="vazio">Carregando...</p>
      </div>
    </main>
  </div>
`;

ligarSidebar();

function formatarMoeda(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMesCurto(mes) {
  const [ano, m] = mes.split('-');
  return `${NOMES_MESES[Number(m) - 1]}/${ano.slice(2)}`;
}

function proximosMeses(qtd) {
  const [anoAtual, mesAtual] = mesAtualISO().split('-').map(Number);
  const meses = [];
  for (let i = 0; i < qtd; i++) {
    const data = new Date(anoAtual, mesAtual - 1 + i, 1);
    meses.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

function calcularProjecao(mes, mediaGastoCartao) {
  const contasAtivas = contas.filter((c) => c.ativa !== false);
  const contasComValor = contasAtivas.filter((c) => c.valor != null);
  const contasSemValor = contasAtivas.filter((c) => c.valor == null);
  const totalContasFixas = contasComValor.reduce((s, c) => s + c.valor, 0);

  const parcelasAtivas = parcelamentos.filter((p) => !p.quitado && p.mesQuitacaoEstimado >= mes);
  const totalParcelas = parcelasAtivas.reduce((s, p) => s + p.valorParcela, 0);
  const parcelasQueTerminam = parcelamentos.filter((p) => !p.quitado && p.mesQuitacaoEstimado === mes);

  const rendaTotal = rendas.filter((r) => r.ativa !== false).reduce((s, r) => s + r.valor, 0);

  const faturaDoMes = faturas.find((f) => f.competencia === mes);
  const gastoVariavelReal = faturaDoMes
    ? (faturaDoMes.transacoes || []).filter((t) => !t.parcelaTotal).reduce((s, t) => s + t.valor, 0)
    : null;
  const gastoVariavel = gastoVariavelReal ?? mediaGastoCartao.media;

  // Encargos (juros, multa, IOF...) só entram quando já existe a fatura real
  // do mês — não dá pra estimar isso com uma média, porque é evitável e
  // errático (não é um padrão de gasto).
  const totalEncargos = faturaDoMes ? (faturaDoMes.encargos || []).reduce((s, e) => s + e.valor, 0) : 0;

  const totalDasContas = totalContasFixas + gastoVariavel + totalParcelas + totalEncargos;
  const saldoProjetado = rendaTotal - totalDasContas;

  return {
    rendaTotal,
    totalContasFixas,
    contasSemValor,
    totalParcelas,
    parcelasAtivas,
    parcelasQueTerminam,
    gastoVariavel,
    totalEncargos,
    totalDasContas,
    saldoProjetado,
  };
}

function renderizar() {
  const corpo = document.getElementById('planejamento-corpo');
  const meses = proximosMeses(QTD_MESES);
  const mediaGastoCartao = calcularMediaGastoCartao(faturas);
  const projecoes = meses.map((mes) => ({ mes, ...calcularProjecao(mes, mediaGastoCartao) }));

  function linhaMoeda(rotulo, extrator, opcoes = {}) {
    const celulas = projecoes
      .map((p) => {
        const valor = extrator(p);
        const cor = opcoes.colorir ? (valor >= 0 ? 'var(--success)' : 'var(--danger)') : 'inherit';
        return `<td style="color:${cor}; font-weight:${opcoes.destaque ? 800 : 600};">${formatarMoeda(valor)}</td>`;
      })
      .join('');
    return `<tr class="${opcoes.destaque ? 'planejamento-linha-total' : ''}"><td class="planejamento-rotulo">${rotulo}</td>${celulas}</tr>`;
  }

  const contasSemValorMax = Math.max(...projecoes.map((p) => p.contasSemValor.length));
  const temEncargos = projecoes.some((p) => p.totalEncargos > 0);

  corpo.innerHTML = `
    <div class="elevated-card painel-card">
      <span class="painel-card-titulo">Projeção mês a mês</span>
      <div style="overflow-x:auto;">
        <table class="planejamento-tabela">
          <thead>
            <tr>
              <th></th>
              ${projecoes.map((p) => `<th>${formatarMesCurto(p.mes)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${linhaMoeda('Contas fixas', (p) => p.totalContasFixas)}
            ${linhaMoeda('Gastos médios (cartão)', (p) => p.gastoVariavel)}
            ${linhaMoeda('Parcelas de cartão', (p) => p.totalParcelas)}
            ${temEncargos ? linhaMoeda('Encargos e juros', (p) => p.totalEncargos) : ''}
            ${linhaMoeda('Total das contas', (p) => p.totalDasContas, { destaque: true })}
            ${linhaMoeda('Renda esperada', (p) => p.rendaTotal)}
            ${linhaMoeda('Saldo projetado após pagar as contas', (p) => p.saldoProjetado, { destaque: true, colorir: true })}
          </tbody>
        </table>
      </div>
      ${
        contasSemValorMax > 0
          ? `<p class="planejamento-nota">${contasSemValorMax} conta(s) de valor variável não entram nessa soma (não dá pra saber o valor com antecedência).</p>`
          : ''
      }
      ${
        mediaGastoCartao.quantidadeFaturas > 0
          ? `<p class="planejamento-nota">"Gastos médios (cartão)" é uma estimativa de compras à vista/avulsas no cartão, baseada em ${mediaGastoCartao.quantidadeFaturas} fatura(s) importada(s). Quando já existe fatura real de um mês, o valor real é usado no lugar da média.</p>`
          : `<p class="planejamento-nota">"Gastos médios (cartão)" ainda está zerado — importe faturas em "Importar fatura" pra essa estimativa começar a valer.</p>`
      }
      ${
        temEncargos
          ? `<p class="planejamento-nota">"Encargos e juros" só aparece com valor real, vindo de faturas já importadas (juros, multa, IOF, rotativo). Meses futuros mostram R$ 0,00 porque não dá pra prever isso.</p>`
          : ''
      }
    </div>

    <div class="painel-grid painel-grid-1" style="margin-top:18px;">
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Quando cada parcela termina</span>
        ${renderParcelasTerminando(projecoes)}
      </div>
    </div>
  `;
}

function renderParcelasTerminando(projecoes) {
  const comParcelasTerminando = projecoes.filter((p) => p.parcelasQueTerminam.length > 0);

  if (comParcelasTerminando.length === 0) {
    return '<p class="vazio">Nenhuma parcela ativa termina nos próximos meses mostrados.</p>';
  }

  return comParcelasTerminando
    .map(
      (p) => `
      <div class="planejamento-grupo-mes">
        <p class="planejamento-grupo-titulo">${formatarMesCurto(p.mes)} — libera ${formatarMoeda(p.parcelasQueTerminam.reduce((s, x) => s + x.valorParcela, 0))}</p>
        ${p.parcelasQueTerminam
          .map(
            (parc) => `
            <div class="planejamento-parcela-linha">
              <span>${escapeHTML(parc.descricao)}</span>
              <span>${formatarMoeda(parc.valorParcela)}</span>
            </div>
          `
          )
          .join('')}
      </div>
    `
    )
    .join('');
}

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  atualizarPerfilSidebar(user.displayName);
  document.body.dataset.authReady = 'true';

  ouvirContas(user.uid, (novasContas) => {
    contas = novasContas;
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
  ouvirFaturas(user.uid, (novasFaturas) => {
    faturas = novasFaturas;
    renderizar();
  });
});
