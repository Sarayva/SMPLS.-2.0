const REGRAS = [
  { categoria: 'Alimentação', termos: ['ifood', 'ifd', 'restaurante', 'padaria', 'lanchonete', 'pizzaria', 'burger'] },
  { categoria: 'Combustível', termos: ['posto', 'combustive', 'ipiranga', 'shell', 'petrobras', 'br mania'] },
  { categoria: 'Transporte', termos: ['uber', '99app', 'taxi', 'auto center', 'estacionamento'] },
  { categoria: 'Mercado', termos: ['mercado', 'atacad', 'supermercado', 'hortifruti'] },
  { categoria: 'Assinaturas', termos: ['netflix', 'spotify', 'apple.com', 'amazon prime', 'disney', 'hbo', 'youtube premium'] },
  { categoria: 'Saúde & Bem-estar', termos: ['farmacia', 'drogaria', 'academia', 'wellhub', 'gympass'] },
  { categoria: 'Compras Online', termos: ['shopee', 'mercado livre', 'aliexpress', 'shein', 'netshoes'] },
];

export function categorizar(descricao) {
  const texto = descricao.trim().toLowerCase();
  for (const regra of REGRAS) {
    if (regra.termos.some((termo) => texto.includes(termo))) return regra.categoria;
  }
  return 'Outros';
}
