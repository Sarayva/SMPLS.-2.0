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
  // Mesmo esquema do backfill em corrigirMesesQuitacao: quita-se no mês em
  // que a última parcela é paga (vencimento), não no mês em que a compra foi
  // feita (competência) — usa o vencimento já salvo no vencedor e, na falta
  // dele (registro legado), aproxima por competência + 1 mês.
  const ultimoVencimento = grupo.map((p) => p.ultimoVencimento).filter(Boolean).sort().pop() || somarMeses(ultimaCompetencia, 1);

  await updateDoc(doc(parcelamentosRef(uid), vencedor.id), {
    parcelaAtual,
    primeiraCompetencia,
    ultimaCompetencia,
    ultimoVencimento,
    mesQuitacaoEstimado: somarMeses(ultimoVencimento, vencedor.parcelaTotal - parcelaAtual),
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

// Backfill único: parcelamentos salvos antes da correção acima guardaram
// mesQuitacaoEstimado com base na competência (mês da compra) em vez do
// vencimento (mês em que a última parcela é de fato paga) — ficavam um mês
// adiantados. Corrige usando o vencimento real de cada fatura já importada
// (mais preciso que aproximar por competência + 1 mês). Idempotente: não
// escreve nada se o valor já estiver certo.
export async function corrigirMesesQuitacao(uid, faturas) {
  const vencimentoPorCompetencia = {};
  for (const f of faturas) {
    if (f.competencia && f.vencimento) vencimentoPorCompetencia[f.competencia] = f.vencimento.slice(0, 7);
  }

  const snapshot = await getDocs(parcelamentosRef(uid));
  for (const docSnap of snapshot.docs) {
    const p = docSnap.data();
    const ultimoVencimento = vencimentoPorCompetencia[p.ultimaCompetencia];
    if (!ultimoVencimento) continue;

    const mesQuitacaoEstimado = somarMeses(ultimoVencimento, p.parcelaTotal - p.parcelaAtual);
    if (p.ultimoVencimento === ultimoVencimento && p.mesQuitacaoEstimado === mesQuitacaoEstimado) continue;

    await updateDoc(doc(parcelamentosRef(uid), docSnap.id), { ultimoVencimento, mesQuitacaoEstimado });
  }
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
    // A última parcela é paga no mês em que a fatura vence, não no mês em
    // que a compra foi feita (competência) — uma compra de agosto que
    // fecha em 2x quita na fatura que vence em outubro, não em setembro.
    const ultimoVencimento = fatura.vencimento.slice(0, 7);
    const mesQuitacaoEstimado = somarMeses(ultimoVencimento, transacao.parcelaTotal - parcelaAtual);

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
      ultimoVencimento,
      mesQuitacaoEstimado,
      quitado: parcelaAtual >= transacao.parcelaTotal,
      atualizadoEm: new Date().toISOString(),
    };

    const ref = existente ? doc(parcelamentosRef(uid), existente.id) : doc(parcelamentosRef(uid));
    await setDoc(ref, dados, { merge: true });
  }
}
