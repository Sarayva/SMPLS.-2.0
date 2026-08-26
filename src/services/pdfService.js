import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

export async function extrairLinhas(arquivo) {
  const arrayBuffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const linhas = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();

    let ultimoY = null;
    let linhaAtual = '';

    for (const item of conteudo.items) {
      if (ultimoY !== null && Math.abs(ultimoY - item.transform[5]) > 4) {
        linhas.push(linhaAtual.trim());
        linhaAtual = '';
      }
      linhaAtual += item.str;
      ultimoY = item.transform[5];
    }
    if (linhaAtual) linhas.push(linhaAtual.trim());
  }

  return linhas;
}
