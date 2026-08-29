import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { pareceSerFaturaNubank, parseNubank } from '../parsers/nubank.js';
import { buscarCategoriasCompras, categoriaResolvida } from '../services/categoriasComprasService.js';
import { PADRAO_CARTAO, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { categorizar } from '../services/categorizacaoService.js';
import { buscarFaturaPorCompetencia, excluirFatura, salvarFatura } from '../services/faturasService.js';
import { mesclarParcelas } from '../services/parcelamentosService.js';
import { extrairLinhas } from '../services/pdfService.js';
import { icones } from '../services/icones.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let categoriasCartao = [];
let overridesCompras = {};
let resolverPronto;
const pronto = new Promise((resolve) => {
  resolverPronto = resolve;
});

let filaArquivos = [];
let indiceFila = 0;
let resumoImportacao = [];

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('fatura')}

    <main class="painel-conteudo">
    <div class="page">
    <div class="topbar">
      <div>
        <h1>Importar fatura</h1>
        <p>Suba o PDF da fatura do cartão — os dados são lidos aqui no navegador.</p>
      </div>
    </div>

    <div id="conteudo"></div>
    </div>
    </main>
  </div>
`;

ligarSidebar();

const conteudo = document.getElementById('conteudo');

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
      <h3>Arraste o(s) PDF(s) da fatura aqui</h3>
      <p>ou clique para escolher — pode selecionar vários arquivos de uma vez, se quiser importar várias faturas antigas (por enquanto, só faturas do Nubank)</p>
      <input type="file" id="input-arquivo" accept="application/pdf" multiple style="display:none;">
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
      <h3>Lendo PDF...</h3>
      <p>Extraindo os dados da fatura.</p>
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
        <td>${t.parcelaTotal ? `<span class="parcela-tag">${t.parcelaAtual}/${t.parcelaTotal}</span>` : '—'}</td>
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
  if (arquivo.type !== 'application/pdf') {
    renderErro('O arquivo precisa ser um PDF.');
    return;
  }

  renderLendo();

  try {
    const [linhas] = await Promise.all([extrairLinhas(arquivo), pronto]);

    if (!pareceSerFaturaNubank(linhas)) {
      renderErro('Esse PDF não parece ser uma fatura do Nubank. Por enquanto só esse banco é suportado.');
      return;
    }

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
  } catch (err) {
    console.error(err);
    renderErro('Houve um erro lendo esse PDF. Tente novamente.');
  }
}

renderDropZone();

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  uid = user.uid;
  atualizarPerfilSidebar(user.displayName);
  await garantirCategoriasPadrao(uid);
  categoriasCartao = await buscarCategorias(uid, 'cartao');
  overridesCompras = await buscarCategoriasCompras(uid);
  resolverPronto();
});
