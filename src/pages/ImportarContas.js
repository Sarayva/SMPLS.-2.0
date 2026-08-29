import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { onAuthChange } from '../firebase/auth.js';
import { parseContasCsv } from '../parsers/contasCsv.js';
import { PADRAO_CONTAS, adicionarCategoria, buscarCategorias, garantirCategoriasPadrao } from '../services/categoriasService.js';
import { salvarConta } from '../services/contasService.js';
import { icones } from '../services/icones.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

let uid = null;
let categoriasContas = [];
let contasExtraidas = [];

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('contas')}

    <main class="painel-conteudo">
    <div class="page">
    <div class="topbar">
      <div>
        <h1>Importar contas de uma planilha</h1>
        <p>Suba um CSV exportado do Google Sheets ou Excel — os dados são lidos aqui no navegador.</p>
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

function renderDropZone() {
  conteudo.innerHTML = `
    <div id="drop-zone" class="elevated-card drop-zone">
      <div class="icone">${icones.documento}</div>
      <h3>Arraste o arquivo CSV aqui</h3>
      <p>ou clique para escolher o arquivo. Cada linha vira uma conta fixa; cada coluna, um mês.</p>
      <input type="file" id="input-arquivo" accept=".csv,text/csv" style="display:none;">
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

function renderPreview() {
  const opcoesCategoria = categoriasContas.length ? categoriasContas.map((c) => c.nome) : PADRAO_CONTAS;

  const linhas = contasExtraidas
    .map((c, indice) => {
      const avisos = [];
      if (c.pareceCartao) avisos.push('parece ser a fatura do cartão — deixei desmarcada');
      if (c.pareceTemporaria) avisos.push('os valores somem antes do fim da planilha — pode ser parcela terminando');

      return `
        <div class="conta-import-item">
          <input type="checkbox" class="conta-import-check" data-indice="${indice}" ${c.pareceCartao ? '' : 'checked'}>
          <div class="conta-import-campos">
            <input type="text" class="conta-import-nome" data-indice="${indice}" value="${escapeHTML(c.nome)}" placeholder="Nome">
            <input type="text" class="conta-import-categoria" data-indice="${indice}" list="lista-categorias-import" value="${escapeHTML(c.categoria)}" placeholder="Categoria">
            <input type="number" class="conta-import-valor" data-indice="${indice}" value="${c.valor ?? ''}" step="0.01" min="0" placeholder="Valor">
            <input type="number" class="conta-import-dia" data-indice="${indice}" value="${c.diaVencimento ?? ''}" min="1" max="31" placeholder="Dia">
          </div>
          ${avisos.length ? `<span class="conta-import-aviso" title="${escapeHTML(avisos.join(' · '))}">${icones.alerta}</span>` : '<span class="conta-import-aviso-vazio"></span>'}
        </div>
      `;
    })
    .join('');

  conteudo.innerHTML = `
    <div class="elevated-card">
      <h2 style="margin-top:0;">Contas encontradas (${contasExtraidas.length})</h2>
      <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-8px;">
        Confira nome, categoria, valor e dia de vencimento de cada uma. Desmarque as que não quer importar.
      </p>
      <datalist id="lista-categorias-import">
        ${opcoesCategoria.map((nome) => `<option value="${escapeHTML(nome)}">`).join('')}
      </datalist>

      <div id="lista-contas-import">${linhas}</div>

      <div class="fatura-acoes">
        <button id="btn-cancelar" class="btn-secondary" type="button">Cancelar</button>
        <button id="btn-confirmar" class="btn-primary" type="button">Importar selecionadas</button>
      </div>
      <div id="import-mensagem" class="fatura-mensagem"></div>
    </div>
  `;

  document.querySelectorAll('.conta-import-nome, .conta-import-categoria, .conta-import-valor, .conta-import-dia').forEach((campo) => {
    campo.onchange = () => {
      const indice = Number(campo.dataset.indice);
      const conta = contasExtraidas[indice];
      if (campo.classList.contains('conta-import-nome')) conta.nome = campo.value.trim();
      if (campo.classList.contains('conta-import-categoria')) conta.categoria = campo.value.trim();
      if (campo.classList.contains('conta-import-valor')) conta.valor = campo.value === '' ? null : Number(campo.value);
      if (campo.classList.contains('conta-import-dia')) conta.diaVencimento = campo.value === '' ? null : Number(campo.value);
    };
  });

  document.getElementById('btn-cancelar').onclick = () => {
    contasExtraidas = [];
    renderDropZone();
  };

  document.getElementById('btn-confirmar').onclick = confirmarImportacao;
}

async function confirmarImportacao() {
  if (!uid) return;
  const mensagemEl = document.getElementById('import-mensagem');
  const marcadas = Array.from(document.querySelectorAll('.conta-import-check:checked')).map((c) => Number(c.dataset.indice));

  if (marcadas.length === 0) {
    mensagemEl.innerHTML = '<p style="color:var(--danger); font-weight:600;">Selecione ao menos uma conta.</p>';
    return;
  }

  const selecionadas = marcadas.map((i) => contasExtraidas[i]);
  const invalida = selecionadas.find((c) => !c.nome || !c.categoria || !c.valor || !c.diaVencimento);
  if (invalida) {
    mensagemEl.innerHTML = `<p style="color:var(--danger); font-weight:600;">Preencha nome, categoria, valor e dia de vencimento de "${escapeHTML(invalida.nome || invalida.nomeOriginal)}" antes de importar.</p>`;
    return;
  }

  const botao = document.getElementById('btn-confirmar');
  botao.disabled = true;
  botao.textContent = 'Importando...';

  try {
    const nomesConhecidos = new Set((categoriasContas.length ? categoriasContas.map((c) => c.nome) : PADRAO_CONTAS).map((c) => c.toLowerCase()));
    const novasCategorias = new Set(selecionadas.map((c) => c.categoria).filter((c) => !nomesConhecidos.has(c.toLowerCase())));
    for (const nome of novasCategorias) {
      await adicionarCategoria(uid, 'contas', nome);
    }

    for (const conta of selecionadas) {
      await salvarConta(uid, {
        nome: conta.nome,
        categoria: conta.categoria,
        valorVariavel: false,
        valor: conta.valor,
        diaVencimento: conta.diaVencimento,
        observacoes: '',
      });
    }

    mensagemEl.innerHTML = `<p style="color:var(--success); font-weight:600;">${selecionadas.length} conta(s) importada(s) com sucesso.</p>`;
    botao.textContent = 'Importado ✓';
  } catch (err) {
    console.error(err);
    mensagemEl.innerHTML = '<p style="color:var(--danger); font-weight:600;">Não foi possível importar. Tente novamente.</p>';
    botao.disabled = false;
    botao.textContent = 'Importar selecionadas';
  }
}

async function processarArquivo(arquivo) {
  const extensaoValida = /\.csv$/i.test(arquivo.name) || arquivo.type === 'text/csv';
  if (!extensaoValida) {
    renderErro('O arquivo precisa ser um CSV (no Google Sheets: Arquivo → Fazer download → Valores separados por vírgula).');
    return;
  }

  try {
    const texto = await arquivo.text();
    const contas = parseContasCsv(texto);

    if (contas.length === 0) {
      renderErro('Não encontrei nenhuma conta nesse arquivo. Confira se a primeira linha tem os meses e a primeira coluna tem os nomes.');
      return;
    }

    contasExtraidas = contas;
    renderPreview();
  } catch (err) {
    console.error(err);
    renderErro('Houve um erro lendo esse arquivo. Tente novamente.');
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
  categoriasContas = await buscarCategorias(uid, 'contas');
});
