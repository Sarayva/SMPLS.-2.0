import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { atualizarPerfil, onAuthChange } from '../firebase/auth.js';
import { avatarHTML } from '../services/avatarService.js';
import {
  buscarCategorias,
  buscarGruposIgnorados,
  encontrarCategoriasSimilares,
  ignorarGrupoCategorias,
  unificarCategorias,
} from '../services/categoriasService.js';
import { buscarNomesFamilia, salvarNomesFamilia } from '../services/familiaService.js';
import { escapeHTML } from '../services/securityService.js';
import { initTheme } from '../services/themeService.js';

initTheme();

const app = document.getElementById('app');

app.innerHTML = `
  <div class="painel-shell">
    ${sidebarHTML('perfil')}

    <main class="painel-conteudo">
      <div class="painel-topo">
        <h1>Perfil</h1>
        <p>Como você quer ser chamado por aqui.</p>
      </div>

      <div class="painel-grid painel-grid-1">
        <div class="elevated-card painel-card perfil-card">
          <div class="perfil-avatar-linha">
            <div id="perfil-avatar-preview">${avatarHTML('', 72)}</div>
            <div class="perfil-campo">
              <label for="campo-apelido">Apelido</label>
              <input type="text" id="campo-apelido" placeholder="Ex: Gabriel" maxlength="40">
            </div>
          </div>
          <div id="perfil-mensagem" class="perfil-mensagem"></div>
          <div class="perfil-acoes">
            <button id="btn-salvar-perfil" class="btn-primary" type="button" disabled>Salvar</button>
          </div>
        </div>

        <div class="elevated-card painel-card perfil-card">
          <span class="painel-card-titulo">Membros da família</span>
          <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-4px;">
            Um nome completo por linha (o mesmo nome que aparece como titular nos extratos de vocês). Pix entre esses nomes não conta como despesa — é só dinheiro trocando de conta dentro de casa.
          </p>
          <textarea id="campo-familia" rows="3" placeholder="Ex: Gabriel Saraiva Cavalcante da Silva&#10;Mellissa Santana Martins Silva" style="width:100%; font: inherit; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-card-sec); color:var(--text-main); resize:vertical;"></textarea>
          <div id="familia-mensagem" class="perfil-mensagem"></div>
          <div class="perfil-acoes">
            <button id="btn-salvar-familia" class="btn-primary" type="button" disabled>Salvar</button>
          </div>
        </div>

        <div class="elevated-card painel-card perfil-card">
          <span class="painel-card-titulo">Categorias parecidas</span>
          <p style="color:var(--text-sec); font-size:0.85rem; margin-top:-4px;">
            Categorias com grafia bem próxima (ex: singular/plural) — escolha qual nome fica antes de unificar. Nada muda até você confirmar.
          </p>
          <div id="categorias-similares-lista">Procurando...</div>
        </div>
      </div>
    </main>
  </div>
`;

ligarSidebar();

let uidAtual = null;

const campoApelido = document.getElementById('campo-apelido');
const avatarPreview = document.getElementById('perfil-avatar-preview');
const mensagemEl = document.getElementById('perfil-mensagem');
const botaoSalvar = document.getElementById('btn-salvar-perfil');

campoApelido.addEventListener('input', () => {
  avatarPreview.innerHTML = avatarHTML(campoApelido.value, 72);
});

botaoSalvar.onclick = async () => {
  const novoApelido = campoApelido.value.trim();
  if (!novoApelido) {
    mensagemEl.textContent = 'Digite um apelido.';
    mensagemEl.className = 'perfil-mensagem erro';
    return;
  }

  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Salvando...';

  try {
    await atualizarPerfil({ displayName: novoApelido });
    atualizarPerfilSidebar(novoApelido);
    mensagemEl.textContent = 'Salvo!';
    mensagemEl.className = 'perfil-mensagem sucesso';
  } catch (err) {
    console.error(err);
    mensagemEl.textContent = 'Não foi possível salvar. Tente novamente.';
    mensagemEl.className = 'perfil-mensagem erro';
  } finally {
    botaoSalvar.disabled = false;
    botaoSalvar.textContent = 'Salvar';
  }
};

const campoFamilia = document.getElementById('campo-familia');
const familiaMensagemEl = document.getElementById('familia-mensagem');
const botaoSalvarFamilia = document.getElementById('btn-salvar-familia');

botaoSalvarFamilia.onclick = async () => {
  const nomes = campoFamilia.value
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  botaoSalvarFamilia.disabled = true;
  botaoSalvarFamilia.textContent = 'Salvando...';

  try {
    await salvarNomesFamilia(uidAtual, nomes);
    familiaMensagemEl.textContent = 'Salvo! Vale pra lançamentos antigos e novos.';
    familiaMensagemEl.className = 'perfil-mensagem sucesso';
  } catch (err) {
    console.error(err);
    familiaMensagemEl.textContent = 'Não foi possível salvar. Tente novamente.';
    familiaMensagemEl.className = 'perfil-mensagem erro';
  } finally {
    botaoSalvarFamilia.disabled = false;
    botaoSalvarFamilia.textContent = 'Salvar';
  }
};

const listaCategoriasSimilaresEl = document.getElementById('categorias-similares-lista');

async function carregarCategoriasSimilares() {
  const [categoriasContas, categoriasCartao, gruposIgnorados] = await Promise.all([
    buscarCategorias(uidAtual, 'contas'),
    buscarCategorias(uidAtual, 'cartao'),
    buscarGruposIgnorados(uidAtual),
  ]);

  const grupos = [
    ...encontrarCategoriasSimilares(categoriasContas, gruposIgnorados).map((grupo) => ({ tipo: 'contas', grupo })),
    ...encontrarCategoriasSimilares(categoriasCartao, gruposIgnorados).map((grupo) => ({ tipo: 'cartao', grupo })),
  ];

  if (grupos.length === 0) {
    listaCategoriasSimilaresEl.innerHTML = '<p class="vazio">Nenhuma categoria parecida encontrada.</p>';
    return;
  }

  listaCategoriasSimilaresEl.innerHTML = grupos
    .map(
      ({ tipo, grupo }, indiceGrupo) => `
      <div class="categoria-similar-grupo" data-grupo="${indiceGrupo}">
        <div class="categoria-similar-opcoes">
          ${grupo
            .map(
              (cat, i) => `
              <label class="categoria-similar-opcao">
                <input type="radio" name="grupo-${indiceGrupo}" value="${i}" ${i === 0 ? 'checked' : ''}>
                ${escapeHTML(cat.nome)}
              </label>
            `
            )
            .join('')}
        </div>
        <div class="categoria-similar-acoes">
          <button class="btn-secondary btn-ignorar-categoria" data-grupo="${indiceGrupo}" type="button">Ignorar</button>
          <button class="btn-secondary btn-unificar-categoria" data-tipo="${tipo}" data-grupo="${indiceGrupo}" type="button">Unificar</button>
        </div>
      </div>
    `
    )
    .join('');

  const gruposPorIndice = grupos.map((g) => g.grupo);

  listaCategoriasSimilaresEl.querySelectorAll('.btn-unificar-categoria').forEach((botao) => {
    botao.onclick = async () => {
      const indiceGrupo = Number(botao.dataset.grupo);
      const tipo = botao.dataset.tipo;
      const grupo = gruposPorIndice[indiceGrupo];
      const radioMarcado = listaCategoriasSimilaresEl.querySelector(`input[name="grupo-${indiceGrupo}"]:checked`);
      const nomeEscolhido = grupo[Number(radioMarcado.value)].nome;

      botao.disabled = true;
      botao.textContent = 'Unificando...';
      try {
        await unificarCategorias(uidAtual, tipo, grupo, nomeEscolhido);
        await carregarCategoriasSimilares();
      } catch (err) {
        console.error(err);
        botao.disabled = false;
        botao.textContent = 'Unificar';
        alert('Não foi possível unificar. Tente de novo.');
      }
    };
  });

  listaCategoriasSimilaresEl.querySelectorAll('.btn-ignorar-categoria').forEach((botao) => {
    botao.onclick = async () => {
      const indiceGrupo = Number(botao.dataset.grupo);
      const grupo = gruposPorIndice[indiceGrupo];

      botao.disabled = true;
      botao.textContent = 'Ignorando...';
      try {
        await ignorarGrupoCategorias(uidAtual, grupo.map((c) => c.nome));
        await carregarCategoriasSimilares();
      } catch (err) {
        console.error(err);
        botao.disabled = false;
        botao.textContent = 'Ignorar';
        alert('Não foi possível ignorar. Tente de novo.');
      }
    };
  });
}

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  uidAtual = user.uid;
  atualizarPerfilSidebar(user.displayName);

  const apelido = user.displayName || '';
  campoApelido.value = apelido;
  avatarPreview.innerHTML = avatarHTML(apelido, 72);

  const nomesFamilia = await buscarNomesFamilia(user.uid);
  campoFamilia.value = nomesFamilia.join('\n');

  carregarCategoriasSimilares();

  // Só marca a página como pronta (e libera os campos) depois de tudo
  // carregado — evita que alguém digite e salve antes da busca assíncrona
  // da lista de família terminar, o que sobrescreveria o que foi digitado.
  document.body.dataset.authReady = 'true';
  botaoSalvar.disabled = false;
  botaoSalvarFamilia.disabled = false;
});
