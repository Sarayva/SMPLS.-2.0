import { collection, db, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from '../firebase/firestore.js';

export const PADRAO_CONTAS = [
  'Aluguel/Financiamento', 'Condomínio', 'IPTU', 'Energia', 'Água', 'Gás',
  'Internet', 'Celular', 'Streaming', 'Plano de saúde', 'Academia', 'Seguro', 'Educação', 'Outros',
];

export const PADRAO_CARTAO = [
  'Alimentação', 'Combustível', 'Transporte', 'Mercado', 'Assinaturas',
  'Saúde & Bem-estar', 'Compras Online', 'Outros',
];

function categoriasRef(uid) {
  return collection(db, 'users', uid, 'categorias');
}

function configRef(uid) {
  return doc(db, 'users', uid, 'config', 'categorias');
}

export function ouvirCategorias(uid, tipo, callback) {
  return onSnapshot(query(categoriasRef(uid), where('tipo', '==', tipo)), (snapshot) => {
    const categorias = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    callback(categorias);
  });
}

export async function buscarCategorias(uid, tipo) {
  const snapshot = await getDocs(query(categoriasRef(uid), where('tipo', '==', tipo)));
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function adicionarCategoria(uid, tipo, nome) {
  const ref = doc(categoriasRef(uid));
  await setDoc(ref, { nome: nome.trim(), tipo, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function removerCategoria(uid, categoriaId) {
  await deleteDoc(doc(categoriasRef(uid), categoriaId));
}

export async function garantirCategoriasPadrao(uid) {
  const configSnap = await getDoc(configRef(uid));
  if (configSnap.exists()) return;

  await setDoc(configRef(uid), { inicializado: true });
  for (const nome of PADRAO_CONTAS) {
    await setDoc(doc(categoriasRef(uid)), { nome, tipo: 'contas', createdAt: new Date().toISOString() });
  }
  for (const nome of PADRAO_CARTAO) {
    await setDoc(doc(categoriasRef(uid)), { nome, tipo: 'cartao', createdAt: new Date().toISOString() });
  }
}
