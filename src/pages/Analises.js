import { onAuthChange } from '../firebase/auth.js';
import { calcularGastosPorMes } from '../services/analisesService.js';
import { ouvirContas } from '../services/contasService.js';
import { ouvirFaturas } from '../services/faturasService.js';
import { escapeHTML } from '../services/securityService.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

let contas = [];
let faturas = [];

const app = document.getElementById('app');

app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Análises</h1>
        <p>Comparativo de gastos entre os meses.</p>
      </div>
      <div class="topbar-actions">
        <a href="/index.html" class="icon-btn" title="Contas fixas">🏠</a>
        <a href="/resumo.html" class="icon-btn" title="Resumo do mês">🧮</a>
        <a href="/fatura.html" class="icon-btn" title="Importar fatura">💳</a>
        <a href="/parcelamentos.html" class="icon-btn" title="Parcelamentos">📊</a>
        <a href="/renda.html" class="icon-btn" title="Renda">💰</a>
        <button id="btn-theme" class="icon-btn" title="Mudar tema" type="button">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <div id="conteudo">
      <p class="vazio">Carregando...</p>
    </div>
  </div>
`;

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.textContent = novoTema === 'dark' ? '☀️' : '🌙';
};

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMesCurto(mes) {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [, m] = mes.split('-');
  return nomes[Number(m) - 1];
}

function renderGrafico(meses, porMes) {
  const maiorTotal = Math.max(...meses.map((m) => porMes[m].total), 1);
  const mesAtual = meses[meses.length - 1];

  return `
    <div class="elevated-card">
      <h2 style="margin-top:0;">Total gasto por mês</h2>
      <div class="grafico-barras">
        ${meses
          .map((mes) => {
            const total = porMes[mes].total;
            const altura = Math.max((total / maiorTotal) * 100, total > 0 ? 4 : 1);
            return `
              <div class="grafico-coluna">
                <span class="grafico-valor">${total > 0 ? formatarMoeda(total).replace(',00', '') : ''}</span>
                <div class="grafico-barra ${mes === mesAtual ? 'mes-atual' : ''}" style="height:${altura}%;"></div>
                <span class="grafico-mes">${formatarMesCurto(mes)}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderComparativo(meses, porMes) {
  const comDados = meses.filter((m) => porMes[m].total > 0);

  if (comDados.length < 2) {
    return `
      <div class="elevated-card" style="margin-top:20px;">
        <p class="vazio" style="padding:20px 0;">Ainda não há dados de meses anteriores suficientes para comparar. Volte aqui depois de fechar mais um mês.</p>
      </div>
    `;
  }

  const mesAtual = comDados[comDados.length - 1];
  const mesAnterior = comDados[comDados.length - 2];
  const categoriasAtual = porMes[mesAtual].categorias;
  const categoriasAnterior = porMes[mesAnterior].categorias;

  const todasCategorias = [...new Set([...Object.keys(categoriasAtual), ...Object.keys(categoriasAnterior)])].sort();

  const linhas = todasCategorias
    .map((categoria) => {
      const atual = categoriasAtual[categoria] || 0;
      const anterior = categoriasAnterior[categoria] || 0;
      let variacaoTexto = '—';
      let classeVariacao = 'igual';
      if (anterior > 0) {
        const percentual = ((atual - anterior) / anterior) * 100;
        classeVariacao = percentual > 0.5 ? 'subiu' : percentual < -0.5 ? 'desceu' : 'igual';
        const seta = percentual > 0.5 ? '▲' : percentual < -0.5 ? '▼' : '—';
        variacaoTexto = `${seta} ${Math.abs(percentual).toFixed(0)}%`;
      } else if (atual > 0) {
        variacaoTexto = 'Novo';
        classeVariacao = 'subiu';
      }

      return `
        <div class="elevated-card comparativo-linha">
          <span class="comparativo-categoria">${escapeHTML(categoria)}</span>
          <div class="comparativo-valores">
            <span class="comparativo-valor-anterior">${formatarMoeda(anterior)}</span>
            <span class="comparativo-valor-atual">${formatarMoeda(atual)}</span>
            <span class="variacao ${classeVariacao}">${variacaoTexto}</span>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <h2 style="margin:24px 0 12px;">${formatarMesCurto(mesAtual)} comparado a ${formatarMesCurto(mesAnterior)}</h2>
    ${linhas}
  `;
}

function renderizar() {
  const { meses, porMes } = calcularGastosPorMes(contas, faturas, 6);
  document.getElementById('conteudo').innerHTML = renderGrafico(meses, porMes) + renderComparativo(meses, porMes);
}

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  document.body.dataset.authReady = 'true';

  ouvirContas(user.uid, (novasContas) => {
    contas = novasContas;
    renderizar();
  });
  ouvirFaturas(user.uid, (novasFaturas) => {
    faturas = novasFaturas;
    renderizar();
  });
});
