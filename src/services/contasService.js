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
      const valorPago = conta.pagamentos?.[mes]?.valorPago ?? conta.valor ?? 0;
      total += valorPago;
      pago += valorPago;
    } else {
      total += conta.valor ?? 0;
      if (status === 'atrasado') atrasado += conta.valor ?? 0;
      else pendente += conta.valor ?? 0;
    }
  }

  return { total, pago, pendente, atrasado };
}
