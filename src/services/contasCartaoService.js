import { collection, db, doc, setDoc, updateDoc } from '../firebase/firestore.js';
import { semPrefixoCartao } from '../parsers/descricaoUtil.js';
import { ehContaCartao } from './contasService.js';

function contasRef(uid) {
  return collection(db, 'users', uid, 'contasFixas');
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function somarMeses(mes, quantidade) {
  const [ano, m] = mes.split('-').map(Number);
  const data = new Date(ano, m - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function textoDeBusca(descricao) {
  return semPrefixoCartao(descricao).toLowerCase().replace(/\s+/g, ' ').trim();
}

// A mesma assinatura muda de nome de um mês pro outro ("Dm*Spotify" →
// "Ebn*Spotify", "Cartaodetodo* Ago" → "Cartaodetodo* Set", "Tokio
// Marine*Auto09d11" → "Auto10d11"), então o reconhecimento é por uma
// palavra-chave e não pelo nome inteiro. Esta é só a sugestão inicial —
// quem marca pode ajustar.
export function sugerirPalavraChave(descricao) {
  let texto = textoDeBusca(descricao);
  const asterisco = texto.indexOf('*');
  if (asterisco !== -1) {
    const antes = texto.slice(0, asterisco).trim();
    const depois = texto.slice(asterisco + 1).trim();
    // Antes do "*" costuma vir o intermediador de pagamento ("dm", "ebn",
    // "dl", "mp") quando é curto, ou o nome da loja quando é longo.
    texto = antes.length <= 4 ? depois : antes;
  }
  // Número no fim da palavra costuma ser código que muda todo mês
  // ("ingressos566" → "ingressos"); palavra com número no meio
  // ("auto09d11") é descartada inteira.
  const palavras = texto
    .split(' ')
    .map((p) => p.replace(/\d+$/, ''))
    .filter((p) => p && !/\d/.test(p) && !MESES_ABREV.includes(p));
  return palavras.slice(0, 2).join(' ') || textoDeBusca(descricao);
}

export function transacaoCasaComPalavraChave(transacao, palavraChave) {
  const chave = (palavraChave || '').trim().toLowerCase();
  return Boolean(chave) && !transacao.parcelaTotal && textoDeBusca(transacao.descricao).includes(chave);
}

// Pra cada conta do cartão já cadastrada, procura a compra dela nesta fatura.
// Devolve, por índice de transação, o que a prévia deve mostrar já marcado:
// - conta que vale neste mês (ou começa depois, fatura antiga) → vincula;
// - conta encerrada antes deste mês → "voltou", cadastra de novo.
// Também devolve as contas que acharam mais de uma compra (ex: duas
// cobranças com "uber") — só a primeira é vinculada, e a prévia avisa.
export function reconhecerContasNaFatura(transacoes, contas, mesFatura) {
  const marcacoes = {};
  const repetidas = [];
  const contasCartao = contas.filter((c) => ehContaCartao(c) && c.ativa !== false && c.palavraChave);
  const encerradaAntes = (c) => Boolean(c.mesFim && mesFatura > c.mesFim);

  // Contas em andamento têm prioridade sobre as já encerradas, pra não
  // "reativar" uma antiga quando é a atual que casa com a compra.
  const ordenadas = [...contasCartao].sort((a, b) => Number(encerradaAntes(a)) - Number(encerradaAntes(b)));
  const palavrasJaUsadas = new Set();

  for (const conta of ordenadas) {
    const chave = conta.palavraChave.trim().toLowerCase();
    // Várias encerradas com a mesma palavra (a assinatura foi e voltou mais
    // de uma vez): basta a primeira pra reconhecer.
    if (encerradaAntes(conta) && palavrasJaUsadas.has(chave)) continue;

    const indices = transacoes
      .map((t, i) => (transacaoCasaComPalavraChave(t, chave) && !marcacoes[i] ? i : -1))
      .filter((i) => i !== -1);
    if (indices.length === 0) continue;
    palavrasJaUsadas.add(chave);
    if (indices.length > 1) repetidas.push({ conta, quantidade: indices.length });

    marcacoes[indices[0]] = {
      marcada: true,
      palavraChave: conta.palavraChave,
      contaId: encerradaAntes(conta) ? null : conta.id,
      voltou: encerradaAntes(conta),
      nomeConta: conta.nome,
    };
  }

  return { marcacoes, repetidas };
}

// Contas do cartão que valiam até agora e não apareceram nesta fatura —
// candidatas a encerrar (a prévia pergunta; nada é encerrado sozinho).
export function contasAusentesNaFatura(contas, idsVinculados, mesFatura) {
  return contas.filter(
    (c) =>
      ehContaCartao(c) &&
      c.ativa !== false &&
      !c.mesFim &&
      (c.mesInicio || '') <= mesFatura &&
      !idsVinculados.has(c.id)
  );
}

export async function criarContaCartao(uid, { nome, categoria, valor, palavraChave, mes, diaVencimento }) {
  const ref = doc(contasRef(uid));
  await setDoc(ref, {
    nome,
    categoria,
    valor,
    valorVariavel: false,
    diaVencimento,
    observacoes: '',
    origem: 'cartao',
    palavraChave,
    mesInicio: mes,
    mesFim: null,
    ultimoMesCobrado: mes,
    valoresMensais: { [mes]: valor },
    ativa: true,
    pagamentos: {},
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

// Registra a cobrança do mês numa conta que já existe: guarda o valor
// daquele mês, puxa o começo pra trás se for uma fatura mais antiga, e só
// troca o valor "atual" da conta se esta for a cobrança mais recente.
export async function registrarCobrancaCartao(uid, conta, { valor, palavraChave, mes, diaVencimento }) {
  const campos = {
    [`valoresMensais.${mes}`]: valor,
    palavraChave,
  };
  if (!conta.mesInicio || mes < conta.mesInicio) campos.mesInicio = mes;
  if (!conta.ultimoMesCobrado || mes >= conta.ultimoMesCobrado) {
    campos.ultimoMesCobrado = mes;
    campos.valor = valor;
    campos.diaVencimento = diaVencimento;
  }
  await updateDoc(doc(contasRef(uid), conta.id), campos);
}

// Encerrar não apaga: a conta para de valer a partir deste mês, mas os
// meses em que ela existiu continuam contando certo.
export async function encerrarContaCartao(uid, contaId, mesFatura) {
  await updateDoc(doc(contasRef(uid), contaId), { mesFim: somarMeses(mesFatura, -1) });
}
