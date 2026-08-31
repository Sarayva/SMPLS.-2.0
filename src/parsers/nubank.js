import { competenciaPorDatas } from './competenciaUtil.js';

const MESES = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

const REGEX_LINHA_TRANSACAO =
  /^(\d{2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))\s*(.*?)(?:\s*(?:-\s*)?(?:Parcela\s+)?(\d+)\/(\d+))?\s*(?:−|-)?R\$\s*([\d.]*,\d{2})$/i;

function paraNumero(valorTexto) {
  return parseFloat(valorTexto.replace(/\./g, '').replace(',', '.'));
}

function paraDataISO(dia, mesAbrev, ano) {
  const mes = MESES[mesAbrev.toUpperCase()];
  if (!mes) return null;
  return `${ano}-${mes}-${dia.padStart(2, '0')}`;
}

export function pareceSerFaturaNubank(linhas) {
  const textoCompleto = linhas.join(' ');
  return /nu pagamentos/i.test(textoCompleto) || /nubank/i.test(textoCompleto);
}

export function parseNubank(linhas, categorizar) {
  const textoCompleto = linhas.join(' ');

  const matchVencimento = textoCompleto.match(/Data de vencimento:\s*(\d{2})\s+([A-ZÇ]{3})\s+(\d{4})/i);
  const vencimento = matchVencimento
    ? paraDataISO(matchVencimento[1], matchVencimento[2], matchVencimento[3])
    : null;
  const anoVencimento = matchVencimento ? parseInt(matchVencimento[3], 10) : null;
  const mesVencimento = vencimento ? parseInt(vencimento.slice(5, 7), 10) : null;

  function dataTransacaoISO(dia, mesAbrev) {
    if (!anoVencimento) return null;
    const mesNum = parseInt(MESES[mesAbrev.toUpperCase()], 10);
    // Fatura pode incluir dias do mês anterior ao vencimento; se o mês da
    // transação vier bem depois do mês de vencimento, ela é do ano anterior.
    const ano = mesVencimento && mesNum - mesVencimento > 1 ? anoVencimento - 1 : anoVencimento;
    return paraDataISO(dia, mesAbrev, String(ano));
  }

  // Algumas faturas trazem um bloco promocional de simulação de parcelamento
  // ("Parcelar em X meses... Total a pagar... Juros totais...") ANTES do
  // resumo real — por isso não basta pegar a primeira ocorrência de "Total a
  // pagar". O total de verdade é sempre seguido por "Pagamento mínimo".
  const matchTotal = textoCompleto.match(/Total a pagar\D*R\$\s*([\d.]*,\d{2})\D*Pagamento m[íi]nimo/i);
  const valorTotal = matchTotal ? paraNumero(matchTotal[1]) : null;

  let matchLimiteTotal = textoCompleto.match(/Limite total do cart[ãa]o de cr[ée]dito:\s*R\$\s*([\d.]*,\d{2})/i);
  if (!matchLimiteTotal) matchLimiteTotal = textoCompleto.match(/limite.*?R\$\s*([\d.]*,\d{2})/i);
  const limiteTotal = matchLimiteTotal ? paraNumero(matchLimiteTotal[1]) : null;

  const matchLimiteUso = textoCompleto.match(/Limite total\s+R\$\s*([\d.]*,\d{2})\s+R\$\s*([\d.]*,\d{2})/i);
  const limiteUtilizado = matchLimiteUso ? paraNumero(matchLimiteUso[1]) : null;

  const matchMinimo = textoCompleto.match(/Pagamento m[íi]nimo[^R]{0,20}R\$\s*([\d.]*,\d{2})/i);
  const pagamentoMinimo = matchMinimo ? paraNumero(matchMinimo[1]) : null;

  const transacoes = [];
  const encargos = [];
  for (const linha of linhas) {
    if (!linha) continue;
    const match = linha.match(REGEX_LINHA_TRANSACAO);
    if (!match) continue;

    const [diaMes, mesAbrev] = match[1].trim().split(/\s+/);
    const descricao = match[2].trim();
    const parcelaAtual = match[3] ? parseInt(match[3], 10) : null;
    const parcelaTotal = match[4] ? parseInt(match[4], 10) : null;
    const valor = paraNumero(match[5]);

    const descricaoLower = descricao.toLowerCase();
    const ehPagamento = descricaoLower.includes('pagamento em') || descricaoLower.includes('pagamento recebido');
    const ehEncargo = ['rotativo', 'juros', 'multa', 'iof', 'encargos', 'saldo restante', 'encerramento de d']
      .some((termo) => descricaoLower.includes(termo));

    if (!descricao) continue;
    if (ehPagamento) continue;

    if (ehEncargo) {
      if (valor) encargos.push({ data: dataTransacaoISO(diaMes, mesAbrev), descricao, valor });
      continue;
    }

    transacoes.push({
      data: dataTransacaoISO(diaMes, mesAbrev),
      descricao,
      valor,
      parcelaAtual,
      parcelaTotal,
      categoria: categorizar(descricao),
    });
  }

  const competencia = competenciaPorDatas(transacoes, encargos, vencimento);

  return {
    banco: 'nubank',
    vencimento,
    competencia,
    valorTotal,
    limiteTotal,
    limiteUtilizado,
    pagamentoMinimo,
    transacoes,
    encargos,
  };
}
