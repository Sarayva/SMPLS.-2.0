const CHAVE_TEMA = 'smpls_theme';

function temaPreferidoDoSistema() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initTheme() {
  const tema = localStorage.getItem(CHAVE_TEMA) || temaPreferidoDoSistema();
  document.documentElement.setAttribute('data-theme', tema);
}

export function toggleTheme() {
  const atual = document.documentElement.getAttribute('data-theme');
  const proximo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', proximo);
  localStorage.setItem(CHAVE_TEMA, proximo);
  return proximo;
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme');
}
