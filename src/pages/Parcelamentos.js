import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import {
  categoriaResolvida,
  combinarOverrides,
  definirCategoriaCompra,
  ouvirCategoriasCompras,
  ouvirCategoriasGlobais,
} from '../services/categoriasComprasService.js';
import { PADRAO_CARTAO, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { mesAtualISO } from '../services/contasService.js';
import { encontrarFaturasFaltando, marcarFaturaPaga, ouvirFaturas } from '../services/faturasService.js';
import {
  encontrarDuplicatas,
  excluirParcelamento,
  marcarQuitadoManual,
  mesclarDuplicata,
  ouvirParcelamentos,
} from '../services/parcelamentosService.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let pararDeOuvir = null;
let categoriasCartao = [];
let parcelamentosAtuais = [];
let faturasAtuais = [];
let overridesPessoais = {};
let overridesGlobais = {};
let overridesCompras = {};

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('parcelamentos')}

    <main class="painel-conteudo">
    <div class="page">
    <div class="topbar">
      <div>
        <h1>Parcelamentos</h1>
        <p>Compras parceladas no cartão, atualizadas a cada fatura importada.</p>
      </div>
    </div>

    <datalist id="lista-categorias-cartao"></datalist>

    <div id="fatura-do-mes"></div>
    <div id="resumo-limite-cartao"></div>

    <div id="aviso-faturas-faltando"></div>
    <div id="aviso-duplicatas"></div>

    <div id="lista-parcelamentos">
      <p class="vazio">Carregando...</p>
    </div>
    </div>
    </main>
  </div>
`;

ligarSidebar();

document.getElementById('lista-parcelamentos').addEventListener('click', async (e) => {
  if (!uid) return;

  const badge = e.target.closest('.badge-categoria');
  if (badge) {
    editarCategoriaInline(badge);
    return;
  }

  const btnQuitar = e.target.closest('[data-quitar-id]');
  if (btnQuitar) {
    const p = parcelamentosAtuais.find((item) => item.id === btnQuitar.dataset.quitarId);
    if (p && confirm(`Marcar "${p.descricao}" como quitada? Ela some da lista de ativas e para de contar no limite comprometido.`)) {
      await marcarQuitadoManual(uid, p.id);
    }
    return;
  }

  const btnExcluir = e.target.closest('[data-excluir-id]');
  if (btnExcluir) {
    const p = parcelamentosAtuais.find((item) => item.id === btnExcluir.dataset.excluirId);
    if (p && confirm(`Excluir "${p.descricao}" definitivamente? Essa ação não pode ser desfeita.`)) {
      await excluirParcelamento(uid, p.id);
    }
  }
});

function editarCategoriaInline(badge) {
  const parcelamentoId = badge.dataset.categoriaId;
  const parcelamento = parcelamentosAtuais.find((p) => p.id === parcelamentoId);
  if (!parcelamento) return;

  const categoriaAtual = categoriaResolvida(overridesCompras, parcelamento.descricao, parcelamento.categoria);

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.setAttribute('list', 'lista-categorias-cartao');
  campo.value = categoriaAtual;
  campo.className = 'campo-categoria-inline';
  badge.replaceWith(campo);
  campo.focus();
  campo.select();

  let salvo = false;
  async function salvar() {
    if (salvo) return;
    salvo = true;
    const nova = campo.value.trim();
    if (nova && nova !== categoriaAtual) {
      try {
        const conhecidas = (categoriasCartao.length ? categoriasCartao.map((c) => c.nome) : PADRAO_CARTAO).map((c) => c.toLowerCase());
        if (!conhecidas.includes(nova.toLowerCase())) {
          await adicionarCategoria(uid, 'cartao', nova);
          categoriasCartao = await buscarCategorias(uid, 'cartao');
        }
        // Uma única gravação por descrição — vale em qualquer tela e em
        // qualquer fatura (passada ou futura) com essa mesma compra.
        await definirCategoriaCompra(uid, parcelamento.descricao, nova);
      } catch (err) {
        console.error('Falha ao salvar categoria:', err);
        alert('Não foi possível salvar essa categoria. Tente de novo.');
      }
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

function formatarDataCurta(iso) {
  if (!iso) return '—';
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function renderFaturaDoMes() {
  const el = document.getElementById('fatura-do-mes');
  const fatura = faturasAtuais.find((f) => f.vencimento && f.vencimento.slice(0, 7) === mesAtualISO());

  if (!fatura) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="elevated-card resumo-limite-card">
      <div class="painel-card-cabecalho">
        <div>
          <span class="resumo-limite-label">Fatura do cartão — vence ${formatarDataCurta(fatura.vencimento)}</span>
          <span class="resumo-limite-valor" style="display:block; margin-top:4px;">${formatarMoeda(fatura.valorTotal)}</span>
        </div>
        <button id="btn-fatura-paga" class="${fatura.paga ? 'btn-secondary' : 'btn-primary'}" type="button">
          ${fatura.paga ? 'Paga ✓ — desmarcar' : 'Marcar como paga'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-fatura-paga').onclick = async () => {
    if (!uid) return;
    await marcarFaturaPaga(uid, fatura.id, !fatura.paga);
  };
}

function renderItem(p, faltando) {
  const saldoDevedor = Math.round((p.parcelaTotal - p.parcelaAtual) * p.valorParcela * 100) / 100;
  const progresso = Math.round((p.parcelaAtual / p.parcelaTotal) * 100);
  const categoria = categoriaResolvida(overridesCompras, p.descricao, p.categoria);

  // Se a projeção de quitação já ficou no passado e a compra continua "ativa",
  // nenhuma fatura recente trouxe essa compra de novo. Na maioria dos casos
  // isso é porque falta importar uma fatura entre a última que essa compra
  // apareceu e a mais recente já importada (o número de parcela fica preso
  // esperando a fatura que faltou) — só quando NÃO há nenhuma fatura faltando
  // nesse intervalo é que sobra a explicação de "foi paga/cancelada fora do
  // cartão", caso em que faz sentido o usuário decidir manualmente.
  const parada = !p.quitado && p.mesQuitacaoEstimado && p.mesQuitacaoEstimado < mesAtualISO();
  const faltaFaturaNoIntervalo = parada && faltando.some((m) => m > p.ultimaCompetencia);

  let avisoHTML = '';
  if (faltaFaturaNoIntervalo) {
    avisoHTML = `<div class="parcela-aviso-parada">Não aparece em fatura desde ${formatarCompetencia(p.ultimaCompetencia)} — provavelmente porque falta importar uma fatura (veja o aviso no topo da página).</div>`;
  } else if (parada) {
    avisoHTML = `<div class="parcela-aviso-parada">Não aparece em fatura desde ${formatarCompetencia(p.ultimaCompetencia)} — pode já ter sido paga ou cancelada fora do cartão.
        <button class="link-acao" data-quitar-id="${p.id}" type="button">Marcar como quitado</button> ·
        <button class="link-acao link-acao-perigo" data-excluir-id="${p.id}" type="button">Excluir</button>
      </div>`;
  }

  return `
    <div class="elevated-card parcela-item ${p.quitado ? 'quitado' : ''}">
      <div class="parcela-info">
        <div class="parcela-nome">
          ${escapeHTML(p.descricao)}
          <span class="badge badge-pendente badge-categoria" data-categoria-id="${p.id}" title="Clique para mudar a categoria">${escapeHTML(categoria)}</span>
        </div>
        <div class="parcela-detalhe">
          Parcela ${p.parcelaAtual}/${p.parcelaTotal} · ${p.quitado ? 'Quitado' : `Quita em ${formatarCompetencia(p.mesQuitacaoEstimado)}`}
        </div>
        ${avisoHTML}
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

function renderAvisoFaturasFaltando() {
  const avisoEl = document.getElementById('aviso-faturas-faltando');
  const faltando = encontrarFaturasFaltando(faturasAtuais);

  if (faltando.length === 0) {
    avisoEl.innerHTML = '';
    return;
  }

  const meses = faltando.map(formatarCompetencia).join(', ');
  avisoEl.innerHTML = `
    <div class="elevated-card aviso-duplicatas">
      <span>Faltam faturas com compras de: ${meses}. Sem elas, os parcelamentos que terminam nesses meses ficam com o número de parcela desatualizado. Importe essas faturas em "Importar fatura" pra corrigir.</span>
    </div>
  `;
}

function renderResumoLimite() {
  const resumoEl = document.getElementById('resumo-limite-cartao');

  // Pega a fatura mais recente só pra saber o limite total do cartão
  // (esse número praticamente não muda, então a última importada já serve).
  const ultimaFatura = [...faturasAtuais].sort((a, b) => (b.competencia || '').localeCompare(a.competencia || ''))[0];
  const limiteTotal = ultimaFatura?.limiteTotal;

  const comprometido = parcelamentosAtuais
    .filter((p) => !p.quitado)
    .reduce((s, p) => s + Math.round((p.parcelaTotal - p.parcelaAtual) * p.valorParcela * 100) / 100, 0);

  if (!limiteTotal) {
    resumoEl.innerHTML = '';
    return;
  }

  const percentual = Math.min(100, Math.round((comprometido / limiteTotal) * 100));

  resumoEl.innerHTML = `
    <div class="elevated-card resumo-limite-card">
      <div class="resumo-limite-linha">
        <div>
          <span class="resumo-limite-label">Limite do cartão</span>
          <span class="resumo-limite-valor">${formatarMoeda(limiteTotal)}</span>
        </div>
        <div class="resumo-limite-separador"></div>
        <div>
          <span class="resumo-limite-label">Comprometido com parcelamentos</span>
          <span class="resumo-limite-valor" style="color:var(--attention);">${formatarMoeda(comprometido)}</span>
        </div>
      </div>
      <div class="resumo-limite-barra-trilho">
        <div class="resumo-limite-barra" style="width:${percentual}%;"></div>
      </div>
      <span class="resumo-limite-nota">${percentual}% do limite está preso em parcelas ainda não pagas</span>
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
  renderResumoLimite();
  renderAvisoFaturasFaltando();
  renderAvisoDuplicatas(parcelamentos);
  const lista = document.getElementById('lista-parcelamentos');

  if (parcelamentos.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhum parcelamento ainda. Importe uma fatura com compras parceladas.</p>';
    return;
  }

  const faltando = encontrarFaturasFaltando(faturasAtuais);
  const ativos = parcelamentos
    .filter((p) => !p.quitado)
    .sort((a, b) => (a.mesQuitacaoEstimado || '').localeCompare(b.mesQuitacaoEstimado || ''));
  const quitados = parcelamentos
    .filter((p) => p.quitado)
    .sort((a, b) => (b.ultimaCompetencia || '').localeCompare(a.ultimaCompetencia || ''));

  let html = '';
  html += '<p class="secao-titulo">Ativos</p>';
  html += ativos.length ? ativos.map((p) => renderItem(p, faltando)).join('') : '<p class="vazio">Nenhum parcelamento ativo.</p>';

  if (quitados.length) {
    html += '<p class="secao-titulo">Quitados</p>';
    html += quitados.map((p) => renderItem(p, faltando)).join('');
  }

  lista.innerHTML = html;
}

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  atualizarPerfilSidebar(user.displayName);
  await garantirCategoriasPadrao(uid);
  categoriasCartao = await buscarCategorias(uid, 'cartao');
  document.getElementById('lista-categorias-cartao').innerHTML = categoriasCartao
    .map((c) => `<option value="${escapeHTML(c.nome)}">`)
    .join('');
  document.body.dataset.authReady = 'true';

  if (pararDeOuvir) pararDeOuvir();
  pararDeOuvir = ouvirParcelamentos(uid, renderizar);

  ouvirFaturas(uid, (novasFaturas) => {
    faturasAtuais = novasFaturas;
    renderFaturaDoMes();
    renderResumoLimite();
    renderizar(parcelamentosAtuais);
  });

  ouvirCategoriasCompras(uid, (novosOverrides) => {
    overridesPessoais = novosOverrides;
    overridesCompras = combinarOverrides(overridesGlobais, overridesPessoais);
    renderizar(parcelamentosAtuais);
  });
  ouvirCategoriasGlobais((novosOverrides) => {
    overridesGlobais = novosOverrides;
    overridesCompras = combinarOverrides(overridesGlobais, overridesPessoais);
    renderizar(parcelamentosAtuais);
  });
});
