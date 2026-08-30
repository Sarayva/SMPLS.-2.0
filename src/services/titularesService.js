import { collection, db, doc, getDoc, getDocs, onSnapshot, setDoc } from '../firebase/firestore.js';

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

export function ouvirNomesTitulares(uid, callback) {
  return onSnapshot(titularesRef(uid), (snapshot) => {
    callback(snapshot.docs.map((d) => d.data().nome).filter(Boolean));
  });
}

export function normalizarNomePessoa(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function pareceSerAMesmaPessoa(nomeA, nomeB) {
  const a = normalizarNomePessoa(nomeA);
  const b = normalizarNomePessoa(nomeB);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
