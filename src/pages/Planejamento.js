import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { calcularMedianaGastoAvista } from '../services/analisesService.js';
import {
  contaVigenteNoMes,
  ehContaCartao,
  mesAtualISO,
  ouvirContas,
  transacaoViraContaFixa,
  valorContaCartaoNoMes,
  valorEsperado,
} from '../services/contasService.js';
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

function calcularProjecao(mes, medianaGastoAvista) {
  const contasAtivas = contas.filter((c) => contaVigenteNoMes(c, mes));
  // Conta do cartão vale o que foi vinculado na fatura do mês (ou o último
  // valor conhecido, em mês sem fatura ainda) — ver valorContaCartaoNoMes.
  const valorDaConta = (c) => (ehContaCartao(c) ? valorContaCartaoNoMes(c, mes, faturas) : valorEsperado(c, mes));
  const contasComValor = contasAtivas.filter((c) => valorDaConta(c) != null);
  const contasSemValor = contasAtivas.filter((c) => valorDaConta(c) == null);
  const totalContasFixas = contasComValor.reduce((s, c) => s + valorDaConta(c), 0);

  const parcelasQueTerminam = parcelamentos.filter((p) => !p.quitado && p.mesQuitacaoEstimado === mes);

  // Parcelamentos com parcela sabidamente ativa em "mes" (depois da última
  // fatura já importada e até o mês em que quitam) — valor exato, não precisa
  // estimar o que já se sabe.
  const parcelasAtivasNoMes = parcelamentos.filter(
    (p) => !p.quitado && p.ultimoVencimento && mes > p.ultimoVencimento && mes <= p.mesQuitacaoEstimado
  );
  const totalParcelasConhecidas = parcelasAtivasNoMes.reduce((s, p) => s + p.valorParcela, 0);

  const rendaTotal = rendas.filter((r) => r.ativa !== false).reduce((s, r) => s + r.valor, 0);

  // O que você paga em "mes" é a fatura que VENCE em "mes", não a que tem
  // compras feitas em "mes" (competência) — uma fatura vence, em geral, no
  // mês seguinte ao das compras.
  const faturaDoMes = faturas.find((f) => f.vencimento && f.vencimento.slice(0, 7) === mes);

  // Encargos (juros, multa, IOF...) só entram quando já existe a fatura real
  // do mês — não dá pra estimar isso com uma média, porque é evitável e
  // errático (não é um padrão de gasto).
  const totalEncargos = faturaDoMes ? (faturaDoMes.encargos || []).reduce((s, e) => s + e.valor, 0) : 0;

  // Quando já existe a fatura real do mês, usa o total exato dela (à vista +
  // parcelas). Em meses futuros, soma o que já se sabe com certeza (parcelas
  // ativas naquele mês, valor exato) com uma estimativa só da parte
  // imprevisível (mediana de compras à vista/avulsas do histórico) — assim a
  // projeção varia mês a mês conforme parcelas terminam de verdade, sem cair
  // "artificialmente" por ignorar que compras novas tendem a ocupar o lugar
  // das antigas.
  // Créditos (ex: "Desconto Antecipação") abatem o total da fatura real.
  const totalCartao = faturaDoMes
    ? (faturaDoMes.transacoes || [])
        .filter((t) => !transacaoViraContaFixa(t, mes, contas))
        .reduce((s, t) => s + t.valor, 0) -
      (faturaDoMes.creditos || []).reduce((s, c) => s + c.valor, 0)
    : medianaGastoAvista.mediana + totalParcelasConhecidas;

  const totalDasContas = totalContasFixas + totalCartao + totalEncargos;
  const saldoProjetado = rendaTotal - totalDasContas;

  return {
    rendaTotal,
    totalContasFixas,
    contasSemValor,
    parcelasQueTerminam,
    totalCartao,
    ehFaturaReal: Boolean(faturaDoMes),
    totalEncargos,
    totalDasContas,
    saldoProjetado,
  };
}

function renderizar() {
  const corpo = document.getElementById('planejamento-corpo');
  const meses = proximosMeses(QTD_MESES);
  const medianaGastoAvista = calcularMedianaGastoAvista(faturas, contas);
  const projecoes = meses.map((mes) => ({ mes, ...calcularProjecao(mes, medianaGastoAvista) }));

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
            ${linhaMoeda('Fatura do cartão', (p) => p.totalCartao)}
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
        medianaGastoAvista.quantidadeFaturas > 0
          ? `<p class="planejamento-nota">"Fatura do cartão" é o valor exato da fatura já importada daquele mês (compras à vista + parcelas). Em meses futuros, sem fatura ainda, é uma estimativa: mediana de compras à vista/avulsas de ${medianaGastoAvista.quantidadeFaturas} fatura(s) importada(s) + as parcelas já sabidas que continuam ativas naquele mês.</p>`
          : `<p class="planejamento-nota">"Fatura do cartão" ainda está zerada nos meses futuros — importe faturas em "Importar fatura" pra essa estimativa começar a valer.</p>`
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
    window.location.href = 'login.html';
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
