import { collection, db, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from '../firebase/firestore.js';
import { buscarCategoriasCompras, definirCategoriaCompra } from './categoriasComprasService.js';

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

function categoriasIgnoradasRef(uid) {
  return collection(db, 'users', uid, 'categoriasIgnoradas');
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

function normalizarNomeCategoria(nome) {
  return (nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Distância de edição simples (Levenshtein) — pega diferenças pequenas de
// grafia (singular/plural, acento esquecido, letra a mais) sem precisar
// codificar regra nenhuma de plural do português.
function distanciaEdicao(a, b) {
  const linhas = a.length + 1;
  const colunas = b.length + 1;
  const dist = Array.from({ length: linhas }, (_, i) => [i, ...Array(colunas - 1).fill(0)]);
  for (let j = 0; j < colunas; j++) dist[0][j] = j;

  for (let i = 1; i < linhas; i++) {
    for (let j = 1; j < colunas; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + custo);
    }
  }
  return dist[linhas - 1][colunas - 1];
}

// Chave estável pra um grupo de categorias parecidas, independente da ordem
// — usada tanto pra guardar "ignorar esse grupo" quanto pra reconhecer o
// mesmo grupo de novo depois (ex: se uma terceira categoria parecida surgir
// e o grupo mudar de tamanho, ele já não é mais "o mesmo grupo").
function chaveGrupoCategorias(nomes) {
  return nomes.map(normalizarNomeCategoria).sort().join('|');
}

export async function buscarGruposIgnorados(uid) {
  const snapshot = await getDocs(categoriasIgnoradasRef(uid));
  return new Set(snapshot.docs.map((d) => d.id));
}

export async function ignorarGrupoCategorias(uid, nomes) {
  const chave = chaveGrupoCategorias(nomes);
  await setDoc(doc(categoriasIgnoradasRef(uid), encodeURIComponent(chave)), {
    nomes,
    ignoradoEm: new Date().toISOString(),
  });
}

// Agrupa categorias com grafia bem parecida (ex: "Compra Pontual" e "Compras
// Pontuais") pra revisão manual — nunca decide sozinho qual fica, só sugere.
// Grupos que o usuário já marcou como "não é duplicata" (gruposIgnorados)
// ficam de fora.
export function encontrarCategoriasSimilares(categorias, gruposIgnorados = new Set()) {
  const grupos = [];
  const usadas = new Set();

  for (let i = 0; i < categorias.length; i++) {
    if (usadas.has(categorias[i].id)) continue;
    const grupo = [categorias[i]];
    const normA = normalizarNomeCategoria(categorias[i].nome);

    for (let j = i + 1; j < categorias.length; j++) {
      if (usadas.has(categorias[j].id)) continue;
      const normB = normalizarNomeCategoria(categorias[j].nome);
      if (normA === normB) continue; // nome idêntico não é o caso que queremos aqui

      const distancia = distanciaEdicao(normA, normB);
      const limite = Math.max(2, Math.ceil(Math.max(normA.length, normB.length) * 0.25));
      if (distancia > 0 && distancia <= limite) {
        grupo.push(categorias[j]);
        usadas.add(categorias[j].id);
      }
    }

    if (grupo.length > 1) {
      usadas.add(categorias[i].id);
      const chave = chaveGrupoCategorias(grupo.map((c) => c.nome));
      if (!gruposIgnorados.has(encodeURIComponent(chave))) {
        grupos.push(grupo);
      }
    }
  }

  return grupos;
}

// Junta um grupo de categorias parecidas num nome só: renomeia contas
// fixas e regras de categoria de compras que usavam os nomes antigos,
// e apaga as categorias duplicadas da lista (mantém só a escolhida).
export async function unificarCategorias(uid, tipo, categoriasDoGrupo, nomeEscolhido) {
  const nomesAntigos = categoriasDoGrupo.map((c) => c.nome).filter((nome) => nome !== nomeEscolhido);

  if (tipo === 'contas') {
    const snapshot = await getDocs(collection(db, 'users', uid, 'contasFixas'));
    for (const docSnap of snapshot.docs) {
      if (nomesAntigos.includes(docSnap.data().categoria)) {
        await updateDoc(doc(db, 'users', uid, 'contasFixas', docSnap.id), { categoria: nomeEscolhido });
      }
    }
  } else {
    const overrides = await buscarCategoriasCompras(uid);
    for (const [chave, categoria] of Object.entries(overrides)) {
      if (nomesAntigos.includes(categoria)) {
        await definirCategoriaCompra(uid, chave, nomeEscolhido);
      }
    }
  }

  for (const categoria of categoriasDoGrupo) {
    if (categoria.nome !== nomeEscolhido) {
      await removerCategoria(uid, categoria.id);
    }
  }
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
