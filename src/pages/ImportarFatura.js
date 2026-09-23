import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { pareceSerFaturaNubank, parseNubank } from '../parsers/nubank.js';
import { pareceSerFaturaCsv, parseFaturaCsv } from '../parsers/faturaCsv.js';
import { pareceSerExtratoCsv, parseExtratoCsv } from '../parsers/extratoCsv.js';
import {
  buscarCategoriasCompras,
  buscarCategoriasGlobais,
  categoriaResolvida,
  combinarOverrides,
  definirCategoriaCompra,
} from '../services/categoriasComprasService.js';
import { PADRAO_CARTAO, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { categorizar } from '../services/categorizacaoService.js';
import { buscarContas, marcarPago, mesAtualISO, statusConta, valorEsperado } from '../services/contasService.js';
import { buscarExtratoPorPeriodo, excluirExtrato, salvarExtrato } from '../services/extratosService.js';
import {
  buscarFaturaPorCompetencia,
  encontrarFaturasFaltando,
  excluirFatura,
  ouvirFaturas,
  salvarFatura,
} from '../services/faturasService.js';
import { mesclarParcelas } from '../services/parcelamentosService.js';
import { extrairLinhas } from '../services/pdfService.js';
import { buscarNomesFamilia } from '../services/familiaService.js';
import { buscarTitular, definirTitular, listarNomesTitulares, pareceSerAMesmaPessoa } from '../services/titularesService.js';
import { icones } from '../services/icones.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';
import { buscarVinculos, contaVinculada, definirVinculo } from '../services/vinculosContasService.js';

initTheme();

let uid = null;
let categoriasCartao = [];
let overridesCompras = {};
let contasFixas = [];
let vinculosContas = {};
let nomesTitulares = [];
let nomesFamiliaCadastrados = [];
let resolverPronto;
const pronto = new Promise((resolve) => {
  resolverPronto = resolve;
});

let filaArquivos = [];
let indiceFila = 0;
let resumoImportacao = [];
let faturasConhecidas = [];

function nomesFamiliaConhecidos() {
  return [...new Set([...nomesFamiliaCadastrados, ...nomesTitulares])];
}

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('fatura')}

    <main class="painel-conteudo">
    <div class="page">
    <div class="topbar">
      <div>
        <h1>Importar fatura ou extrato</h1>
        <p>Suba a fatura do cartão (PDF ou CSV) ou o extrato da conta (CSV) — os dados são lidos aqui no navegador.</p>
      </div>
    </div>

    <div id="aviso-faturas-faltando"></div>
    <div id="conteudo"></div>
    </div>
    </main>
  </div>
`;

ligarSidebar();

const conteudo = document.getElementById('conteudo');

function atualizarAvisoFaturasFaltando() {
  const avisoEl = document.getElementById('aviso-faturas-faltando');
  const faltando = encontrarFaturasFaltando(faturasConhecidas);

  if (faltando.length === 0) {
    avisoEl.innerHTML = '';
    return;
  }

  const nomesMeses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const meses = faltando
    .map((c) => {
      const [ano, mes] = c.split('-');
      return `${nomesMeses[Number(mes) - 1]}/${ano}`;
    })
    .join(', ');

  avisoEl.innerHTML = `
    <div class="elevated-card aviso-duplicatas">
      <span>Faltam faturas com compras de: ${meses}. Sem essas faturas, compras parceladas que terminam nesses meses ficam com o número de parcela desatualizado até você importar a fatura que falta.</span>
    </div>
  `;
}

function formatarMoeda(valor) {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function progressoFilaHTML() {
  if (filaArquivos.length <= 1) return '';
  return `<p class="fatura-fila-progresso">Fatura ${indiceFila + 1} de ${filaArquivos.length}</p>`;
}

function renderDropZone() {
  conteudo.innerHTML = `
    <div id="drop-zone" class="elevated-card drop-zone">
      <div class="icone">${icones.documento}</div>
      <h3>Arraste o(s) arquivo(s) aqui</h3>
      <p>PDF ou CSV da fatura do cartão, ou CSV do extrato da conta — reconheço sozinho o tipo. Pode soltar vários de uma vez (só Nubank, por enquanto)</p>
      <input type="file" id="input-arquivo" accept="application/pdf,.csv,text/csv" multiple style="display:none;">
    </div>
  `;

  const dropZone = document.getElementById('drop-zone');
  const inputArquivo = document.getElementById('input-arquivo');

  dropZone.onclick = () => inputArquivo.click();
  inputArquivo.onchange = () => {
    if (inputArquivo.files.length) iniciarFila(Array.from(inputArquivo.files));
  };

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('arrastando');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('arrastando'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('arrastando');
    if (e.dataTransfer.files.length) iniciarFila(Array.from(e.dataTransfer.files));
  });
}

function renderLendo() {
  conteudo.innerHTML = `
    ${progressoFilaHTML()}
    <div class="elevated-card drop-zone">
      <div class="icone">⏳</div>
      <h3>Lendo arquivo...</h3>
      <p>Extraindo os dados.</p>
    </div>
  `;
}

function renderErro(mensagem) {
  const temProxima = indiceFila < filaArquivos.length - 1;
  const emFila = filaArquivos.length > 1;

  conteudo.innerHTML = `
    ${progressoFilaHTML()}
    <div class="elevated-card drop-zone">
      <div class="icone alerta">${icones.alerta}</div>
      <h3>Não foi possível importar</h3>
      <p>${escapeHTML(mensagem)}</p>
      <div class="fatura-acoes" style="justify-content:center;">
        ${emFila
          ? `<button id="btn-pular" class="btn-secondary" type="button">${temProxima ? 'Pular e continuar' : 'Ver resumo'}</button>`
          : `<button id="btn-tentar-de-novo" class="btn-secondary" type="button">Tentar outro arquivo</button>`
        }
      </div>
    </div>
  `;

  if (emFila) {
    document.getElementById('btn-pular').onclick = () => {
      resumoImportacao.push({ nomeArquivo: filaArquivos[indiceFila].name, status: 'erro', mensagem });
      avancarFila();
    };
  } else {
    document.getElementById('btn-tentar-de-novo').onclick = renderDropZone;
  }
}

function renderPreview(fatura) {
  const opcoesCategoria = (categoriasCartao.length ? categoriasCartao.map((c) => c.nome) : PADRAO_CARTAO);

  const linhasTransacoes = fatura.transacoes
    .map(
      (t, indice) => `
      <tr>
        <td>${formatarData(t.data)}</td>
        <td>${escapeHTML(t.descricao)}</td>
        <td>
          <input type="text" list="lista-categorias-cartao" data-indice-transacao="${indice}" value="${escapeHTML(t.categoria)}">
        </td>
        <td>${t.parcelaTotal ? `<span class="parcela-tag">${t.parcelaAtual}/${t.parcelaTotal}${t.antecipada ? ' · antecipada' : ''}</span>` : '—'}</td>
        <td style="text-align:right;">${formatarMoeda(t.valor)}</td>
      </tr>
    `
    )
    .join('');

  conteudo.innerHTML = `
    ${progressoFilaHTML()}
    <div class="fatura-resumo">
      <div class="elevated-card resumo-card">
        <span class="label">Valor total</span>
        <span class="valor">${formatarMoeda(fatura.valorTotal)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Vencimento</span>
        <span class="valor">${formatarData(fatura.vencimento)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Limite total</span>
        <span class="valor">${formatarMoeda(fatura.limiteTotal)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Limite utilizado</span>
        <span class="valor">${formatarMoeda(fatura.limiteUtilizado)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Pagamento mínimo</span>
        <span class="valor">${formatarMoeda(fatura.pagamentoMinimo)}</span>
      </div>
      ${
        fatura.encargos && fatura.encargos.length > 0
          ? `<div class="elevated-card resumo-card">
              <span class="label">Encargos e juros</span>
              <span class="valor" style="color:var(--danger);">${formatarMoeda(fatura.encargos.reduce((s, e) => s + e.valor, 0))}</span>
            </div>`
          : ''
      }
      ${
        fatura.creditos && fatura.creditos.length > 0
          ? `<div class="elevated-card resumo-card">
              <span class="label">Descontos e créditos</span>
              <span class="valor" style="color:var(--success);">−${formatarMoeda(fatura.creditos.reduce((s, c) => s + c.valor, 0))}</span>
            </div>`
          : ''
      }
    </div>

    <div class="elevated-card">
      <h2 style="margin-top:0;">Transações encontradas (${fatura.transacoes.length})</h2>
      <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-8px;">
        Confira a categoria de cada compra antes de salvar — já pré-preenchi com o que você já ensinou antes, quando reconheço a compra.
      </p>
      <datalist id="lista-categorias-cartao">
        ${opcoesCategoria.map((nome) => `<option value="${escapeHTML(nome)}">`).join('')}
      </datalist>
      <div style="overflow-x:auto;">
        <table class="transacoes-tabela">
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Parcela</th><th style="text-align:right;">Valor</th></tr>
          </thead>
          <tbody>${linhasTransacoes || '<tr><td colspan="5">Nenhuma transação encontrada.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="fatura-acoes">
        <button id="btn-cancelar" class="btn-secondary" type="button">${filaArquivos.length > 1 ? 'Pular esta' : 'Cancelar'}</button>
        <button id="btn-confirmar" class="btn-primary" type="button">Confirmar e salvar</button>
      </div>
      <div id="fatura-mensagem" class="fatura-mensagem"></div>
    </div>
  `;

  conteudo.querySelectorAll('input[data-indice-transacao]').forEach((campo) => {
    campo.onchange = () => {
      fatura.transacoes[Number(campo.dataset.indiceTransacao)].categoria = campo.value.trim();
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const indice = Number(campo.dataset.indiceTransacao);
      const proximo = conteudo.querySelector(`input[data-indice-transacao="${indice + 1}"]`);
      if (proximo) proximo.focus();
      else campo.blur();
    });
  });

  document.getElementById('btn-cancelar').onclick = () => {
    if (filaArquivos.length > 1) {
      resumoImportacao.push({ nomeArquivo: filaArquivos[indiceFila].name, status: 'pulada', mensagem: 'Pulada' });
      avancarFila();
    } else {
      renderDropZone();
    }
  };

  document.getElementById('btn-confirmar').onclick = async () => {
    if (!uid) return;

    const existente = await buscarFaturaPorCompetencia(uid, fatura.competencia);
    if (existente) {
      const confirmou = confirm(
        `Você já importou uma fatura para ${formatarData(fatura.vencimento).slice(3)} antes. Quer substituir a anterior por essa? Clicar em Cancelar não importa essa fatura nova (a antiga continua como está).`
      );
      if (!confirmou) return;
    }

    const botao = document.getElementById('btn-confirmar');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      const nomesConhecidos = new Set(opcoesCategoria.map((c) => c.toLowerCase()));
      const novasCategorias = new Set(
        fatura.transacoes.map((t) => t.categoria).filter((c) => c && !nomesConhecidos.has(c.toLowerCase()))
      );
      for (const nome of novasCategorias) {
        await adicionarCategoria(uid, 'cartao', nome);
      }
      categoriasCartao = await buscarCategorias(uid, 'cartao');

      // Grava a categoria de cada compra na tabela central — sem isso, editar
      // a categoria aqui na prévia só valia pra essa fatura, e a próxima
      // fatura com a mesma compra voltava a pedir de novo.
      await Promise.all(
        fatura.transacoes.filter((t) => t.categoria).map((t) => definirCategoriaCompra(uid, t.descricao, t.categoria))
      );

      if (existente) await excluirFatura(uid, existente.id);
      await salvarFatura(uid, fatura);
      await mesclarParcelas(uid, fatura);

      if (filaArquivos.length > 1) {
        resumoImportacao.push({ nomeArquivo: filaArquivos[indiceFila].name, status: 'salva', mensagem: `Salva — ${formatarData(fatura.vencimento)}` });
        avancarFila();
      } else {
        document.getElementById('fatura-mensagem').innerHTML =
          '<p style="color:var(--success); font-weight:600;">Fatura salva e parcelamentos atualizados.</p>';
        botao.textContent = 'Salvo ✓';
      }
    } catch (err) {
      console.error(err);
      document.getElementById('fatura-mensagem').innerHTML =
        '<p style="color:var(--danger); font-weight:600;">Não foi possível salvar. Tente novamente.</p>';
      botao.disabled = false;
      botao.textContent = 'Confirmar e salvar';
    }
  };
}

function renderResumoFila() {
  const salvas = resumoImportacao.filter((r) => r.status === 'salva').length;
  const puladas = resumoImportacao.filter((r) => r.status === 'pulada').length;
  const erros = resumoImportacao.filter((r) => r.status === 'erro').length;

  const partes = [`${salvas} fatura(s) salva(s)`];
  if (puladas) partes.push(`${puladas} pulada(s)`);
  if (erros) partes.push(`${erros} com erro`);

  conteudo.innerHTML = `
    <div class="elevated-card drop-zone">
      <div class="icone">${icones.documento}</div>
      <h3>Importação concluída</h3>
      <p>${partes.join(', ')}.</p>
      <div class="fatura-resumo-lista">
        ${resumoImportacao
          .map(
            (r) => `
          <div class="fatura-resumo-item">
            <span>${escapeHTML(r.nomeArquivo)}</span>
            <span class="fatura-resumo-status fatura-resumo-status-${r.status}">${escapeHTML(r.mensagem)}</span>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="fatura-acoes" style="justify-content:center;">
        <button id="btn-importar-mais" class="btn-secondary" type="button">Importar mais faturas</button>
      </div>
    </div>
  `;
  document.getElementById('btn-importar-mais').onclick = renderDropZone;
}

function iniciarFila(arquivos) {
  filaArquivos = arquivos;
  indiceFila = 0;
  resumoImportacao = [];
  processarArquivo(filaArquivos[0]);
}

function avancarFila() {
  indiceFila += 1;
  if (indiceFila >= filaArquivos.length) {
    renderResumoFila();
  } else {
    processarArquivo(filaArquivos[indiceFila]);
  }
}

async function processarArquivo(arquivo) {
  const nomeLower = arquivo.name.toLowerCase();
  const ehCsv = nomeLower.endsWith('.csv') || arquivo.type === 'text/csv';
  const ehPdf = nomeLower.endsWith('.pdf') || arquivo.type === 'application/pdf';

  if (!ehCsv && !ehPdf) {
    renderErro('O arquivo precisa ser um PDF ou um CSV.');
    return;
  }

  renderLendo();

  try {
    if (ehCsv) {
      await processarCsv(arquivo);
    } else {
      await processarPdf(arquivo);
    }
  } catch (err) {
    console.error(err);
    renderErro('Houve um erro lendo esse arquivo. Tente novamente.');
  }
}

async function processarPdf(arquivo) {
  const [linhas] = await Promise.all([extrairLinhas(arquivo), pronto]);

  if (pareceSerFaturaNubank(linhas)) {
    const fatura = parseNubank(linhas, categorizar);
    if (!fatura.valorTotal || fatura.transacoes.length === 0) {
      renderErro('Não consegui extrair os dados dessa fatura. O formato pode ter mudado.');
      return;
    }
    // Se já sabemos a categoria dessa compra (porque você já corrigiu antes),
    // usa ela em vez do adivinhador por palavra-chave.
    fatura.transacoes.forEach((t) => {
      t.categoria = categoriaResolvida(overridesCompras, t.descricao, t.categoria);
    });
    renderPreview(fatura);
    return;
  }

  const textoCompleto = linhas.join(' ').toLowerCase();
  if (textoCompleto.includes('movimentações') || textoCompleto.includes('saldo inicial')) {
    renderErro('Esse PDF parece ser um extrato de conta — por enquanto só aceito extrato em CSV. No app do Nubank, exporte o extrato como CSV em vez de PDF.');
    return;
  }

  renderErro('Esse PDF não parece ser uma fatura do Nubank. Por enquanto só esse banco é suportado.');
}

async function processarCsv(arquivo) {
  await pronto;
  const texto = await arquivo.text();

  if (pareceSerFaturaCsv(texto)) {
    const fatura = parseFaturaCsv(texto, arquivo.name, categorizar);
    if (!fatura.competencia || fatura.transacoes.length === 0) {
      renderErro('Não consegui extrair os dados dessa fatura em CSV. Confira se o nome do arquivo é o padrão do Nubank (ex: Nubank_2026-09-13.csv).');
      return;
    }
    fatura.transacoes.forEach((t) => {
      t.categoria = categoriaResolvida(overridesCompras, t.descricao, t.categoria);
    });
    renderPreview(fatura);
    return;
  }

  if (pareceSerExtratoCsv(texto)) {
    const extrato = parseExtratoCsv(texto, arquivo.name);
    if (extrato.lancamentos.length === 0) {
      renderErro('Não consegui extrair os lançamentos desse extrato.');
      return;
    }
    if (extrato.numeroConta) {
      extrato.titular = await buscarTitular(uid, extrato.numeroConta);
    }
    anotarLancamentos(extrato);
    renderPreviewExtrato(extrato);
    return;
  }

  renderErro('Não reconheci esse CSV — confira se é um extrato ou uma fatura exportados do Nubank.');
}

// Marca cada lançamento com o que a tela de preview precisa saber: se é uma
// transferência entre as próprias contas da família (não é gasto de
// verdade), e — pra quem sobrou — se bate com alguma conta fixa ainda não
// paga nesse mês (por vínculo já ensinado antes, ou por ter o valor exato).
function anotarLancamentos(extrato) {
  const TIPOS_TRANSFERENCIA = ['pix_enviado', 'pix_recebido', 'transferencia_enviada', 'transferencia_recebida', 'reembolso'];
  const nomesConhecidos = nomesFamiliaConhecidos();

  extrato.lancamentos.forEach((l) => {
    l.internoFamilia = TIPOS_TRANSFERENCIA.includes(l.tipo)
      ? nomesConhecidos.some((nome) => pareceSerAMesmaPessoa(nome, l.contraparte))
      : false;

    const ehAcaoNecessaria = l.direcao === 'saida' && !l.interno && !l.internoFamilia && l.tipo !== 'pagamento_fatura';
    if (!ehAcaoNecessaria) {
      l.contaFixaSugerida = null;
      l.categoria = null;
      return;
    }

    const mes = l.data ? l.data.slice(0, 7) : mesAtualISO();
    const contasNaoPagas = contasFixas.filter((c) => c.ativa !== false && statusConta(c, mes) !== 'pago');
    const vinculado = contaVinculada(vinculosContas, l.contraparte);

    if (vinculado && contasNaoPagas.some((c) => c.id === vinculado)) {
      l.contaFixaSugerida = vinculado;
    } else {
      const porValor = contasNaoPagas.find((c) => valorEsperado(c, mes) != null && Math.abs(valorEsperado(c, mes) - l.valor) < 0.01);
      l.contaFixaSugerida = porValor ? porValor.id : null;
    }
    l.categoria = categoriaResolvida(overridesCompras, l.contraparte, categorizar(l.contraparte));
  });
}

function renderLinhaLancamento(l, indice) {
  const dataFmt = formatarData(l.data);

  if (l.interno) {
    return `<tr class="extrato-linha-interna">
      <td>${dataFmt}</td><td colspan="2">${escapeHTML(l.descricao)}</td>
      <td style="text-align:right;">${formatarMoeda(l.valor)}</td>
    </tr>`;
  }
  if (l.internoFamilia) {
    return `<tr class="extrato-linha-interna">
      <td>${dataFmt}</td><td colspan="2">${escapeHTML(l.contraparte)} <span class="extrato-badge">transferência com a família</span></td>
      <td style="text-align:right;">${formatarMoeda(l.valor)}</td>
    </tr>`;
  }
  if (l.tipo === 'pagamento_fatura') {
    return `<tr class="extrato-linha-interna">
      <td>${dataFmt}</td><td colspan="2">${escapeHTML(l.descricao)} <span class="extrato-badge">fatura do cartão — já contabilizado</span></td>
      <td style="text-align:right;">${formatarMoeda(l.valor)}</td>
    </tr>`;
  }
  if (l.direcao === 'entrada') {
    return `<tr class="extrato-linha-interna">
      <td>${dataFmt}</td><td colspan="2">${escapeHTML(l.contraparte)} <span class="extrato-badge">entrada</span></td>
      <td style="text-align:right; color:var(--success);">+${formatarMoeda(l.valor)}</td>
    </tr>`;
  }

  const mes = l.data ? l.data.slice(0, 7) : mesAtualISO();
  const contasNaoPagas = contasFixas.filter((c) => c.ativa !== false && statusConta(c, mes) !== 'pago');

  return `<tr>
    <td>${dataFmt}</td>
    <td>${escapeHTML(l.contraparte)}</td>
    <td>
      <select data-indice-lancamento="${indice}" class="extrato-select-conta">
        <option value="">— Não é conta fixa —</option>
        ${contasNaoPagas
          .map((c) => `<option value="${c.id}" ${l.contaFixaSugerida === c.id ? 'selected' : ''}>${escapeHTML(c.nome)}</option>`)
          .join('')}
      </select>
      <input
        type="text"
        list="lista-categorias-cartao"
        data-indice-lancamento-categoria="${indice}"
        value="${escapeHTML(l.categoria || '')}"
        placeholder="categoria"
        class="extrato-input-categoria"
        style="${l.contaFixaSugerida ? 'display:none;' : ''}"
      >
    </td>
    <td style="text-align:right; color:var(--danger);">-${formatarMoeda(l.valor)}</td>
  </tr>`;
}

function renderPreviewExtrato(extrato) {
  const opcoesCategoria = categoriasCartao.length ? categoriasCartao.map((c) => c.nome) : PADRAO_CARTAO;

  const totalSaidaReal = extrato.lancamentos
    .filter((l) => l.direcao === 'saida' && !l.interno && !l.internoFamilia && l.tipo !== 'pagamento_fatura')
    .reduce((s, l) => s + l.valor, 0);
  const qtdBatidas = extrato.lancamentos.filter((l) => l.contaFixaSugerida).length;

  const linhas = extrato.lancamentos.map((l, i) => renderLinhaLancamento(l, i)).join('');

  conteudo.innerHTML = `
    ${progressoFilaHTML()}
    <div class="fatura-resumo">
      <div class="elevated-card resumo-card">
        <span class="label">Titular</span>
        ${
          extrato.titular
            ? `<span class="valor">${escapeHTML(extrato.titular)}</span>`
            : `<input type="text" id="campo-titular" placeholder="De quem é essa conta?" class="campo-valor-inline" style="width:100%;">`
        }
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Período</span>
        <span class="valor">${formatarData(extrato.periodoInicio)} a ${formatarData(extrato.periodoFim)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Saídas de dinheiro</span>
        <span class="valor">${formatarMoeda(totalSaidaReal)}</span>
      </div>
      <div class="elevated-card resumo-card">
        <span class="label">Contas fixas batidas</span>
        <span class="valor">${qtdBatidas}</span>
      </div>
    </div>

    <div class="elevated-card">
      <h2 style="margin-top:0;">Lançamentos (${extrato.lancamentos.length})</h2>
      <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-8px;">
        Quando um lançamento bate com uma conta fixa, ela é marcada como paga ao confirmar. O resto vira despesa categorizada — transferências internas (RDB, entre vocês dois) e o pagamento da fatura ficam de fora, pra não contar em dobro.
      </p>
      <datalist id="lista-categorias-cartao">
        ${opcoesCategoria.map((nome) => `<option value="${escapeHTML(nome)}">`).join('')}
      </datalist>
      <div style="overflow-x:auto;">
        <table class="transacoes-tabela">
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Conta fixa / categoria</th><th style="text-align:right;">Valor</th></tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>

      <div class="fatura-acoes">
        <button id="btn-cancelar-extrato" class="btn-secondary" type="button">${filaArquivos.length > 1 ? 'Pular esta' : 'Cancelar'}</button>
        <button id="btn-confirmar-extrato" class="btn-primary" type="button">Confirmar e salvar</button>
      </div>
      <div id="extrato-mensagem" class="fatura-mensagem"></div>
    </div>
  `;

  conteudo.querySelectorAll('select[data-indice-lancamento]').forEach((select) => {
    select.onchange = () => {
      const idx = Number(select.dataset.indiceLancamento);
      extrato.lancamentos[idx].contaFixaSugerida = select.value || null;
      const inputCategoria = conteudo.querySelector(`input[data-indice-lancamento-categoria="${idx}"]`);
      if (inputCategoria) inputCategoria.style.display = select.value ? 'none' : '';
    };
  });
  conteudo.querySelectorAll('input[data-indice-lancamento-categoria]').forEach((input) => {
    input.onchange = () => {
      const idx = Number(input.dataset.indiceLancamentoCategoria);
      extrato.lancamentos[idx].categoria = input.value.trim();
    };
  });

  document.getElementById('btn-cancelar-extrato').onclick = () => {
    if (filaArquivos.length > 1) {
      resumoImportacao.push({ nomeArquivo: filaArquivos[indiceFila].name, status: 'pulada', mensagem: 'Pulada' });
      avancarFila();
    } else {
      renderDropZone();
    }
  };

  document.getElementById('btn-confirmar-extrato').onclick = async () => {
    if (!uid) return;

    if (!extrato.titular) {
      const campoTitular = document.getElementById('campo-titular');
      const nomeDigitado = campoTitular.value.trim();
      if (!nomeDigitado) {
        campoTitular.focus();
        return;
      }
      extrato.titular = nomeDigitado;
    }

    const existente = await buscarExtratoPorPeriodo(uid, extrato.numeroConta, extrato.periodoInicio, extrato.periodoFim);
    if (existente) {
      const confirmou = confirm(
        `Você já importou um extrato de ${formatarData(extrato.periodoInicio)} a ${formatarData(extrato.periodoFim)} pra essa conta. Quer substituir pelo novo? Clicar em Cancelar não importa esse extrato novo.`
      );
      if (!confirmou) return;
    }

    const botao = document.getElementById('btn-confirmar-extrato');
    botao.disabled = true;
    botao.textContent = 'Salvando...';

    try {
      await definirTitular(uid, extrato.numeroConta, extrato.titular);
      if (!nomesTitulares.some((n) => pareceSerAMesmaPessoa(n, extrato.titular))) {
        nomesTitulares.push(extrato.titular);
      }

      const nomesConhecidos = new Set(opcoesCategoria.map((c) => c.toLowerCase()));
      const novasCategorias = new Set(
        extrato.lancamentos.map((l) => l.categoria).filter((c) => c && !nomesConhecidos.has(c.toLowerCase()))
      );
      for (const nome of novasCategorias) {
        await adicionarCategoria(uid, 'cartao', nome);
      }
      if (novasCategorias.size) categoriasCartao = await buscarCategorias(uid, 'cartao');

      for (const l of extrato.lancamentos) {
        if (l.contaFixaSugerida) {
          const mes = l.data ? l.data.slice(0, 7) : mesAtualISO();
          await marcarPago(uid, l.contaFixaSugerida, mes, l.valor);
          await definirVinculo(uid, l.contraparte, l.contaFixaSugerida);
          l.contaFixaId = l.contaFixaSugerida;
        } else if (l.categoria) {
          await definirCategoriaCompra(uid, l.contraparte, l.categoria);
        }
      }

      if (existente) await excluirExtrato(uid, existente.id);
      await salvarExtrato(uid, {
        banco: extrato.banco,
        numeroConta: extrato.numeroConta,
        titular: extrato.titular,
        periodoInicio: extrato.periodoInicio,
        periodoFim: extrato.periodoFim,
        lancamentos: extrato.lancamentos,
      });

      if (filaArquivos.length > 1) {
        resumoImportacao.push({ nomeArquivo: filaArquivos[indiceFila].name, status: 'salva', mensagem: `Extrato salvo — ${extrato.titular}` });
        avancarFila();
      } else {
        document.getElementById('extrato-mensagem').innerHTML =
          '<p style="color:var(--success); font-weight:600;">Extrato salvo — contas fixas batidas foram marcadas como pagas.</p>';
        botao.textContent = 'Salvo ✓';
      }
    } catch (err) {
      console.error(err);
      document.getElementById('extrato-mensagem').innerHTML =
        '<p style="color:var(--danger); font-weight:600;">Não foi possível salvar. Tente novamente.</p>';
      botao.disabled = false;
      botao.textContent = 'Confirmar e salvar';
    }
  };
}

renderDropZone();

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  uid = user.uid;
  atualizarPerfilSidebar(user.displayName);
  await garantirCategoriasPadrao(uid);
  categoriasCartao = await buscarCategorias(uid, 'cartao');
  const [overridesPessoais, overridesGlobais] = await Promise.all([buscarCategoriasCompras(uid), buscarCategoriasGlobais()]);
  overridesCompras = combinarOverrides(overridesGlobais, overridesPessoais);
  contasFixas = await buscarContas(uid);
  vinculosContas = await buscarVinculos(uid);
  nomesTitulares = await listarNomesTitulares(uid);
  nomesFamiliaCadastrados = await buscarNomesFamilia(uid);
  resolverPronto();

  ouvirFaturas(uid, (novasFaturas) => {
    faturasConhecidas = novasFaturas;
    atualizarAvisoFaturasFaltando();
  });
});
