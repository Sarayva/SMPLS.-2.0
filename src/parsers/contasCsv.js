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

const MESES_POR_NOME = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

function anoCompleto(anoTexto) {
  return anoTexto.length <= 2 ? 2000 + Number(anoTexto) : Number(anoTexto);
}

// Cada planilha do usuário nomeia os meses de um jeito diferente ("jan/25",
// "01/2025", "2025-01"...) — tenta reconhecer os formatos mais comuns pra
// virar "YYYY-MM" e permitir guardar o valor histórico de cada mês. Quando
// não reconhece, retorna null e essa coluna só entra no valor mais recente
// (comportamento antigo), sem virar histórico.
function interpretarMesCabecalho(textoOriginal) {
  const texto = (textoOriginal || '').trim();
  if (!texto) return null;

  let m = texto.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;

  m = texto.match(/^(\d{1,2})[/\-](\d{2,4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
    return `${anoCompleto(m[2])}-${String(m[1]).padStart(2, '0')}`;
  }

  // Tira tudo que não é letra/número ("fev.-26" → "fev26", "marc/26" →
  // "marc26") e usa só as 3 primeiras letras — cobre abreviação, nome
  // completo e pequenos erros de digitação ("marc" em vez de "mar").
  m = normalizarTexto(texto)
    .replace(/[^a-z0-9]/g, '')
    .match(/^([a-z]+)(\d{2,4})$/);
  if (m) {
    const mesNumero = MESES_POR_NOME[m[1].slice(0, 3)];
    if (mesNumero) return `${anoCompleto(m[2])}-${String(mesNumero).padStart(2, '0')}`;
  }

  return null;
}

function categorizarConta(nome) {
  const texto = normalizarTexto(nome);
  for (const regra of REGRAS_CATEGORIA) {
    if (regra.termos.some((termo) => texto.includes(termo))) return regra.categoria;
  }
  return '';
}

function parseLinhaCSV(linha, delimitador) {
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
    } else if (c === delimitador) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

// Excel/Google Sheets em PT-BR costuma exportar CSV com ";" (porque "," já é
// o separador decimal de "R$ 977,29") — detecta pelo cabeçalho em vez de
// assumir vírgula, senão cada valor em reais quebra em dois campos.
function detectarDelimitador(linhaCabecalho) {
  const pontoEVirgula = (linhaCabecalho.match(/;/g) || []).length;
  const virgula = (linhaCabecalho.match(/,/g) || []).length;
  return pontoEVirgula >= virgula ? ';' : ',';
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

export function parseContasCsv(textoCSVOriginal) {
  const textoCSV = textoCSVOriginal.replace(/^﻿/, '');
  const linhas = textoCSV.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return [];

  const delimitador = detectarDelimitador(linhas[0]);
  const cabecalho = parseLinhaCSV(linhas[0], delimitador);
  const meses = cabecalho.slice(1).map((m) => m.trim());

  const contas = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = parseLinhaCSV(linhas[i], delimitador);
    const nomeOriginal = (campos[0] || '').trim();
    if (!nomeOriginal) continue;
    if (normalizarTexto(nomeOriginal) === 'total') continue;

    const valoresPorMes = meses.map((mes, idx) => ({
      mesOriginal: mes,
      mesISO: interpretarMesCabecalho(mes),
      valor: parseValorBR(campos[idx + 1]),
    }));
    const valoresPreenchidos = valoresPorMes.filter((v) => v.valor != null);
    if (valoresPreenchidos.length === 0) continue;

    const valorSugerido = valoresPreenchidos[valoresPreenchidos.length - 1].valor;
    const ultimoPreenchidoIdx = valoresPorMes.map((v) => v.valor != null).lastIndexOf(true);
    const pareceTemporaria = ultimoPreenchidoIdx < meses.length - 1;
    const pareceCartao = /^nu\b/i.test(nomeOriginal) || /nubank/i.test(nomeOriginal);

    // Histórico só entra pra meses cujo cabeçalho deu pra identificar como
    // uma data real — os outros continuam servindo só pra escolher o valor
    // mais recente (comportamento antigo), sem virar pagamento retroativo.
    const historico = valoresPreenchidos.filter((v) => v.mesISO);
    const mesesNaoIdentificados = valoresPreenchidos.length - historico.length;

    const { nome, dia } = separarNomeDia(nomeOriginal);

    contas.push({
      nomeOriginal,
      nome: formatarNome(nome),
      categoria: categorizarConta(nomeOriginal),
      valor: valorSugerido,
      diaVencimento: dia,
      pareceTemporaria,
      pareceCartao,
      historico,
      mesesNaoIdentificados,
    });
  }

  return contas;
}
