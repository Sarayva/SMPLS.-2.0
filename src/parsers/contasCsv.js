const REGRAS_CATEGORIA = [
  { categoria: 'Energia', termos: ['luz', 'energia', 'cemig', 'cpfl', 'enel'] },
  { categoria: 'Água', termos: ['agua', 'saae', 'sabesp'] },
  { categoria: 'Gás', termos: ['gas'] },
  { categoria: 'Internet', termos: ['net', 'internet', 'wifi', 'fibra'] },
  { categoria: 'Celular', termos: ['vivo', 'claro', 'tim ', 'celular'] },
  { categoria: 'Condomínio', termos: ['condominio'] },
  { categoria: 'IPTU', termos: ['iptu'] },
  { categoria: 'Aluguel/Financiamento', termos: ['financiamento', 'financ', 'aluguel', 'prestacao'] },
  { categoria: 'Educação', termos: ['facul', 'escola', 'curso'] },
  { categoria: 'Saúde', termos: ['terapia', 'psico', 'academia', 'plano de saude'] },
  { categoria: 'Compras', termos: ['shopee', 'havan', 'magalu', 'americanas'] },
];

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function categorizarConta(nome) {
  const texto = normalizarTexto(nome);
  for (const regra of REGRAS_CATEGORIA) {
    if (regra.termos.some((termo) => texto.includes(termo))) return regra.categoria;
  }
  return '';
}

function parseLinhaCSV(linha) {
  const campos = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

function parseValorBR(texto) {
  if (!texto) return null;
  const limpo = texto.replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return null;
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  const valor = parseFloat(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function separarNomeDia(textoOriginal) {
  const texto = textoOriginal.trim();
  const match = texto.match(/\b([1-9]|[12]\d|3[01])\b/);
  if (!match) return { nome: texto, dia: null };

  const dia = Number(match[1]);
  const nome = (texto.slice(0, match.index) + texto.slice(match.index + match[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { nome: nome || texto, dia };
}

function formatarNome(nome) {
  return nome
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());
}

export function parseContasCsv(textoCSV) {
  const linhas = textoCSV.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return [];

  const cabecalho = parseLinhaCSV(linhas[0]);
  const meses = cabecalho.slice(1).map((m) => m.trim());

  const contas = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = parseLinhaCSV(linhas[i]);
    const nomeOriginal = (campos[0] || '').trim();
    if (!nomeOriginal) continue;

    const valoresPorMes = meses.map((mes, idx) => ({ mes, valor: parseValorBR(campos[idx + 1]) }));
    const valoresPreenchidos = valoresPorMes.filter((v) => v.valor != null);
    if (valoresPreenchidos.length === 0) continue;

    const valorSugerido = valoresPreenchidos[valoresPreenchidos.length - 1].valor;
    const ultimoPreenchidoIdx = valoresPorMes.map((v) => v.valor != null).lastIndexOf(true);
    const pareceTemporaria = ultimoPreenchidoIdx < meses.length - 1;
    const pareceCartao = /^nu\b/i.test(nomeOriginal) || /nubank/i.test(nomeOriginal);

    const { nome, dia } = separarNomeDia(nomeOriginal);

    contas.push({
      nomeOriginal,
      nome: formatarNome(nome),
      categoria: categorizarConta(nomeOriginal),
      valor: valorSugerido,
      diaVencimento: dia,
      pareceTemporaria,
      pareceCartao,
    });
  }

  return contas;
}
