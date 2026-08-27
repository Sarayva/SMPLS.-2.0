import { collection, db, doc, onSnapshot, query, setDoc } from '../firebase/firestore.js';

function categoriasComprasRef(uid) {
  return collection(db, 'users', uid, 'categoriasCompras');
}

export function chaveCompra(descricao) {
  // "/" não pode aparecer num ID de documento do Firestore (vira separador
  // de caminho) — troca por um espaço antes de normalizar.
  return (descricao || '').trim().toLowerCase().replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || 'sem-descricao';
}

export function ouvirCategoriasCompras(uid, callback) {
  return onSnapshot(query(categoriasComprasRef(uid)), (snapshot) => {
    const mapa = {};
    snapshot.docs.forEach((docSnap) => {
      mapa[docSnap.id] = docSnap.data().categoria;
    });
    callback(mapa);
  });
}

export async function definirCategoriaCompra(uid, descricao, categoria) {
  const chave = chaveCompra(descricao);
  await setDoc(doc(categoriasComprasRef(uid), chave), {
    descricao,
    categoria,
    atualizadoEm: new Date().toISOString(),
  });
}

export function categoriaResolvida(overrides, descricao, categoriaOriginal) {
  return overrides?.[chaveCompra(descricao)] ?? categoriaOriginal;
}
