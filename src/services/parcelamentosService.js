import { collection, db, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc } from '../firebase/firestore.js';

function parcelamentosRef(uid) {
  return collection(db, 'users', uid, 'parcelamentos');
}

function normalizar(texto) {
  return texto.trim().toLowerCase();
}

function somarMeses(competencia, quantidade) {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(ano, mes - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function ouvirParcelamentos(uid, callback) {
  return onSnapshot(query(parcelamentosRef(uid)), (snapshot) => {
    const parcelamentos = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(parcelamentos);
  });
}

// Duas compras diferentes no mesmo estabelecimento, com o mesmo número de
// parcelas (ex: dois serviços distintos na "Ramon Auto Center", cada um em
// 3x), não podem ser tratadas como a mesma coisa só por nome+total baterem
// — por isso o mês em que a compra começou também entra na chave.
function chaveParcelamento(descricao, parcelaTotal, primeiraCompetencia) {
  return `${normalizar(descricao)}|${parcelaTotal}|${primeiraCompetencia || ''}`;
}

export function encontrarDuplicatas(parcelamentos) {
  const grupos = {};
  for (const p of parcelamentos) {
    const chave = chaveParcelamento(p.descricao, p.parcelaTotal, p.primeiraCompetencia);
    (grupos[chave] ??= []).push(p);
  }
  return Object.values(grupos).filter((grupo) => grupo.length > 1);
}

export async function mesclarDuplicata(uid, grupo) {
  const parcelaAtual = Math.max(...grupo.map((p) => p.parcelaAtual));
  const vencedor = grupo.find((p) => p.parcelaAtual === parcelaAtual);
  const competencias = grupo.map((p) => p.ultimaCompetencia).filter(Boolean).sort();
  const ultimaCompetencia = competencias[competencias.length - 1];
  const primeiraCompetencia = grupo.map((p) => p.primeiraCompetencia).filter(Boolean).sort()[0];

  await updateDoc(doc(parcelamentosRef(uid), vencedor.id), {
    parcelaAtual,
    primeiraCompetencia,
    ultimaCompetencia,
    mesQuitacaoEstimado: somarMeses(ultimaCompetencia, vencedor.parcelaTotal - parcelaAtual),
    quitado: parcelaAtual >= vencedor.parcelaTotal,
  });

  for (const p of grupo) {
    if (p.id !== vencedor.id) await deleteDoc(doc(parcelamentosRef(uid), p.id));
  }
}

export async function marcarQuitadoManual(uid, parcelamentoId) {
  await updateDoc(doc(parcelamentosRef(uid), parcelamentoId), { quitado: true });
}

export async function excluirParcelamento(uid, parcelamentoId) {
  await deleteDoc(doc(parcelamentosRef(uid), parcelamentoId));
}

export async function mesclarParcelas(uid, fatura) {
  const transacoesParceladas = fatura.transacoes.filter((t) => t.parcelaTotal);
  if (transacoesParceladas.length === 0) return;

  const snapshot = await getDocs(parcelamentosRef(uid));
  const existentes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  for (const transacao of transacoesParceladas) {
    // Casamento por descrição + total de parcelas + mês em que a compra
    // começou (não por valor, que pode variar centavos por arredondamento
    // do banco). O mês de início entra na chave pra não confundir duas
    // compras diferentes no mesmo estabelecimento com o mesmo total de
    // parcelas (ex: duas compras de 3x na "Ramon Auto Center").
    const primeiraCompetenciaImplicada = somarMeses(fatura.competencia, -(transacao.parcelaAtual - 1));
    const chaveDescricao = normalizar(transacao.descricao);
    const existente = existentes.find(
      (p) =>
        normalizar(p.descricao) === chaveDescricao &&
        p.parcelaTotal === transacao.parcelaTotal &&
        (p.primeiraCompetencia || somarMeses(p.ultimaCompetencia, -(p.parcelaAtual - 1))) === primeiraCompetenciaImplicada
    );

    const parcelaAtual = existente ? Math.max(existente.parcelaAtual, transacao.parcelaAtual) : transacao.parcelaAtual;
    const mesQuitacaoEstimado = somarMeses(fatura.competencia, transacao.parcelaTotal - parcelaAtual);

    const dados = {
      banco: fatura.banco,
      descricao: transacao.descricao,
      categoria: transacao.categoria,
      parcelaTotal: transacao.parcelaTotal,
      parcelaAtual,
      valorParcela: transacao.valor,
      valorTotalEstimado: Math.round(transacao.valor * transacao.parcelaTotal * 100) / 100,
      primeiraCompetencia: existente
        ? existente.primeiraCompetencia
        : somarMeses(fatura.competencia, -(parcelaAtual - 1)),
      ultimaCompetencia: fatura.competencia,
      mesQuitacaoEstimado,
      quitado: parcelaAtual >= transacao.parcelaTotal,
      atualizadoEm: new Date().toISOString(),
    };

    const ref = existente ? doc(parcelamentosRef(uid), existente.id) : doc(parcelamentosRef(uid));
    await setDoc(ref, dados, { merge: true });
  }
}
