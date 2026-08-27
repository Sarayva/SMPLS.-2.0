import { escapeHTML } from '../services/securityService.js';

function formatarMoeda(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function abrirModalDetalheCategoria(categoriaInicial, itensIniciais, totalInicial, opcoes = {}) {
  fecharModal();
  const { categoriasConhecidas = [], onSalvar = null } = opcoes;

  let itens = [...itensIniciais];
  let total = totalInicial;

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="elevated-card modal-card">
      <div class="modal-header">
        <h2>${escapeHTML(categoriaInicial)}</h2>
        <button id="btn-fechar-modal" class="icon-btn" type="button">&times;</button>
      </div>
      <p class="detalhe-categoria-total" id="detalhe-categoria-total"></p>
      <datalist id="lista-categorias-detalhe">
        ${categoriasConhecidas.map((c) => `<option value="${escapeHTML(c)}">`).join('')}
      </datalist>
      <div class="detalhe-categoria-lista" id="detalhe-categoria-lista"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', fecharAoEsc);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal();
  });
  document.getElementById('btn-fechar-modal').onclick = fecharModal;

  function renderItem(item, i) {
    return `
      <div class="detalhe-categoria-item">
        <div>
          <span class="detalhe-categoria-nome">${escapeHTML(item.nome)}</span>
          <span class="detalhe-categoria-origem">${escapeHTML(item.origem)} · ${escapeHTML(item.mes)} ·
            <button class="detalhe-categoria-editar" data-idx="${i}" type="button">${escapeHTML(item.categoria)}</button>
          </span>
        </div>
        <span class="detalhe-categoria-valor">${formatarMoeda(item.valor)}</span>
      </div>
    `;
  }

  function renderLista() {
    const totalEl = document.getElementById('detalhe-categoria-total');
    const listaEl = document.getElementById('detalhe-categoria-lista');
    if (!totalEl || !listaEl) return;
    totalEl.textContent = formatarMoeda(total);

    if (itens.length === 0) {
      listaEl.innerHTML = '<p class="vazio">Nenhum lançamento encontrado.</p>';
      return;
    }

    const categoriasDistintas = new Set(itens.map((i) => i.categoria));

    if (categoriasDistintas.size <= 1) {
      listaEl.innerHTML = itens.map((item, i) => renderItem(item, i)).join('');
    } else {
      // Essa fatia junta várias categorias pequenas — mostra cada uma
      // separada por título, pra ficar claro que não é "sem categoria".
      const porCategoria = {};
      itens.forEach((item, i) => (porCategoria[item.categoria] ??= []).push({ item, i }));
      const grupos = Object.entries(porCategoria).sort(
        (a, b) => b[1].reduce((s, x) => s + x.item.valor, 0) - a[1].reduce((s, x) => s + x.item.valor, 0)
      );

      listaEl.innerHTML = grupos
        .map(([categoria, entradas]) => {
          const subtotal = entradas.reduce((s, x) => s + x.item.valor, 0);
          return `
            <p class="detalhe-categoria-subtitulo">${escapeHTML(categoria)} · ${formatarMoeda(subtotal)}</p>
            ${entradas.map(({ item, i }) => renderItem(item, i)).join('')}
          `;
        })
        .join('');
    }

    listaEl.querySelectorAll('.detalhe-categoria-editar').forEach((btn) => {
      btn.onclick = () => editarCategoriaDoItem(btn, itens[Number(btn.dataset.idx)]);
    });
  }

  function editarCategoriaDoItem(botao, item) {
    if (!onSalvar) return;

    const campo = document.createElement('input');
    campo.type = 'text';
    campo.setAttribute('list', 'lista-categorias-detalhe');
    campo.value = item.categoria;
    campo.className = 'campo-categoria-inline';
    botao.replaceWith(campo);
    campo.focus();
    campo.select();

    let resolvido = false;
    async function salvar() {
      if (resolvido) return;
      resolvido = true;
      const nova = campo.value.trim();
      if (nova && nova !== item.categoria) {
        try {
          await onSalvar(item, nova);
        } catch (err) {
          console.error('Falha ao salvar categoria:', err);
          alert('Não foi possível salvar essa categoria. Tente de novo.');
          renderLista();
          return;
        }
        // Categoria vale por descrição da compra, não só por este lançamento
        // — tira da lista todos os outros que são a mesma compra também.
        const mesmaCompra = (i) =>
          item.tipo === 'transacao' && i.tipo === 'transacao' && i.nome.trim().toLowerCase() === item.nome.trim().toLowerCase();
        itens = itens.filter((i) => i !== item && !mesmaCompra(i));
        total = itens.reduce((soma, i) => soma + i.valor, 0);
        renderLista();
      } else {
        renderLista();
      }
    }

    campo.addEventListener('blur', salvar);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') campo.blur();
      if (e.key === 'Escape') {
        e.stopPropagation();
        resolvido = true;
        renderLista();
      }
    });
  }

  renderLista();
}

function fecharAoEsc(e) {
  if (e.key === 'Escape') fecharModal();
}

function fecharModal() {
  document.getElementById('modal-overlay')?.remove();
  document.removeEventListener('keydown', fecharAoEsc);
}
