import { collection, db, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc } from '../firebase/firestore.js';

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

export async function marcarFaturaPaga(uid, faturaId, paga) {
  await updateDoc(doc(faturasRef(uid), faturaId), { paga });
}

export function encontrarFaturasDuplicadas(faturas) {
  const grupos = {};
  for (const fatura of faturas) {
    if (!fatura.competencia) continue;
    (grupos[fatura.competencia] ??= []).push(fatura);
  }
  return Object.values(grupos).filter((grupo) => grupo.length > 1);
}

function somarMeses(competencia, quantidade) {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(ano, mes - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

// Se falta uma fatura no meio da sequência (o usuário pulou ou esqueceu de
// importar um mês), qualquer compra parcelada que termine justamente naquele
// mês fica presa pra sempre no número de parcela da última fatura que
// realmente entrou — porque nenhuma fatura seguinte nunca "bate" com ela de
// novo. Detectar o buraco na sequência de competências é a forma de achar
// isso sem adivinhar (não dá pra saber, só pelos parcelamentos, se uma
// compra parou de cobrar porque quitou/foi cancelada ou porque falta fatura).
export function encontrarFaturasFaltando(faturas) {
  const competencias = [...new Set(faturas.map((f) => f.competencia).filter(Boolean))].sort();
  if (competencias.length < 2) return [];

  const faltando = [];
  let mes = competencias[0];
  const ultima = competencias[competencias.length - 1];
  while (mes < ultima) {
    if (!competencias.includes(mes)) faltando.push(mes);
    mes = somarMeses(mes, 1);
  }
  return faltando;
}

export async function mesclarFaturasDuplicadas(uid, grupo) {
  const ordenado = [...grupo].sort((a, b) => (b.importadoEm || '').localeCompare(a.importadoEm || ''));
  const [manter, ...descartar] = ordenado;
  for (const fatura of descartar) {
    await excluirFatura(uid, fatura.id);
  }
  return manter;
}
