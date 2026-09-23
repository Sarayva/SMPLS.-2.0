import { collection, db, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc } from '../firebase/firestore.js';
import { ehLegadoAntecipada, limparDescricao, semPrefixoCartao } from '../parsers/descricaoUtil.js';

function parcelamentosRef(uid) {
  return collection(db, 'users', uid, 'parcelamentos');
}

// Sem o prefixo do cartão ("•••• 5163 "), pra que parcelamentos salvos
// antes dessa limpeza continuem casando com a mesma compra vinda do CSV.
function normalizar(texto) {
  return semPrefixoCartao(texto).toLowerCase();
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
  const normais = parcelamentos.filter((p) => !ehLegadoAntecipada(p.descricao));
  const grupos = {};
  for (const p of normais) {
    const chave = chaveParcelamento(p.descricao, p.parcelaTotal, p.primeiraCompetencia);
    (grupos[chave] ??= []).push(p);
  }

  // Parcelamentos gravados antes da correção de antecipação: cada parcela
  // antecipada ("Antecipada - Cia Brothers 2/3") virou um registro próprio,
  // e a compra original ficou parada na parcela 1 como se ainda faltasse
  // pagar. Junta cada um deles com a compra original que ele adiantou.
  for (const antecipada of parcelamentos.filter((p) => ehLegadoAntecipada(p.descricao))) {
    const nome = limparDescricao(antecipada.descricao).descricao.toLowerCase();
    const original = normais
      .filter(
        (p) =>
          normalizar(p.descricao) === nome &&
          p.parcelaTotal === antecipada.parcelaTotal &&
          p.parcelaAtual < antecipada.parcelaAtual &&
          (p.ultimaCompetencia || '') <= (antecipada.ultimaCompetencia || '')
      )
      .sort((a, b) => (b.primeiraCompetencia || '').localeCompare(a.primeiraCompetencia || ''))[0];
    if (!original) continue;
    grupos[chaveParcelamento(original.descricao, original.parcelaTotal, original.primeiraCompetencia)].push(antecipada);
  }

  return Object.values(grupos).filter((grupo) => grupo.length > 1);
}

export async function mesclarDuplicata(uid, grupo) {
  const parcelaAtual = Math.max(...grupo.map((p) => p.parcelaAtual));
  // O registro que fica é sempre o da compra original — nunca o de uma
  // parcela antecipada, que tem "Antecipada -" no nome e o mês de início
  // calculado errado (a partir da parcela adiantada).
  const originais = grupo.filter((p) => !ehLegadoAntecipada(p.descricao));
  const base = originais.length > 0 ? originais : grupo;
  const vencedor = [...base].sort((a, b) => b.parcelaAtual - a.parcelaAtual)[0];
  const competencias = grupo.map((p) => p.ultimaCompetencia).filter(Boolean).sort();
  const ultimaCompetencia = competencias[competencias.length - 1];
  const primeiraCompetencia = base.map((p) => p.primeiraCompetencia).filter(Boolean).sort()[0];
  // Mesmo esquema do backfill em corrigirMesesQuitacao: quita-se no mês em
  // que a última parcela é paga (vencimento), não no mês em que a compra foi
  // feita (competência) — usa o vencimento já salvo no vencedor e, na falta
  // dele (registro legado), aproxima por competência + 1 mês.
  const ultimoVencimento = grupo.map((p) => p.ultimoVencimento).filter(Boolean).sort().pop() || somarMeses(ultimaCompetencia, 1);

  await updateDoc(doc(parcelamentosRef(uid), vencedor.id), {
    descricao: limparDescricao(vencedor.descricao).descricao,
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
  // Registros criados por esta mesma fatura — só usados pra achar a compra
  // original de uma parcela antecipada. Não entram na busca das parcelas
  // normais, porque duas linhas iguais na mesma fatura (ex: duas compras de
  // 3x na "Ramon Auto Center" no mesmo dia) são compras diferentes.
  const criados = [];

  // Normais primeiro: a compra original precisa existir antes da parcela
  // antecipada dela (no CSV a ordem é por data decrescente, então a 2/2
  // antecipada aparece antes da 1/2).
  for (const transacao of transacoesParceladas.filter((t) => !t.antecipada)) {
    // Casamento por descrição + total de parcelas + mês em que a compra
    // começou (não por valor, que pode variar centavos por arredondamento
    // do banco). O mês de início entra na chave pra não confundir duas
    // compras diferentes no mesmo estabelecimento com o mesmo total de
    // parcelas (ex: duas compras de 3x na "Ramon Auto Center").
    const primeiraCompetenciaImplicada = somarMeses(fatura.competencia, -(transacao.parcelaAtual - 1));
    const chaveDescricao = normalizar(transacao.descricao);
    const existente = existentes.find(
      (p) =>
        !ehLegadoAntecipada(p.descricao) &&
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
    if (existente) Object.assign(existente, dados);
    else criados.push({ id: ref.id, ...dados });
  }

  for (const transacao of transacoesParceladas.filter((t) => t.antecipada)) {
    // Parcela adiantada: avança a compra original que ainda está em
    // andamento (mesmo nome e total, numa parcela anterior a esta). Com mais
    // de uma candidata, fica com a mais adiantada e, empatando, a mais recente.
    const chaveDescricao = normalizar(transacao.descricao);
    const original = [...criados, ...existentes]
      .filter(
        (p) =>
          !p.quitado &&
          !ehLegadoAntecipada(p.descricao) &&
          normalizar(p.descricao) === chaveDescricao &&
          p.parcelaTotal === transacao.parcelaTotal &&
          p.parcelaAtual < transacao.parcelaAtual
      )
      .sort(
        (a, b) =>
          b.parcelaAtual - a.parcelaAtual ||
          (b.primeiraCompetencia || '').localeCompare(a.primeiraCompetencia || '')
      )[0];

    const ultimoVencimento = fatura.vencimento.slice(0, 7);

    // Reimportando a mesma fatura, a compra original já está nessa parcela
    // (ou além) — nada a fazer.
    const jaContada = [...criados, ...existentes].some(
      (p) =>
        !ehLegadoAntecipada(p.descricao) &&
        normalizar(p.descricao) === chaveDescricao &&
        p.parcelaTotal === transacao.parcelaTotal &&
        p.parcelaAtual >= transacao.parcelaAtual &&
        (p.primeiraCompetencia || '') <= fatura.competencia
    );
    if (!original && jaContada) continue;

    if (!original) {
      // Compra original não encontrada (ex: a fatura em que ela começou não
      // foi importada) — registra como parcelamento próprio pra não perder
      // a informação.
      const dados = {
        banco: fatura.banco,
        descricao: transacao.descricao,
        categoria: transacao.categoria,
        parcelaTotal: transacao.parcelaTotal,
        parcelaAtual: transacao.parcelaAtual,
        valorParcela: transacao.valor,
        valorTotalEstimado: Math.round(transacao.valor * transacao.parcelaTotal * 100) / 100,
        primeiraCompetencia: somarMeses(fatura.competencia, -(transacao.parcelaAtual - 1)),
        ultimaCompetencia: fatura.competencia,
        ultimoVencimento,
        mesQuitacaoEstimado: somarMeses(ultimoVencimento, transacao.parcelaTotal - transacao.parcelaAtual),
        quitado: transacao.parcelaAtual >= transacao.parcelaTotal,
        atualizadoEm: new Date().toISOString(),
      };
      const ref = doc(parcelamentosRef(uid));
      await setDoc(ref, dados);
      criados.push({ id: ref.id, ...dados });
      continue;
    }

    const dados = {
      parcelaAtual: transacao.parcelaAtual,
      ultimaCompetencia: fatura.competencia,
      ultimoVencimento,
      mesQuitacaoEstimado: somarMeses(ultimoVencimento, original.parcelaTotal - transacao.parcelaAtual),
      quitado: transacao.parcelaAtual >= original.parcelaTotal,
      atualizadoEm: new Date().toISOString(),
    };
    await updateDoc(doc(parcelamentosRef(uid), original.id), dados);
    Object.assign(original, dados);
  }
}
