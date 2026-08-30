function dividirLinha(linha) {
  const partes = [];
  let restante = linha;
  for (let i = 0; i < 3; i++) {
    const idx = restante.indexOf(',');
    if (idx === -1) {
      partes.push(restante);
      restante = '';
      break;
    }
    partes.push(restante.slice(0, idx));
    restante = restante.slice(idx + 1);
  }
  partes.push(restante);
  return partes;
}

function paraDataISO(dataBR) {
  const [dia, mes, ano] = dataBR.split('/');
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

// Tipos que são só o dinheiro mudando de "bolso" dentro da própria conta —
// não são gasto nem renda de verdade, então ficam de fora de qualquer soma
// de despesas e de qualquer sugestão de vínculo com conta fixa.
const TIPOS_INTERNOS = ['aplicacao_rdb', 'resgate_rdb'];

function classificarTipo(descricao) {
  const d = descricao.toLowerCase();
  if (d.startsWith('compra no débito') || d.startsWith('compra no debito')) return 'compra_debito';
  if (d.startsWith('pagamento de fatura')) return 'pagamento_fatura';
  if (d.startsWith('pagamento de boleto')) return 'pagamento_boleto';
  if (d.startsWith('transferência enviada pelo pix') || d.startsWith('transferencia enviada pelo pix')) return 'pix_enviado';
  if (d.startsWith('transferência recebida pelo pix') || d.startsWith('transferencia recebida pelo pix')) return 'pix_recebido';
  if (d.startsWith('reembolso recebido pelo pix')) return 'reembolso';
  if (d.startsWith('transferência recebida') || d.startsWith('transferencia recebida')) return 'transferencia_recebida';
  if (d.startsWith('transferência enviada') || d.startsWith('transferencia enviada')) return 'transferencia_enviada';
  if (d.startsWith('aplicação rdb') || d.startsWith('aplicacao rdb')) return 'aplicacao_rdb';
  if (d.startsWith('resgate rdb')) return 'resgate_rdb';
  return 'outro';
}

// A descrição do CSV traz "Compra no débito - LOJA X" ou, pra
// transferências, "Transferência ... - NOME - CPF/CNPJ - BANCO ...". O que
// interessa pra reconhecer quem recebeu é só o pedaço antes do próximo " - ".
function extrairNomeContraparte(descricao, tipo) {
  const semPrefixo = descricao.replace(/^[^-]+-\s*/, '').trim();
  if (tipo === 'compra_debito' || tipo === 'pagamento_boleto') return semPrefixo;
  const partes = semPrefixo.split(' - ');
  return (partes[0] || semPrefixo).trim();
}

export function pareceSerExtratoCsv(textoCSV) {
  const linhas = textoCSV.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return false;
  const camposCabecalho = linhas[0].split(',');
  if (camposCabecalho.length !== 4) return false;
  const primeiraLinhaDados = dividirLinha(linhas[1]);
  return /^\d{2}\/\d{2}\/\d{4}$/.test(primeiraLinhaDados[0].trim());
}

export function numeroContaDoNomeArquivo(nomeArquivo) {
  const match = nomeArquivo.match(/^NU_(\d+)_/);
  return match ? match[1] : null;
}

export function parseExtratoCsv(textoCSV, nomeArquivo) {
  const linhas = textoCSV.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  const numeroConta = numeroContaDoNomeArquivo(nomeArquivo);

  const lancamentos = [];
  for (let i = 1; i < linhas.length; i++) {
    const [dataTexto, valorTexto, identificador, descricaoTexto] = dividirLinha(linhas[i]);
    if (!dataTexto || valorTexto == null) continue;

    const valor = parseFloat(valorTexto);
    if (!Number.isFinite(valor)) continue;

    const descricao = (descricaoTexto || '').trim();
    const tipo = classificarTipo(descricao);

    lancamentos.push({
      id: (identificador || '').trim() || null,
      data: paraDataISO(dataTexto.trim()),
      descricao,
      contraparte: extrairNomeContraparte(descricao, tipo),
      valor: Math.abs(valor),
      direcao: valor >= 0 ? 'entrada' : 'saida',
      tipo,
      interno: TIPOS_INTERNOS.includes(tipo),
    });
  }

  const datas = lancamentos.map((l) => l.data).filter(Boolean).sort();

  return {
    banco: 'nubank',
    numeroConta,
    periodoInicio: datas[0] || null,
    periodoFim: datas[datas.length - 1] || null,
    lancamentos,
  };
}
