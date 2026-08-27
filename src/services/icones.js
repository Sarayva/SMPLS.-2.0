const base = (conteudo) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${conteudo}</svg>`;

export const icones = {
  home: base('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/><path d="M9.5 20v-6h5v6"/>'),

  fatura: base('<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><line x1="2.5" y1="10" x2="21.5" y2="10"/><line x1="6" y1="14.5" x2="10" y2="14.5"/>'),

  parcelamentos: base('<rect x="4" y="12" width="3.2" height="8" rx="1" fill="currentColor" stroke="none"/><rect x="10.4" y="7" width="3.2" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="16.8" y="10" width="3.2" height="10" rx="1" fill="currentColor" stroke="none"/>'),

  renda: base('<path d="M4 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><circle cx="15.5" cy="13" r="1.1" fill="currentColor" stroke="none"/>'),

  analises: base('<polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/>'),

  resumo: base('<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="12" y1="16" x2="12" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/>'),

  sol: base('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/>'),

  lua: base('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="currentColor" stroke="none"/>'),

  sair: base('<path d="M12 3v9"/><path d="M18.4 6.6a8 8 0 1 1-12.77 0"/>'),

  voltar: base('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="11,6 5,12 11,18"/>'),

  documento: base('<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><polyline points="13,3 13,8 18,8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>'),

  alerta: base('<path d="M12 3.5 2 20h20L12 3.5Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.01"/>'),
};
