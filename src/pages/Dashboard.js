import { abrirModalDetalheCategoria } from '../components/DetalheCategoriaModal.js';
import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { anosComDados, calcularGastosPorMeses, itensDasCategorias, mesesDoAno, somarCategorias } from '../services/analisesService.js';
import {
  PADRAO_CARTAO,
  PADRAO_CONTAS,
  adicionarCategoria,
  buscarCategorias,
  garantirCategoriasPadrao,
} from '../services/categoriasService.js';
import { chaveCompra, definirCategoriaCompra, ouvirCategoriasCompras } from '../services/categoriasComprasService.js';
import { mesAtualISO, ouvirContas, salvarConta } from '../services/contasService.js';
import { encontrarFaturasDuplicadas, mesclarFaturasDuplicadas, ouvirFaturas } from '../services/faturasService.js';
import { ouvirExtratos } from '../services/extratosService.js';
import { ouvirNomesFamilia } from '../services/familiaService.js';
import { ouvirNomesTitulares } from '../services/titularesService.js';
import { anguloDoPonteiro, fatiaNoAngulo, fatiasCategorias, gradienteDonut, pontosLinha } from '../services/graficosService.js';
import { ouvirParcelamentos } from '../services/parcelamentosService.js';
import { ouvirRendas } from '../services/rendaService.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

let uid = null;
let contas = [];
let faturas = [];
let extratos = [];
let nomesFamiliaCadastrados = [];
let nomesTitulares = [];

function nomesFamiliaAtuais() {
  return [...new Set([...nomesFamiliaCadastrados, ...nomesTitulares])];
}
let parcelamentos = [];
let rendas = [];
let categoriasContas = [];
let categoriasCartao = [];
let overridesCompras = {};
let mesSelecionado = mesAtualISO();
const estadoDonuts = {};

let parcelamentosCarregados = false;
let categoriasComprasCarregadas = false;
let backfillFeito = false;

// Antes de existir a tabela central de categorias de compra, editar a
// categoria em Parcelamentos só gravava ali — nunca chegava no painel. Isso
// varre uma vez os parcelamentos já existentes e cria a entrada central pra
// qualquer um que já tinha sido corrigido manualmente e ficou "preso".
async function tentarBackfillCategorias() {
  if (backfillFeito || !parcelamentosCarregados || !categoriasComprasCarregadas || !uid) return;
  backfillFeito = true;
  for (const p of parcelamentos) {
    if (!p.categoria || chaveCompra(p.descricao) in overridesCompras) continue;
    await definirCategoriaCompra(uid, p.descricao, p.categoria);
  }
}

const app = document.getElementById('app');

const filtrosSidebar = `
  <div class="painel-filtro">
    <span class="painel-filtro-titulo">Ano</span>
    <div id="lista-anos" class="painel-lista-anos"></div>
  </div>

  <div class="painel-filtro painel-filtro-meses">
    <span class="painel-filtro-titulo">Mês</span>
    <div id="lista-meses" class="painel-lista-meses"></div>
  </div>
`;

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('geral', filtrosSidebar)}

    <main class="painel-conteudo">
      <div class="painel-topo">
        <h1 id="saudacao">Olá 👋</h1>
        <p>Sua visão geral financeira.</p>
      </div>

      <div id="aviso-faturas-duplicadas"></div>

      <div id="painel-corpo">
        <p class="vazio">Carregando...</p>
      </div>
    </main>
  </div>
`;

ligarSidebar();

function formatarMoeda(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderSparkline(valores, cor) {
  const { linha, area } = pontosLinha(valores, 160, 46, 4);
  if (!linha) return '<div class="painel-sparkline-vazio"></div>';
  return `
    <svg class="painel-sparkline" viewBox="0 0 160 46" preserveAspectRatio="none">
      <path d="${area}" fill="${cor}" opacity="0.15" stroke="none"></path>
      <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function renderDonut(categorias, id, meses) {
  const { total, fatias } = fatiasCategorias(categorias);
  const gradiente = gradienteDonut(fatias);
  estadoDonuts[id] = { total, fatias, meses };

  const legenda = fatias.length
    ? fatias
        .map(
          (f, i) => `
        <div class="painel-legenda-item" data-donut="${id}" data-idx="${i}">
          <span class="painel-legenda-dot" style="background:${f.cor}"></span>
          <span class="painel-legenda-nome">${escapeHTML(f.categoria)}</span>
          <span class="painel-legenda-pct">${f.percentual.toFixed(0)}%</span>
        </div>
      `
        )
        .join('')
    : '<p class="vazio">Sem gastos no período.</p>';

  return `
    <div class="painel-donut-linha">
      <div class="painel-donut" id="donut-${id}" style="background:${gradiente}">
        <div class="painel-donut-centro">
          <div id="donut-${id}-valor">
            <span class="painel-donut-valor-principal">${formatarMoeda(total)}</span>
          </div>
        </div>
      </div>
      <div class="painel-legenda">${legenda}</div>
    </div>
  `;
}

function conteudoCentroDonut(rotulo, valor) {
  if (rotulo == null) return `<span class="painel-donut-valor-principal">${formatarMoeda(valor)}</span>`;
  return `
    <span class="painel-donut-valor-categoria">${escapeHTML(rotulo)}</span>
    <span class="painel-donut-valor-principal">${formatarMoeda(valor)}</span>
  `;
}

function fatiaNoPonteiro(donutEl, estado, clientX, clientY) {
  const rect = donutEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const { angulo, distancia } = anguloDoPonteiro(cx, cy, clientX, clientY);
  const raioExterno = rect.width / 2;
  // Mede o buraco de verdade em vez de um número fixo, pra acompanhar o CSS
  // se o tamanho da rosca mudar.
  const centro = donutEl.querySelector('.painel-donut-centro');
  const raioInterno = centro ? centro.getBoundingClientRect().width / 2 : raioExterno * 0.6;
  if (distancia > raioExterno || distancia < raioInterno) return null;
  return fatiaNoAngulo(estado.fatias, angulo);
}

async function salvarCategoriaItem(item, novaCategoria) {
  if (item.tipo === 'conta') {
    const conhecidas = (categoriasContas.length ? categoriasContas.map((c) => c.nome) : PADRAO_CONTAS).map((c) => c.toLowerCase());
    if (!conhecidas.includes(novaCategoria.toLowerCase())) {
      await adicionarCategoria(uid, 'contas', novaCategoria);
      categoriasContas = await buscarCategorias(uid, 'contas');
    }
    await salvarConta(uid, { categoria: novaCategoria }, item.id);
    return;
  }

  const conhecidas = (categoriasCartao.length ? categoriasCartao.map((c) => c.nome) : PADRAO_CARTAO).map((c) => c.toLowerCase());
  if (!conhecidas.includes(novaCategoria.toLowerCase())) {
    await adicionarCategoria(uid, 'cartao', novaCategoria);
    categoriasCartao = await buscarCategorias(uid, 'cartao');
  }

  // Uma única gravação por descrição de compra — vale pra qualquer fatura,
  // passada ou futura, com essa mesma compra. É essa tabela (não a cópia
  // dentro de cada fatura) que manda de verdade.
  await definirCategoriaCompra(uid, item.descricaoOriginal, novaCategoria);
}

function abrirDetalheDaFatia(fatia, meses) {
  if (!fatia) return;
  const itens = itensDasCategorias(contas, faturas, extratos, nomesFamiliaAtuais(), fatia.categoriasIncluidas, meses, overridesCompras);
  const categoriasConhecidas = [...new Set([...categoriasContas.map((c) => c.nome), ...categoriasCartao.map((c) => c.nome)])];
  abrirModalDetalheCategoria(fatia.categoria, itens, fatia.valor, {
    categoriasConhecidas,
    onSalvar: salvarCategoriaItem,
  });
}

function ligarInteracaoDonuts() {
  for (const id of Object.keys(estadoDonuts)) {
    const donutEl = document.getElementById(`donut-${id}`);
    const valorEl = document.getElementById(`donut-${id}-valor`);
    const estado = estadoDonuts[id];
    if (!donutEl || !valorEl || !estado.fatias.length) continue;

    donutEl.addEventListener('mousemove', (e) => {
      const fatia = fatiaNoPonteiro(donutEl, estado, e.clientX, e.clientY);
      valorEl.innerHTML = fatia ? conteudoCentroDonut(fatia.categoria, fatia.valor) : conteudoCentroDonut(null, estado.total);
    });

    donutEl.addEventListener('mouseleave', () => {
      valorEl.innerHTML = conteudoCentroDonut(null, estado.total);
    });

    donutEl.addEventListener('click', (e) => {
      abrirDetalheDaFatia(fatiaNoPonteiro(donutEl, estado, e.clientX, e.clientY), estado.meses);
    });
  }

  document.querySelectorAll('.painel-legenda-item[data-donut]').forEach((item) => {
    const estado = estadoDonuts[item.dataset.donut];
    const valorEl = document.getElementById(`donut-${item.dataset.donut}-valor`);
    if (!estado || !valorEl) return;
    const fatia = estado.fatias[Number(item.dataset.idx)];
    if (!fatia) return;

    item.addEventListener('mouseenter', () => {
      valorEl.innerHTML = conteudoCentroDonut(fatia.categoria, fatia.valor);
    });
    item.addEventListener('mouseleave', () => {
      valorEl.innerHTML = conteudoCentroDonut(null, estado.total);
    });
    item.addEventListener('click', () => abrirDetalheDaFatia(fatia, estado.meses));
  });
}

function renderBarrasMensais(meses, porMes) {
  const max = Math.max(...meses.map((m) => porMes[m]?.total ?? 0), 1);
  const barras = meses
    .map((m) => {
      const total = porMes[m]?.total ?? 0;
      const altura = Math.max((total / max) * 100, total > 0 ? 4 : 1);
      const nomeMes = NOMES_MESES[Number(m.slice(5, 7)) - 1].slice(0, 3);
      return `
        <div class="painel-barra-col">
          <div class="painel-barra-valor">${total > 0 ? formatarMoeda(total) : ''}</div>
          <div class="painel-barra" style="height:${altura}%"></div>
          <span class="painel-barra-label">${nomeMes}</span>
        </div>
      `;
    })
    .join('');
  return `<div class="painel-barras">${barras}</div>`;
}

function renderDetalhamento(categorias) {
  const total = Object.values(categorias).reduce((s, v) => s + v, 0);
  if (total === 0) return '<p class="vazio">Sem gastos neste mês.</p>';

  const ordenadas = Object.entries(categorias).sort((a, b) => b[1] - a[1]);
  const max = ordenadas[0][1];

  return ordenadas
    .map(
      ([categoria, valor]) => `
      <div class="painel-detalhe-linha">
        <span class="painel-detalhe-nome">${escapeHTML(categoria)}</span>
        <div class="painel-detalhe-barra-trilho">
          <div class="painel-detalhe-barra" style="width:${(valor / max) * 100}%"></div>
        </div>
        <span class="painel-detalhe-valor">${formatarMoeda(valor)}</span>
      </div>
    `
    )
    .join('');
}

function formatarCompetencia(competencia) {
  if (!competencia) return '—';
  const [ano, mes] = competencia.split('-');
  return `${NOMES_MESES[Number(mes) - 1].slice(0, 3).toLowerCase()}/${ano}`;
}

function renderParcelamentosAtivos() {
  const ativos = parcelamentos
    .filter((p) => !p.quitado)
    .sort((a, b) => (a.mesQuitacaoEstimado || '').localeCompare(b.mesQuitacaoEstimado || ''));

  if (ativos.length === 0) {
    return '<p class="vazio">Nenhuma parcela ativa no momento.</p>';
  }

  const linhas = ativos
    .map((p) => {
      const progresso = Math.round((p.parcelaAtual / p.parcelaTotal) * 100);
      return `
        <div class="painel-parcela-item">
          <div class="painel-parcela-info">
            <span class="painel-parcela-nome">${escapeHTML(p.descricao)}</span>
            <span class="painel-parcela-detalhe">Parcela ${p.parcelaAtual}/${p.parcelaTotal} · quita em ${formatarCompetencia(p.mesQuitacaoEstimado)}</span>
            <div class="painel-parcela-barra-trilho">
              <div class="painel-parcela-barra" style="width:${progresso}%"></div>
            </div>
          </div>
          <span class="painel-parcela-valor">${formatarMoeda(p.valorParcela)}</span>
        </div>
      `;
    })
    .join('');

  return `<div class="painel-parcelas-lista">${linhas}</div>`;
}

function renderLinhaComparativa(meses, despesasSerie, rendaSerie) {
  const max = Math.max(...despesasSerie, ...rendaSerie, 1);
  const despesas = pontosLinha(despesasSerie, 760, 160, 10, max);
  const renda = pontosLinha(rendaSerie, 760, 160, 10, max);
  const labels = meses.map((m) => NOMES_MESES[Number(m.slice(5, 7)) - 1].slice(0, 3));

  return `
    <svg class="painel-linha-grande" viewBox="0 0 760 160" preserveAspectRatio="none">
      <path d="${renda.linha}" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${despesas.area}" fill="var(--primary-light)" opacity="0.12" stroke="none"></path>
      <path d="${despesas.linha}" fill="none" stroke="var(--primary-light)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    <div class="painel-linha-labels">${labels.map((l) => `<span>${l}</span>`).join('')}</div>
  `;
}

function renderAvisoFaturasDuplicadas() {
  const avisoEl = document.getElementById('aviso-faturas-duplicadas');
  const duplicadas = encontrarFaturasDuplicadas(faturas);

  if (duplicadas.length === 0) {
    avisoEl.innerHTML = '';
    return;
  }

  const competencias = duplicadas.map((grupo) => grupo[0].competencia).join(', ');
  avisoEl.innerHTML = `
    <div class="elevated-card aviso-duplicatas">
      <span>Encontrei ${duplicadas.length} mês(es) com fatura importada mais de uma vez (${competencias}), duplicando as compras. Vou manter a importação mais recente de cada mês e apagar as repetidas.</span>
      <button id="btn-corrigir-faturas" class="btn-secondary" type="button">Corrigir</button>
    </div>
  `;

  document.getElementById('btn-corrigir-faturas').onclick = async () => {
    if (!confirm(`Apagar as faturas repetidas de: ${competencias}? Mantenho a mais recente de cada mês.`)) return;
    const botao = document.getElementById('btn-corrigir-faturas');
    botao.disabled = true;
    botao.textContent = 'Corrigindo...';
    for (const grupo of duplicadas) {
      await mesclarFaturasDuplicadas(uid, grupo);
    }
  };
}

function renderizar() {
  renderAvisoFaturasDuplicadas();
  const corpo = document.getElementById('painel-corpo');
  const anoSelecionado = Number(mesSelecionado.slice(0, 4));
  const mesesAno = mesesDoAno(anoSelecionado);
  const { porMes } = calcularGastosPorMeses(contas, faturas, extratos, nomesFamiliaAtuais(), mesesAno, overridesCompras);

  const rendaTotal = rendas.filter((r) => r.ativa !== false).reduce((s, r) => s + r.valor, 0);
  const despesasDoMes = porMes[mesSelecionado]?.total ?? 0;
  const saldoDoMes = rendaTotal - despesasDoMes;

  const mesesAteAgora = mesesAno.filter((m) => m <= mesSelecionado);
  const despesasSerieAteAgora = mesesAteAgora.map((m) => porMes[m]?.total ?? 0);
  const saldoSerieAteAgora = despesasSerieAteAgora.map((d) => rendaTotal - d);

  const categoriasAno = somarCategorias(...mesesAno.map((m) => porMes[m]?.categorias ?? {}));
  const categoriasMes = porMes[mesSelecionado]?.categorias ?? {};

  // Não é "só parcela que termina este mês" — toda parcela paga neste mês
  // libera o próprio valor dela no limite, não importa se é a 1ª ou a última.
  const limiteLiberado = faturas
    .filter((f) => f.competencia === mesSelecionado)
    .flatMap((f) => f.transacoes || [])
    .filter((t) => t.parcelaTotal)
    .reduce((s, t) => s + t.valor, 0);

  const qtdParcelasAtivas = parcelamentos.filter((p) => !p.quitado).length;

  const despesasSerieAno = mesesAno.map((m) => porMes[m]?.total ?? 0);
  const rendaSerieAno = mesesAno.map(() => rendaTotal);

  corpo.innerHTML = `
    <div class="painel-grid painel-grid-4">
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Saldo do mês</span>
        <span class="painel-card-valor ${saldoDoMes >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(saldoDoMes)}</span>
        ${renderSparkline(saldoSerieAteAgora, saldoDoMes >= 0 ? 'var(--success)' : 'var(--danger)')}
      </div>
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Despesas do mês</span>
        <span class="painel-card-valor">${formatarMoeda(despesasDoMes)}</span>
        ${renderSparkline(despesasSerieAteAgora, 'var(--primary-light)')}
      </div>
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Renda do mês</span>
        <span class="painel-card-valor" style="color:var(--success);">${formatarMoeda(rendaTotal)}</span>
      </div>
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Limite liberado — ${NOMES_MESES[Number(mesSelecionado.slice(5, 7)) - 1]}</span>
        <span class="painel-card-valor" style="color:var(--success);">${formatarMoeda(limiteLiberado)}</span>
        <span class="painel-card-nota">Soma de todas as parcelas pagas neste mês</span>
      </div>
    </div>

    <div class="painel-grid painel-grid-3">
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Despesas no mês</span>
        ${renderDonut(categoriasMes, 'mes', [mesSelecionado])}
      </div>
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Despesas no ano</span>
        ${renderDonut(categoriasAno, 'ano', mesesAno)}
      </div>
      <div class="elevated-card painel-card">
        <div class="painel-card-cabecalho">
          <span class="painel-card-titulo">Contas parceladas</span>
          <span class="painel-card-contador">${qtdParcelasAtivas} ${qtdParcelasAtivas === 1 ? 'parcela' : 'parcelas'}</span>
        </div>
        ${renderParcelamentosAtivos()}
      </div>
    </div>

    <div class="painel-grid painel-grid-2">
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Comparativo mensal — ${anoSelecionado}</span>
        ${renderBarrasMensais(mesesAno, porMes)}
      </div>
      <div class="elevated-card painel-card">
        <span class="painel-card-titulo">Detalhamento de despesas — ${NOMES_MESES[Number(mesSelecionado.slice(5, 7)) - 1]}</span>
        <div class="painel-detalhamento">${renderDetalhamento(categoriasMes)}</div>
      </div>
    </div>

    <div class="painel-grid painel-grid-1">
      <div class="elevated-card painel-card">
        <div class="painel-card-cabecalho">
          <span class="painel-card-titulo">Renda x despesas — ${anoSelecionado}</span>
          <div class="painel-legenda-inline">
            <span><span class="painel-legenda-dot" style="background:var(--success)"></span>Renda</span>
            <span><span class="painel-legenda-dot" style="background:var(--primary-light)"></span>Despesas</span>
          </div>
        </div>
        ${renderLinhaComparativa(mesesAno, despesasSerieAno, rendaSerieAno)}
      </div>
    </div>
  `;

  ligarInteracaoDonuts();
}

function renderFiltros() {
  const anoSelecionado = Number(mesSelecionado.slice(0, 4));
  const mesAtual = Number(mesSelecionado.slice(5, 7));
  const anos = anosComDados(contas, faturas);

  document.getElementById('lista-anos').innerHTML = anos
    .map((ano) => `<button class="painel-chip ${ano === anoSelecionado ? 'ativo' : ''}" data-ano="${ano}" type="button">${ano}</button>`)
    .join('');

  document.getElementById('lista-meses').innerHTML = NOMES_MESES.map((nome, i) => {
    const numero = i + 1;
    return `<button class="painel-chip-mes ${numero === mesAtual ? 'ativo' : ''}" data-mes="${numero}" type="button">${nome}</button>`;
  }).join('');

  document.getElementById('lista-anos').querySelectorAll('[data-ano]').forEach((btn) => {
    btn.onclick = () => {
      const ano = Number(btn.dataset.ano);
      mesSelecionado = `${ano}-${mesSelecionado.slice(5, 7)}`;
      renderFiltros();
      renderizar();
    };
  });

  document.getElementById('lista-meses').querySelectorAll('[data-mes]').forEach((btn) => {
    btn.onclick = () => {
      const mes = String(btn.dataset.mes).padStart(2, '0');
      mesSelecionado = `${mesSelecionado.slice(0, 4)}-${mes}`;
      renderFiltros();
      renderizar();
    };
  });
}

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  const primeiroNome = (user.displayName || '').split(' ')[0];
  document.getElementById('saudacao').textContent = primeiroNome ? `Olá, ${primeiroNome} 👋` : 'Olá 👋';
  atualizarPerfilSidebar(user.displayName);

  await garantirCategoriasPadrao(uid);
  categoriasContas = await buscarCategorias(uid, 'contas');
  categoriasCartao = await buscarCategorias(uid, 'cartao');

  document.body.dataset.authReady = 'true';

  ouvirContas(uid, (novasContas) => {
    contas = novasContas;
    renderFiltros();
    renderizar();
  });
  ouvirFaturas(uid, (novasFaturas) => {
    faturas = novasFaturas;
    renderFiltros();
    renderizar();
  });
  ouvirExtratos(uid, (novosExtratos) => {
    extratos = novosExtratos;
    renderizar();
  });
  ouvirNomesFamilia(uid, (novosNomes) => {
    nomesFamiliaCadastrados = novosNomes;
    renderizar();
  });
  ouvirNomesTitulares(uid, (novosNomes) => {
    nomesTitulares = novosNomes;
    renderizar();
  });
  ouvirParcelamentos(uid, (novosParcelamentos) => {
    parcelamentos = novosParcelamentos;
    parcelamentosCarregados = true;
    tentarBackfillCategorias();
    renderizar();
  });
  ouvirRendas(uid, (novasRendas) => {
    rendas = novasRendas;
    renderizar();
  });
  ouvirCategoriasCompras(uid, (novosOverrides) => {
    overridesCompras = novosOverrides;
    categoriasComprasCarregadas = true;
    tentarBackfillCategorias();
    renderizar();
  });
});
