import {
  collection,
  db,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
} from '../firebase/firestore.js';

function contasRef(uid) {
  return collection(db, 'users', uid, 'contasFixas');
}

function contaRef(uid, contaId) {
  return doc(db, 'users', uid, 'contasFixas', contaId);
}

export function ouvirContas(uid, callback) {
  return onSnapshot(query(contasRef(uid)), (snapshot) => {
    const contas = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(contas);
  });
}

export async function buscarContas(uid) {
  const snapshot = await getDocs(query(contasRef(uid)));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function salvarConta(uid, dados, contaId) {
  if (contaId) {
    await updateDoc(contaRef(uid, contaId), dados);
    return contaId;
  }
  const ref = doc(contasRef(uid));
  await setDoc(ref, {
    ...dados,
    ativa: true,
    pagamentos: {},
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function excluirConta(uid, contaId) {
  await deleteDoc(contaRef(uid, contaId));
}

export async function marcarPago(uid, contaId, mes, valorPago) {
  await updateDoc(contaRef(uid, contaId), {
    [`pagamentos.${mes}`]: {
      pago: true,
      valorPago,
      dataPagamento: new Date().toISOString().slice(0, 10),
    },
  });
}

export async function desmarcarPago(uid, contaId, mes) {
  await updateDoc(contaRef(uid, contaId), {
    [`pagamentos.${mes}`]: deleteField(),
  });
}

// Valor esperado de uma conta num mês específico: usa o ajuste daquele mês
// se existir, senão cai no valor padrão da conta. Editar o valor de um mês
// grava só em "valoresMensais.<mes>" — nunca no valor padrão — pra mudar
// outubro não vazar pra novembro nem pra nenhum outro mês.
export function valorEsperado(conta, mes) {
  const ajuste = conta.valoresMensais?.[mes];
  return ajuste != null ? ajuste : conta.valor ?? null;
}

export async function definirValorMensal(uid, contaId, mes, valor) {
  await updateDoc(contaRef(uid, contaId), {
    [`valoresMensais.${mes}`]: valor,
  });
}

// Preenche o histórico de meses passados de uma vez só (usado pela
// importação de planilha) — só mexe em meses estritamente anteriores ao
// atual, marcados como pagos com o valor real daquele mês, pra não aplicar
// o valor mais recente "espelhado" pra trás. O dia usado na data de
// pagamento é aproximado (dia de vencimento da conta, ou o 1º do mês) já
// que a planilha não traz a data exata. Meses que já têm um pagamento
// registrado (marcado manualmente na tela de Contas) não são sobrescritos —
// a planilha só preenche o que ainda está em branco.
export async function importarHistoricoPagamentos(uid, contaId, historico, diaVencimento, pagamentosExistentes = {}) {
  const mesAtual = mesAtualISO();
  const dia = String(diaVencimento || 1).padStart(2, '0');

  const campos = {};
  for (const { mesISO, valor } of historico) {
    if (!mesISO || mesISO >= mesAtual) continue;
    if (pagamentosExistentes[mesISO]) continue;
    campos[`pagamentos.${mesISO}`] = {
      pago: true,
      valorPago: valor,
      dataPagamento: `${mesISO}-${dia}`,
    };
  }

  if (Object.keys(campos).length === 0) return;
  await updateDoc(contaRef(uid, contaId), campos);
}

function normalizarNomeConta(nome) {
  return (nome || '').trim().toLowerCase();
}

// Mesmo esquema da tela de Parcelamentos: agrupa por nome (sem diferenciar
// maiúscula/espaço nas pontas) e deixa o usuário decidir se quer mesclar —
// nunca mescla sozinho.
export function encontrarContasDuplicadas(contas) {
  const grupos = {};
  for (const c of contas.filter((c) => c.ativa !== false)) {
    const chave = normalizarNomeConta(c.nome);
    (grupos[chave] ??= []).push(c);
  }
  return Object.values(grupos).filter((grupo) => grupo.length > 1);
}

export async function mesclarContasDuplicadas(uid, grupo) {
  // A conta com mais meses de histórico registrados é a mais "completa" —
  // vira a base; o histórico das outras entra por cima só onde a base ainda
  // não tem nada, nunca sobrescrevendo um pagamento já registrado nela.
  const ordenadas = [...grupo].sort((a, b) => Object.keys(b.pagamentos || {}).length - Object.keys(a.pagamentos || {}).length);
  const [vencedora, ...outras] = ordenadas;

  const pagamentos = { ...(vencedora.pagamentos || {}) };
  const valoresMensais = { ...(vencedora.valoresMensais || {}) };
  for (const outra of outras) {
    for (const [mes, pagamento] of Object.entries(outra.pagamentos || {})) {
      if (!pagamentos[mes]) pagamentos[mes] = pagamento;
    }
    for (const [mes, valor] of Object.entries(outra.valoresMensais || {})) {
      if (valoresMensais[mes] == null) valoresMensais[mes] = valor;
    }
  }

  await updateDoc(contaRef(uid, vencedora.id), {
    valor: vencedora.valor ?? outras.find((o) => o.valor != null)?.valor ?? null,
    diaVencimento: vencedora.diaVencimento ?? outras.find((o) => o.diaVencimento != null)?.diaVencimento ?? null,
    pagamentos,
    valoresMensais,
  });

  for (const outra of outras) {
    await deleteDoc(contaRef(uid, outra.id));
  }
}

export function mesAtualISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

// Contas que vêm da fatura do cartão (assinaturas: Spotify, Wellhub...)
// têm começo e fim — só valem entre o mês da fatura em que foram marcadas
// e o mês em que foram encerradas. Contas comuns não têm nenhum dos dois e
// continuam valendo em todos os meses, como sempre.
export function contaVigenteNoMes(conta, mes) {
  if (conta.ativa === false) return false;
  if (conta.mesInicio && mes < conta.mesInicio) return false;
  if (conta.mesFim && mes > conta.mesFim) return false;
  return true;
}

export function ehContaCartao(conta) {
  return conta?.origem === 'cartao';
}

// Valor de uma conta do cartão num mês: se a fatura que vence nesse mês já
// foi importada, é exatamente o que foi vinculado a essa conta nela (nada
// vinculado = zero, a compra continua contando como gasto do cartão). Sem
// fatura ainda (mês futuro), usa o último valor conhecido. Assim nunca conta
// duas vezes, mesmo se a fatura for reimportada com a marcação desfeita.
export function valorContaCartaoNoMes(conta, mes, faturas) {
  const faturasDoMes = (faturas || []).filter((f) => f.vencimento && f.vencimento.slice(0, 7) === mes);
  if (faturasDoMes.length === 0) return valorEsperado(conta, mes);
  return faturasDoMes
    .flatMap((f) => f.transacoes || [])
    .filter((t) => t.contaFixaId === conta.id)
    .reduce((s, t) => s + t.valor, 0);
}

// Uma compra marcada como conta fixa sai da parte "cartão" dos totais —
// mas só enquanto a conta existir e valer naquele mês. Se a conta foi
// excluída ou encerrada antes, a compra volta a contar como gasto do cartão
// em vez de sumir.
export function transacaoViraContaFixa(transacao, mes, contas) {
  if (!transacao.contaFixaId) return false;
  const conta = contas.find((c) => c.id === transacao.contaFixaId);
  return Boolean(conta && ehContaCartao(conta) && contaVigenteNoMes(conta, mes));
}

export function statusConta(conta, mes) {
  if (ehContaCartao(conta)) return 'cartao';
  const pagamento = conta.pagamentos?.[mes];
  if (pagamento?.pago) return 'pago';

  const atual = mesAtualISO();
  if (mes < atual) return 'atrasado';
  if (mes === atual && conta.diaVencimento < new Date().getDate()) return 'atrasado';
  return 'pendente';
}

export function calcularTotais(contas, mes) {
  let total = 0;
  let pago = 0;
  let pendente = 0;
  let atrasado = 0;

  for (const conta of contas.filter((c) => contaVigenteNoMes(c, mes))) {
    const status = statusConta(conta, mes);
    if (status === 'cartao') {
      total += valorEsperado(conta, mes) ?? 0;
    } else if (status === 'pago') {
      const valorPago = conta.pagamentos?.[mes]?.valorPago ?? valorEsperado(conta, mes) ?? 0;
      total += valorPago;
      pago += valorPago;
    } else {
      const valor = valorEsperado(conta, mes) ?? 0;
      total += valor;
      if (status === 'atrasado') atrasado += valor;
      else pendente += valor;
    }
  }

  return { total, pago, pendente, atrasado };
}
