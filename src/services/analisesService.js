import { statusConta } from './contasService.js';

export function mesesRecentes(qtd) {
  const hoje = new Date();
  const meses = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

export function calcularGastosPorMes(contas, faturas, qtdMeses = 6) {
  const meses = mesesRecentes(qtdMeses);
  const porMes = {};

  for (const mes of meses) {
    const categorias = {};
    let total = 0;

    function somar(categoria, valor) {
      if (!valor) return;
      categorias[categoria] = (categorias[categoria] || 0) + valor;
      total += valor;
    }

    for (const conta of contas.filter((c) => c.ativa !== false)) {
      const status = statusConta(conta, mes);
      const valor = status === 'pago' ? conta.pagamentos?.[mes]?.valorPago ?? conta.valor ?? 0 : conta.valor ?? 0;
      somar(conta.categoria, valor);
    }

    for (const fatura of faturas.filter((f) => f.competencia === mes)) {
      for (const transacao of fatura.transacoes || []) {
        somar(transacao.categoria, transacao.valor);
      }
    }

    porMes[mes] = { total, categorias };
  }

  return { meses, porMes };
}
