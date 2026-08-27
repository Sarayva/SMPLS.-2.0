import { onAuthChange } from '../firebase/auth.js';
import { adicionarCategoria, garantirCategoriasPadrao, ouvirCategorias, removerCategoria } from '../services/categoriasService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let uid = null;

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Categorias</h1>
        <p>Suas categorias de contas fixas e de compras no cartão.</p>
      </div>
      <div class="topbar-actions">
        <a href="/index.html" class="icon-btn" title="Contas fixas">🏠</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura">💳</a>
        <a href="/parcelamentos.html" class="icon-btn" title="Parcelamentos">📊</a>
        <a href="/renda.html" class="icon-btn" title="Renda">💰</a>
        <a href="/resumo.html" class="icon-btn" title="Resumo do mês">🧮</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <div class="categorias-colunas">
      <div class="elevated-card categorias-secao">
        <h2>Contas fixas</h2>
        <div id="lista-contas" class="categorias-lista"></div>
        <form id="form-contas" class="categorias-form-add">
          <input type="text" id="campo-nova-contas" placeholder="Nova categoria">
          <button type="submit" class="btn-primary">+</button>
        </form>
      </div>

      <div class="elevated-card categorias-secao">
        <h2>Cartão de crédito</h2>
        <div id="lista-cartao" class="categorias-lista"></div>
        <form id="form-cartao" class="categorias-form-add">
          <input type="text" id="campo-nova-cartao" placeholder="Nova categoria">
          <button type="submit" class="btn-primary">+</button>
        </form>
      </div>
    </div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

function renderLista(elId, categorias) {
  const el = document.getElementById(elId);
  el.innerHTML = categorias
    .map((c) => `<span class="categoria-chip">${escapeHTML(c.nome)}<button data-id="${c.id}" title="Remover" type="button">&times;</button></span>`)
    .join('') || '<span style="color:var(--text-sec); font-size:0.85rem;">Nenhuma categoria ainda.</span>';

  el.querySelectorAll('button[data-id]').forEach((botao) => {
    botao.onclick = () => removerCategoria(uid, botao.dataset.id);
  });
}

function configurarFormulario(formId, campoId, tipo) {
  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = document.getElementById(campoId);
    const nome = campo.value.trim();
    if (!nome || !uid) return;
    campo.value = '';
    await adicionarCategoria(uid, tipo, nome);
  });
}

configurarFormulario('form-contas', 'campo-nova-contas', 'contas');
configurarFormulario('form-cartao', 'campo-nova-cartao', 'cartao');

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  uid = user.uid;
  await garantirCategoriasPadrao(uid);

  ouvirCategorias(uid, 'contas', (categorias) => renderLista('lista-contas', categorias));
  ouvirCategorias(uid, 'cartao', (categorias) => renderLista('lista-cartao', categorias));
});
