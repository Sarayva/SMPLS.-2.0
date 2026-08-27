import { collection, db, doc, getDocs, onSnapshot, query, setDoc } from '../firebase/firestore.js';

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

export async function mesclarParcelas(uid, fatura) {
  const transacoesParceladas = fatura.transacoes.filter((t) => t.parcelaTotal);
  if (transacoesParceladas.length === 0) return;

  const snapshot = await getDocs(parcelamentosRef(uid));
  const existentes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  for (const transacao of transacoesParceladas) {
    // Casamento só por descrição + total de parcelas: o valor da parcela pode
    // variar alguns centavos entre faturas por arredondamento do banco, então
    // não pode fazer parte da chave (senão a mesma compra vira duas linhas).
    const chaveDescricao = normalizar(transacao.descricao);
    const existente = existentes.find(
      (p) => normalizar(p.descricao) === chaveDescricao && p.parcelaTotal === transacao.parcelaTotal
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
