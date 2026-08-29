import { categoriaResolvida } from './categoriasComprasService.js';
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

export function mesesDoAno(ano) {
  const meses = [];
  for (let m = 1; m <= 12; m++) meses.push(`${ano}-${String(m).padStart(2, '0')}`);
  return meses;
}

export function anosComDados(contas, faturas) {
  const anos = new Set([new Date().getFullYear()]);
  for (const fatura of faturas) {
    if (fatura.competencia) anos.add(Number(fatura.competencia.slice(0, 4)));
  }
  for (const conta of contas) {
    for (const mes of Object.keys(conta.pagamentos || {})) anos.add(Number(mes.slice(0, 4)));
  }
  return Array.from(anos).sort((a, b) => b - a);
}

export function calcularGastosPorMeses(contas, faturas, meses, overridesCompras = {}) {
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
        somar(categoriaResolvida(overridesCompras, transacao.descricao, transacao.categoria), transacao.valor);
      }
      for (const encargo of fatura.encargos || []) {
        somar('Encargos e juros', encargo.valor);
      }
    }

    porMes[mes] = { total, categorias };
  }

  return { meses, porMes };
}

export function calcularGastosPorMes(contas, faturas, qtdMeses = 6, overridesCompras = {}) {
  return calcularGastosPorMeses(contas, faturas, mesesRecentes(qtdMeses), overridesCompras);
}

export function itensDasCategorias(contas, faturas, categorias, meses, overridesCompras = {}) {
  const itens = [];

  for (const mes of meses) {
    for (const conta of contas.filter((c) => c.ativa !== false && categorias.includes(c.categoria))) {
      const status = statusConta(conta, mes);
      const valor = status === 'pago' ? conta.pagamentos?.[mes]?.valorPago ?? conta.valor ?? 0 : conta.valor ?? 0;
      if (!valor) continue;
      itens.push({
        tipo: 'conta',
        id: conta.id,
        origem: 'Conta fixa',
        nome: conta.nome,
        categoria: conta.categoria,
        valor,
        mes,
      });
    }

    for (const fatura of faturas.filter((f) => f.competencia === mes)) {
      (fatura.transacoes || []).forEach((transacao) => {
        const categoria = categoriaResolvida(overridesCompras, transacao.descricao, transacao.categoria);
        if (!transacao.valor || !categorias.includes(categoria)) return;
        itens.push({
          tipo: 'transacao',
          descricaoOriginal: transacao.descricao,
          origem: 'Cartão',
          nome: transacao.descricao,
          categoria,
          valor: transacao.valor,
          mes,
        });
      });

      if (categorias.includes('Encargos e juros')) {
        (fatura.encargos || []).forEach((encargo) => {
          if (!encargo.valor) return;
          itens.push({
            tipo: 'encargo',
            origem: 'Cartão',
            nome: encargo.descricao,
            categoria: 'Encargos e juros',
            valor: encargo.valor,
            mes,
          });
        });
      }
    }
  }

  return itens.sort((a, b) => b.valor - a.valor);
}

export function calcularMediaGastoCartao(faturas) {
  const totaisPorFatura = faturas
    .filter((f) => f.competencia && Array.isArray(f.transacoes))
    .map((f) => f.transacoes.filter((t) => !t.parcelaTotal).reduce((s, t) => s + t.valor, 0));

  if (totaisPorFatura.length === 0) return { media: 0, quantidadeFaturas: 0 };

  const media = totaisPorFatura.reduce((s, v) => s + v, 0) / totaisPorFatura.length;
  return { media, quantidadeFaturas: totaisPorFatura.length };
}

export function somarCategorias(...mapas) {
  const total = {};
  for (const mapa of mapas) {
    for (const [categoria, valor] of Object.entries(mapa)) {
      total[categoria] = (total[categoria] || 0) + valor;
    }
  }
  return total;
}
