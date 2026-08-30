import { collection, db, doc, getDoc, getDocs, setDoc } from '../firebase/firestore.js';

function titularesRef(uid) {
  return collection(db, 'users', uid, 'titulares');
}

export async function buscarTitular(uid, numeroConta) {
  if (!numeroConta) return null;
  const snap = await getDoc(doc(titularesRef(uid), numeroConta));
  return snap.exists() ? snap.data().nome : null;
}

export async function definirTitular(uid, numeroConta, nome) {
  await setDoc(doc(titularesRef(uid), numeroConta), { nome });
}

// Pra reconhecer transferências entre as contas da própria família (ex:
// marido manda Pix pra mulher) e não contar isso como gasto de verdade.
export async function listarNomesTitulares(uid) {
  const snapshot = await getDocs(titularesRef(uid));
  return snapshot.docs.map((d) => d.data().nome).filter(Boolean);
}
