import { categoriaResolvida } from './categoriasComprasService.js';
import { statusConta, valorEsperado } from './contasService.js';
import { pareceSerAMesmaPessoa } from './titularesService.js';

const TIPOS_TRANSFERENCIA = ['pix_enviado', 'pix_recebido', 'transferencia_enviada', 'transferencia_recebida', 'reembolso'];

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

// Se é Pix/transferência pra alguém que já conhecemos como membro da
// família, não é gasto de verdade — é dinheiro só trocando de conta dentro
// de casa. Recalculado toda vez (não fica preso à decisão tomada lá na
// importação), porque um nome pode virar "conhecido" depois — aí passa a
// valer também pros lançamentos antigos, sem precisar reimportar nada.
function ehTransferenciaFamilia(lancamento, nomesFamilia) {
  if (!TIPOS_TRANSFERENCIA.includes(lancamento.tipo)) return false;
  return nomesFamilia.some((nome) => pareceSerAMesmaPessoa(nome, lancamento.contraparte));
}

// Um lançamento de extrato só conta como despesa "avulsa" se: saiu dinheiro
// de verdade (não é RDB nem transferência com a própria família) e ainda não
// foi vinculado a uma conta fixa (senão a conta fixa paga já conta essa
// mesma saída de dinheiro, e contaria em dobro).
function lancamentosComoDespesa(extratos, mes, nomesFamilia) {
  return extratos
    .flatMap((e) => e.lancamentos || [])
    .filter(
      (l) =>
        l.direcao === 'saida' &&
        !l.interno &&
        !ehTransferenciaFamilia(l, nomesFamilia) &&
        !l.contaFixaId &&
        l.tipo !== 'pagamento_fatura' &&
        l.data?.slice(0, 7) === mes
    );
}

export function calcularGastosPorMeses(contas, faturas, extratos, nomesFamilia, meses, overridesCompras = {}) {
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
      const valor = status === 'pago' ? conta.pagamentos?.[mes]?.valorPago ?? valorEsperado(conta, mes) ?? 0 : valorEsperado(conta, mes) ?? 0;
      somar(conta.categoria, valor);
    }

    // "Despesas do mês" é o que você deve pagar naquele mês: contas fixas +
    // a fatura do cartão que VENCE nesse mês — não a fatura cuja competência
    // (mês das compras) é esse mês. Uma fatura que vence em setembro tem
    // competência agosto (a maioria das compras nela foi feita em agosto),
    // então filtrar por competência deixava "despesas de setembro" sempre
    // zerada até a fatura de outubro (competência setembro) ser importada.
    for (const fatura of faturas.filter((f) => f.vencimento && f.vencimento.slice(0, 7) === mes)) {
      for (const transacao of fatura.transacoes || []) {
        somar(categoriaResolvida(overridesCompras, transacao.descricao, transacao.categoria), transacao.valor);
      }
      for (const encargo of fatura.encargos || []) {
        somar('Encargos e juros', encargo.valor);
      }
    }

    for (const lancamento of lancamentosComoDespesa(extratos, mes, nomesFamilia)) {
      somar(categoriaResolvida(overridesCompras, lancamento.contraparte, lancamento.categoria), lancamento.valor);
    }

    porMes[mes] = { total, categorias };
  }

  return { meses, porMes };
}

export function calcularGastosPorMes(contas, faturas, extratos, nomesFamilia, qtdMeses = 6, overridesCompras = {}) {
  return calcularGastosPorMeses(contas, faturas, extratos, nomesFamilia, mesesRecentes(qtdMeses), overridesCompras);
}

export function itensDasCategorias(contas, faturas, extratos, nomesFamilia, categorias, meses, overridesCompras = {}) {
  const itens = [];

  for (const mes of meses) {
    for (const conta of contas.filter((c) => c.ativa !== false && categorias.includes(c.categoria))) {
      const status = statusConta(conta, mes);
      const valor = status === 'pago' ? conta.pagamentos?.[mes]?.valorPago ?? valorEsperado(conta, mes) ?? 0 : valorEsperado(conta, mes) ?? 0;
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

    for (const fatura of faturas.filter((f) => f.vencimento && f.vencimento.slice(0, 7) === mes)) {
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

    lancamentosComoDespesa(extratos, mes, nomesFamilia).forEach((lancamento) => {
      const categoria = categoriaResolvida(overridesCompras, lancamento.contraparte, lancamento.categoria);
      if (!categorias.includes(categoria)) return;
      itens.push({
        tipo: 'lancamento',
        descricaoOriginal: lancamento.contraparte,
        origem: lancamento.tipo === 'compra_debito' ? 'Débito' : 'Pix',
        nome: lancamento.contraparte,
        categoria,
        valor: lancamento.valor,
        mes,
      });
    });
  }

  return itens.sort((a, b) => b.valor - a.valor);
}

// Só a parte à vista/avulsa de cada fatura passada (as parcelas ficam de
// fora daqui de propósito). Em meses futuros, o que já se sabe com certeza
// que vai continuar (parcelamentos ativos) é somado à parte, valor exato —
// só a compra nova/avulsa (que ninguém consegue prever) precisa de uma
// estimativa. Misturar as duas coisas numa única mediana do total fazia a
// projeção ficar cega às parcelas reais que terminam mês a mês.
export function calcularMedianaGastoAvista(faturas) {
  const totaisAvista = faturas
    .filter((f) => f.competencia && Array.isArray(f.transacoes))
    .map((f) => f.transacoes.filter((t) => !t.parcelaTotal).reduce((s, t) => s + t.valor, 0));

  if (totaisAvista.length === 0) return { mediana: 0, quantidadeFaturas: 0 };

  // Mediana, não média aritmética — um mês com uma compra grande e pontual
  // (um eletrônico, um móvel) não deve puxar a estimativa de todo mês pra
  // cima só porque aconteceu uma vez.
  const ordenados = [...totaisAvista].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];

  return { mediana, quantidadeFaturas: totaisAvista.length };
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
