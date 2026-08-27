import { collection, db, doc, onSnapshot, query, setDoc } from '../firebase/firestore.js';

export async function salvarFatura(uid, dadosFatura) {
  const ref = doc(collection(db, 'users', uid, 'faturas'));
  await setDoc(ref, {
    ...dadosFatura,
    importadoEm: new Date().toISOString(),
  });
  return ref.id;
}

export function ouvirFaturas(uid, callback) {
  return onSnapshot(query(collection(db, 'users', uid, 'faturas')), (snapshot) => {
    const faturas = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(faturas);
  });
}
