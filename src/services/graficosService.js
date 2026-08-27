const TONS_AZUL = [
  '#0078d4', '#3e9be0', '#60cdff', '#8ad9ff', '#b4e4ff',
  '#004c87', '#00304f', '#1a5f8a', '#2d7cb0', '#95c9e8', '#003a66', '#5aa8d6',
];

export function fatiasCategorias(categorias) {
  const total = Object.values(categorias).reduce((soma, v) => soma + v, 0);
  if (total <= 0) return { total: 0, fatias: [] };

  const ordenadas = Object.entries(categorias).sort((a, b) => b[1] - a[1]);

  const fatias = ordenadas.map(([categoria, valor], i) => ({
    categoria,
    valor,
    percentual: (valor / total) * 100,
    cor: TONS_AZUL[i % TONS_AZUL.length],
    categoriasIncluidas: [categoria],
  }));

  return { total, fatias };
}

export function gradienteDonut(fatias) {
  if (!fatias.length) return 'conic-gradient(var(--border-color) 0deg 360deg)';
  let acumulado = 0;
  const partes = fatias.map((fatia) => {
    const inicio = acumulado;
    acumulado += (fatia.percentual / 100) * 360;
    return `${fatia.cor} ${inicio}deg ${acumulado}deg`;
  });
  return `conic-gradient(${partes.join(', ')})`;
}

export function fatiaNoAngulo(fatias, angulo) {
  let acumulado = 0;
  for (const fatia of fatias) {
    const fim = acumulado + (fatia.percentual / 100) * 360;
    if (angulo >= acumulado && angulo < fim) return fatia;
    acumulado = fim;
  }
  return null;
}

export function anguloDoPonteiro(centroX, centroY, x, y) {
  const dx = x - centroX;
  const dy = y - centroY;
  let angulo = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angulo < 0) angulo += 360;
  return { angulo, distancia: Math.sqrt(dx * dx + dy * dy) };
}

export function pontosLinha(valores, largura, altura, margem = 6, maxExterno = null) {
  if (valores.length === 0) return { pontos: [], linha: '', area: '' };
  const max = maxExterno ?? Math.max(...valores, 1);
  const passo = valores.length > 1 ? (largura - margem * 2) / (valores.length - 1) : 0;

  const pontos = valores.map((valor, i) => {
    const x = margem + i * passo;
    const y = altura - margem - (valor / max) * (altura - margem * 2);
    return [x, y];
  });

  const linha = pontos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = pontos.length
    ? `M${pontos[0][0].toFixed(1)},${altura} L${pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${pontos[pontos.length - 1][0].toFixed(1)},${altura} Z`
    : '';

  return { pontos, linha, area };
}
