import { collection, db, doc, getDoc, getDocs, onSnapshot, query, setDoc } from '../firebase/firestore.js';
import { semPrefixoCartao } from '../parsers/descricaoUtil.js';

function categoriasComprasRef(uid) {
  return collection(db, 'users', uid, 'categoriasCompras');
}

// Coleção fora do espaço de qualquer usuário — quando alguém ensina uma
// categoria pra uma compra, isso vira sugestão pra qualquer outro usuário
// do app que tiver a mesma compra, sem obrigar ninguém: a categoria pessoal
// de cada um (categoriasComprasRef) sempre tem prioridade sobre essa aqui.
function categoriasGlobaisRef() {
  return collection(db, 'categoriasGlobaisCompras');
}

function chaveBruta(descricao) {
  // "/" não pode aparecer num ID de documento do Firestore (vira separador
  // de caminho) — troca por um espaço antes de normalizar.
  return (descricao || '').trim().toLowerCase().replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || 'sem-descricao';
}

// Sem o final do cartão ("•••• 5163 "): a mesma loja vem com e sem ele
// (PDF x CSV), e o número muda de pessoa pra pessoa — com ele na chave, a
// categoria ensinada numa fatura não valia na outra.
export function chaveCompra(descricao) {
  return chaveBruta(semPrefixoCartao(descricao));
}

function mapaDoSnapshot(snapshot) {
  const mapa = {};
  snapshot.docs.forEach((docSnap) => {
    mapa[docSnap.id] = docSnap.data().categoria;
  });
  return mapa;
}

export async function buscarCategoriasCompras(uid) {
  return mapaDoSnapshot(await getDocs(query(categoriasComprasRef(uid))));
}

export function ouvirCategoriasCompras(uid, callback) {
  return onSnapshot(query(categoriasComprasRef(uid)), (snapshot) => callback(mapaDoSnapshot(snapshot)));
}

// As sugestões globais são só um extra — se as regras do Firestore ainda
// não liberaram essa coleção (ou qualquer outro erro), a busca falha
// silenciosamente em vez de travar a tela inteira; o app cai pra funcionar
// só com as categorias pessoais, como sempre funcionou.
export async function buscarCategoriasGlobais() {
  try {
    return mapaDoSnapshot(await getDocs(query(categoriasGlobaisRef())));
  } catch (err) {
    console.error('Não consegui ler as categorias globais (talvez as regras do Firestore ainda não liberaram isso):', err);
    return {};
  }
}

export function ouvirCategoriasGlobais(callback) {
  return onSnapshot(
    query(categoriasGlobaisRef()),
    (snapshot) => callback(mapaDoSnapshot(snapshot)),
    (err) => {
      console.error('Não consegui ouvir as categorias globais (talvez as regras do Firestore ainda não liberaram isso):', err);
      callback({});
    }
  );
}

// Combina as duas fontes num mapa só, pra passar direto pra categoriaResolvida
// — a categoria pessoal (se existir) sempre ganha da sugestão global.
export function combinarOverrides(overridesGlobais, overridesPessoais) {
  return { ...(overridesGlobais || {}), ...(overridesPessoais || {}) };
}

// Só grava a sugestão global se ainda não existir nenhuma pra essa compra —
// assim, quando alguém só está ajustando a categoria pra si mesmo (e não
// "ensinando" pela primeira vez), isso não rouba a sugestão que os outros
// usuários já veem. Quem ensina primeiro define a sugestão; os demais podem
// se desviar dela livremente sem afetar ninguém.
async function ensinarGlobalSeAindaNaoExistir(chave, dados) {
  try {
    const refDoc = doc(categoriasGlobaisRef(), chave);
    const existente = await getDoc(refDoc);
    if (!existente.exists()) {
      await setDoc(refDoc, dados);
    }
  } catch (err) {
    console.error('Salvei sua categoria, mas não consegui compartilhar globalmente:', err);
  }
}

export async function definirCategoriaCompra(uid, descricao, categoria) {
  const chave = chaveCompra(descricao);
  const dados = { descricao, categoria, atualizadoEm: new Date().toISOString() };

  // As duas gravações rodam juntas (não uma depois da outra) pra não
  // dobrar o tempo de cada importação. A pessoal é a que importa de
  // verdade — se a global falhar (ex: regras do Firestore ainda não
  // liberaram essa coleção), só avisa no console, não trava nada.
  const [resultadoPessoal] = await Promise.allSettled([
    setDoc(doc(categoriasComprasRef(uid), chave), dados),
    ensinarGlobalSeAindaNaoExistir(chave, dados),
  ]);

  if (resultadoPessoal.status === 'rejected') throw resultadoPessoal.reason;
}

export function categoriaResolvida(overrides, descricao, categoriaOriginal) {
  // A chave bruta cobre categorias gravadas antes da limpeza do prefixo.
  return overrides?.[chaveCompra(descricao)] ?? overrides?.[chaveBruta(descricao)] ?? categoriaOriginal;
}
