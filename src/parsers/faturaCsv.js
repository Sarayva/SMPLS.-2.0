import { competenciaPorDatas } from './competenciaUtil.js';
import { limparDescricao } from './descricaoUtil.js';

function parseValorCSV(texto) {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(limpo);
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

export function pareceSerFaturaCsv(textoCSV) {
  const primeiraLinha = (textoCSV.split(/\r\n|\n/)[0] || '').toLowerCase();
  return primeiraLinha.includes('date') && primeiraLinha.includes('title') && primeiraLinha.includes('amount');
}

// O export em CSV da fatura não traz vencimento, limite nem pagamento
// mínimo — só a lista de compras. O vencimento vem do nome do arquivo,
// que o Nubank já nomeia como "Nubank_AAAA-MM-DD.csv".
export function competenciaDoNomeArquivo(nomeArquivo) {
  const match = nomeArquivo.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function parseFaturaCsv(textoCSV, nomeArquivo, categorizar) {
  const linhas = textoCSV.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  const vencimento = competenciaDoNomeArquivo(nomeArquivo);

  const transacoes = [];
  const encargos = [];
  const creditos = [];

  for (let i = 1; i < linhas.length; i++) {
    const [dataTexto, tituloTexto, valorTexto] = parseLinhaCSV(linhas[i]);
    if (!dataTexto || !tituloTexto || valorTexto == null) continue;

    const { descricao, antecipada } = limparDescricao(tituloTexto.trim());
    const valor = parseValorCSV(valorTexto);
    if (!Number.isFinite(valor)) continue;

    const descricaoLower = descricao.toLowerCase();
    const ehPagamento = descricaoLower.includes('pagamento em') || descricaoLower.includes('pagamento recebido');
    const ehEncargo = ['rotativo', 'juros', 'multa', 'iof', 'encargos', 'saldo restante', 'encerramento de d']
      .some((termo) => descricaoLower.includes(termo));

    if (ehPagamento) continue;

    // Valor negativo que não é pagamento (ex: "Desconto Antecipação") é um
    // abatimento — antes o Math.abs transformava ele em mais uma compra.
    if (valor < 0) {
      creditos.push({ data: dataTexto, descricao, valor: Math.abs(valor) });
      continue;
    }

    if (ehEncargo) {
      if (valor) encargos.push({ data: dataTexto, descricao, valor: Math.abs(valor) });
      continue;
    }

    const matchParcela = descricao.match(/-\s*Parcela\s+(\d+)\/(\d+)\s*$/i);
    const nomeSemParcela = matchParcela ? descricao.slice(0, matchParcela.index).trim() : descricao;

    transacoes.push({
      data: dataTexto,
      descricao: nomeSemParcela,
      valor: Math.abs(valor),
      parcelaAtual: matchParcela ? parseInt(matchParcela[1], 10) : null,
      parcelaTotal: matchParcela ? parseInt(matchParcela[2], 10) : null,
      ...(antecipada ? { antecipada: true } : {}),
      categoria: categorizar(nomeSemParcela),
    });
  }

  // O CSV não escreve "Antecipada" na parcela adiantada (o PDF escreve) — a
  // única pista é o "Desconto Antecipação" lançado no mesmo dia. Uma parcela
  // 2/2 nesse dia é a antecipação de uma compra já existente, não outra compra.
  const diasComAntecipacao = new Set(
    creditos.filter((c) => /desconto antecipa/i.test(c.descricao)).map((c) => c.data)
  );
  for (const t of transacoes) {
    if (t.parcelaAtual > 1 && diasComAntecipacao.has(t.data)) t.antecipada = true;
  }

  const valorTotal =
    transacoes.reduce((s, t) => s + t.valor, 0) +
    encargos.reduce((s, e) => s + e.valor, 0) -
    creditos.reduce((s, c) => s + c.valor, 0);
  const competencia = competenciaPorDatas(transacoes, encargos, vencimento);

  return {
    banco: 'nubank',
    origem: 'csv',
    vencimento,
    competencia,
    valorTotal: valorTotal ? Math.round(valorTotal * 100) / 100 : null,
    valorTotalEstimado: true,
    limiteTotal: null,
    limiteUtilizado: null,
    pagamentoMinimo: null,
    transacoes,
    encargos,
    creditos,
  };
}
