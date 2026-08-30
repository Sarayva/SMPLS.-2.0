import { collection, db, deleteDoc, doc, getDocs, onSnapshot, query, setDoc } from '../firebase/firestore.js';

function extratosRef(uid) {
  return collection(db, 'users', uid, 'extratos');
}

export async function salvarExtrato(uid, dadosExtrato) {
  const ref = doc(extratosRef(uid));
  await setDoc(ref, {
    ...dadosExtrato,
    importadoEm: new Date().toISOString(),
  });
  return ref.id;
}

export function ouvirExtratos(uid, callback) {
  return onSnapshot(query(extratosRef(uid)), (snapshot) => {
    const extratos = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(extratos);
  });
}

export async function buscarExtratoPorPeriodo(uid, numeroConta, periodoInicio, periodoFim) {
  const snapshot = await getDocs(extratosRef(uid));
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((e) => e.numeroConta === numeroConta && e.periodoInicio === periodoInicio && e.periodoFim === periodoFim);
}

export async function excluirExtrato(uid, extratoId) {
  await deleteDoc(doc(extratosRef(uid), extratoId));
}
