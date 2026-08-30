import { db, doc, getDoc, onSnapshot, setDoc } from '../firebase/firestore.js';

function familiaRef(uid) {
  return doc(db, 'users', uid, 'config', 'familia');
}

export async function buscarNomesFamilia(uid) {
  const snap = await getDoc(familiaRef(uid));
  return snap.exists() ? snap.data().nomes || [] : [];
}

export async function salvarNomesFamilia(uid, nomes) {
  await setDoc(familiaRef(uid), { nomes });
}

export function ouvirNomesFamilia(uid, callback) {
  return onSnapshot(familiaRef(uid), (snap) => {
    callback(snap.exists() ? snap.data().nomes || [] : []);
  });
}
