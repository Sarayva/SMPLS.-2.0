const TONS_AVATAR = ['#0078d4', '#3e9be0', '#60cdff', '#004c87', '#2d7cb0', '#1a5f8a'];

export function corAvatar(nome) {
  const texto = (nome || '').trim();
  if (!texto) return TONS_AVATAR[0];
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return TONS_AVATAR[Math.abs(hash) % TONS_AVATAR.length];
}

export function inicialAvatar(nome) {
  const texto = (nome || '').trim();
  return texto ? texto[0].toUpperCase() : '?';
}

export function avatarHTML(nome, tamanhoPx = 36) {
  const fonte = Math.round(tamanhoPx * 0.45);
  return `<span class="avatar-circulo" style="width:${tamanhoPx}px;height:${tamanhoPx}px;min-width:${tamanhoPx}px;background:${corAvatar(nome)};font-size:${fonte}px;">${inicialAvatar(nome)}</span>`;
}
