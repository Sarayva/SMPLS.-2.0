import { ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { pareceSerFaturaNubank, parseNubank } from '../parsers/nubank.js';
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
let faturaExtraida = null;
let categoriasCartao = [];
let resolverPronto;
const pronto = new Promise((resolve) => {
  resolverPronto = resolve;
});

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

function renderDropZone() {
  conteudo.innerHTML = `
    <div id="drop-zone" class="elevated-card drop-zone">
      <div class="icone">${icones.documento}</div>
      <h3>Arraste o PDF da fatura aqui</h3>
      <p>ou clique para escolher o arquivo (por enquanto, só faturas do Nubank)</p>
      <input type="file" id="input-arquivo" accept="application/pdf" style="display:none;">
    </div>
  `;

  const dropZone = document.getElementById('drop-zone');
  const inputArquivo = document.getElementById('input-arquivo');

  dropZone.onclick = () => inputArquivo.click();
  inputArquivo.onchange = () => {
    if (inputArquivo.files[0]) processarArquivo(inputArquivo.files[0]);
  };

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('arrastando');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('arrastando'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('arrastando');
    if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]);
  });
}

function renderLendo() {
  conteudo.innerHTML = `
    <div class="elevated-card drop-zone">
      <div class="icone">⏳</div>
      <h3>Lendo PDF...</h3>
      <p>Extraindo os dados da fatura.</p>
    </div>
  `;
}

function renderErro(mensagem) {
  conteudo.innerHTML = `
    <div class="elevated-card drop-zone">
      <div class="icone alerta">${icones.alerta}</div>
      <h3>Não foi possível importar</h3>
      <p>${escapeHTML(mensagem)}</p>
      <div class="fatura-acoes" style="justify-content:center;">
        <button id="btn-tentar-de-novo" class="btn-secondary" type="button">Tentar outro arquivo</button>
      </div>
    </div>
  `;
  document.getElementById('btn-tentar-de-novo').onclick = renderDropZone;
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
    </div>

    <div class="elevated-card">
      <h2 style="margin-top:0;">Transações encontradas (${fatura.transacoes.length})</h2>
      <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-8px;">Confira a categoria de cada compra antes de salvar — pode digitar uma categoria nova se quiser.</p>
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
        <button id="btn-cancelar" class="btn-secondary" type="button">Cancelar</button>
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
    faturaExtraida = null;
    renderDropZone();
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

      if (existente) await excluirFatura(uid, existente.id);
      await salvarFatura(uid, fatura);
      await mesclarParcelas(uid, fatura);
      document.getElementById('fatura-mensagem').innerHTML =
        '<p style="color:var(--success); font-weight:600;">Fatura salva e parcelamentos atualizados.</p>';
      botao.textContent = 'Salvo ✓';
    } catch (err) {
      console.error(err);
      document.getElementById('fatura-mensagem').innerHTML =
        '<p style="color:var(--danger); font-weight:600;">Não foi possível salvar. Tente novamente.</p>';
      botao.disabled = false;
      botao.textContent = 'Confirmar e salvar';
    }
  };
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

    faturaExtraida = fatura;
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
  await garantirCategoriasPadrao(uid);
  categoriasCartao = await buscarCategorias(uid, 'cartao');
  resolverPronto();
});
