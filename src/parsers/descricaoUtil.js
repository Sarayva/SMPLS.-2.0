// A mesma compra chega escrita de jeitos diferentes dependendo do arquivo:
// o PDF da fatura põe o final do cartão na frente ("•••• 5163 Brunocelulares")
// e o CSV não ("Brunocelulares"). Sem limpar isso, a parcela 5/12 do PDF e a
// 6/12 do CSV viravam dois parcelamentos diferentes. O prefixo só é removido
// com pelo menos dois marcadores seguidos dos 4 dígitos, pra não comer
// nomes que legitimamente começam com número (ex: "99 Oticas").
const REGEX_PREFIXO_CARTAO = /^[•·●∙*]{2,}\s*\d{4}\s+/;

// Quando você antecipa parcelas, o PDF lista as parcelas adiantadas como
// "Antecipada - Cia Brothers - Parcela 2/3" — é a mesma compra, não outra.
const REGEX_ANTECIPADA = /^antecipada\s*-\s*/i;

export function semPrefixoCartao(descricao) {
  return (descricao || '').replace(REGEX_PREFIXO_CARTAO, '').trim();
}

export function limparDescricao(descricao) {
  const semCartao = semPrefixoCartao(descricao);
  const antecipada = REGEX_ANTECIPADA.test(semCartao);
  return {
    descricao: antecipada ? semCartao.replace(REGEX_ANTECIPADA, '').trim() : semCartao,
    antecipada,
  };
}

export function ehLegadoAntecipada(descricao) {
  return REGEX_ANTECIPADA.test(semPrefixoCartao(descricao));
}
