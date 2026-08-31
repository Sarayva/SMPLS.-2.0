function somarMeses(competencia, quantidade) {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(ano, mes - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

// A competência de uma fatura é o mês em que as compras foram feitas, não o
// mês de vencimento — uma fatura que vence em setembro normalmente cobre
// compras de agosto (compra em agosto, paga em setembro). Descobre isso
// contando qual mês aparece mais entre as datas reais dos lançamentos, em
// vez de supor "vencimento menos 1 mês" (o fechamento do banco pode variar
// e essa suposição quebraria silenciosamente).
export function competenciaPorDatas(transacoes, encargos, vencimento) {
  const contagem = {};
  for (const item of [...(transacoes || []), ...(encargos || [])]) {
    if (!item.data) continue;
    const mes = item.data.slice(0, 7);
    contagem[mes] = (contagem[mes] || 0) + 1;
  }

  const meses = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  if (meses.length > 0) return meses[0][0];

  return vencimento ? somarMeses(vencimento.slice(0, 7), -1) : null;
}
