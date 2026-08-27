import { collection, db, deleteDoc, doc, getDocs, onSnapshot, query, setDoc } from '../firebase/firestore.js';

function faturasRef(uid) {
  return collection(db, 'users', uid, 'faturas');
}

export async function salvarFatura(uid, dadosFatura) {
  const ref = doc(faturasRef(uid));
  await setDoc(ref, {
    ...dadosFatura,
    importadoEm: new Date().toISOString(),
  });
  return ref.id;
}

export function ouvirFaturas(uid, callback) {
  return onSnapshot(query(faturasRef(uid)), (snapshot) => {
    const faturas = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(faturas);
  });
}

export async function buscarFaturaPorCompetencia(uid, competencia) {
  const snapshot = await getDocs(faturasRef(uid));
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((f) => f.competencia === competencia);
}

export async function excluirFatura(uid, faturaId) {
  await deleteDoc(doc(faturasRef(uid), faturaId));
}

export function encontrarFaturasDuplicadas(faturas) {
  const grupos = {};
  for (const fatura of faturas) {
    if (!fatura.competencia) continue;
    (grupos[fatura.competencia] ??= []).push(fatura);
  }
  return Object.values(grupos).filter((grupo) => grupo.length > 1);
}

export async function mesclarFaturasDuplicadas(uid, grupo) {
  const ordenado = [...grupo].sort((a, b) => (b.importadoEm || '').localeCompare(a.importadoEm || ''));
  const [manter, ...descartar] = ordenado;
  for (const fatura of descartar) {
    await excluirFatura(uid, fatura.id);
  }
  return manter;
}
