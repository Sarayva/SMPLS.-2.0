import { collection, db, doc, setDoc } from '../firebase/firestore.js';

export async function salvarFatura(uid, dadosFatura) {
  const ref = doc(collection(db, 'users', uid, 'faturas'));
  await setDoc(ref, {
    ...dadosFatura,
    importadoEm: new Date().toISOString(),
  });
  return ref.id;
}
