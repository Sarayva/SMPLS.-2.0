import { signOut } from '../firebase/auth.js';
import { avatarHTML } from '../services/avatarService.js';
import { icones } from '../services/icones.js';
import { getTheme, toggleTheme } from '../services/themeService.js';

const ITENS_NAV = [
  { pagina: 'geral', href: '/index.html', icone: 'home', label: 'Visão geral' },
  { pagina: 'contas', href: '/contas.html', icone: 'resumo', label: 'Contas fixas' },
  { pagina: 'fatura', href: '/fatura.html', icone: 'fatura', label: 'Importar fatura' },
  { pagina: 'parcelamentos', href: '/parcelamentos.html', icone: 'parcelamentos', label: 'Parcelamentos' },
  { pagina: 'renda', href: '/renda.html', icone: 'renda', label: 'Renda' },
  { pagina: 'planejamento', href: '/planejamento.html', icone: 'planejamento', label: 'Planejamento' },
];

export function sidebarHTML(paginaAtiva, extraHTML = '') {
  const nav = ITENS_NAV.map(
    (item) => `
      <a href="${item.href}" class="painel-nav-item ${item.pagina === paginaAtiva ? 'ativo' : ''}">
        ${icones[item.icone]}<span>${item.label}</span>
      </a>
    `
  ).join('');

  return `
    <aside class="painel-sidebar">
      <div class="painel-marca">
        <span class="painel-marca-nome">SMPLS.</span>
        <span class="painel-marca-tag">Gestão financeira</span>
      </div>

      <nav class="painel-nav">${nav}</nav>

      ${extraHTML}

      <div class="painel-sidebar-rodape">
        <a href="/perfil.html" class="painel-perfil-link" id="perfil-link">
          ${avatarHTML('', 34)}
          <span id="perfil-nome">Definir apelido</span>
        </a>
        <button id="btn-theme" class="painel-nav-item" type="button">${getTheme() === 'dark' ? icones.sol : icones.lua}<span>Mudar tema</span></button>
        <button id="btn-sair" class="painel-nav-item" type="button">${icones.sair}<span>Sair</span></button>
      </div>
    </aside>
  `;
}

export function ligarSidebar() {
  document.getElementById('btn-theme').onclick = (e) => {
    const novoTema = toggleTheme();
    e.currentTarget.innerHTML = (novoTema === 'dark' ? icones.sol : icones.lua) + '<span>Mudar tema</span>';
  };

  document.getElementById('btn-sair').onclick = () => signOut();
}

export function atualizarPerfilSidebar(nome) {
  const linkEl = document.getElementById('perfil-link');
  const nomeEl = document.getElementById('perfil-nome');
  if (!linkEl || !nomeEl) return;

  linkEl.querySelector('.avatar-circulo')?.replaceWith(
    document.createRange().createContextualFragment(avatarHTML(nome, 34))
  );
  nomeEl.textContent = nome || 'Definir apelido';
}
