import { collection, db, doc, getDocs, query, setDoc } from '../firebase/firestore.js';

function vinculosRef(uid) {
  return collection(db, 'users', uid, 'vinculosContas');
}

export function chaveVinculo(contraparte) {
  return (contraparte || '').trim().toLowerCase().replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || 'sem-descricao';
}

export async function buscarVinculos(uid) {
  const snapshot = await getDocs(query(vinculosRef(uid)));
  const mapa = {};
  snapshot.docs.forEach((docSnap) => {
    mapa[docSnap.id] = docSnap.data().contaFixaId;
  });
  return mapa;
}

export async function definirVinculo(uid, contraparte, contaFixaId) {
  await setDoc(doc(vinculosRef(uid), chaveVinculo(contraparte)), {
    contraparte,
    contaFixaId,
    atualizadoEm: new Date().toISOString(),
  });
}

export function contaVinculada(vinculos, contraparte) {
  return vinculos?.[chaveVinculo(contraparte)] ?? null;
}
