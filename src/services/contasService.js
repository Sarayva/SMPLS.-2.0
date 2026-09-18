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

export function statusConta(conta, mes) {
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

  for (const conta of contas.filter((c) => c.ativa !== false)) {
    const status = statusConta(conta, mes);
    if (status === 'pago') {
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
