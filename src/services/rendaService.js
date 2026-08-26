import { collection, db, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc } from '../firebase/firestore.js';

function rendasRef(uid) {
  return collection(db, 'users', uid, 'rendas');
}

export function ouvirRendas(uid, callback) {
  return onSnapshot(query(rendasRef(uid)), (snapshot) => {
    const rendas = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(rendas);
  });
}

export async function salvarRenda(uid, dados, rendaId) {
  if (rendaId) {
    await updateDoc(doc(rendasRef(uid), rendaId), dados);
    return rendaId;
  }
  const ref = doc(rendasRef(uid));
  await setDoc(ref, { ...dados, ativa: true, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function excluirRenda(uid, rendaId) {
  await deleteDoc(doc(rendasRef(uid), rendaId));
}
