import { atualizarPerfilSidebar, ligarSidebar, sidebarHTML } from '../components/Sidebar.js';
import { atualizarPerfil, onAuthChange } from '../firebase/auth.js';
import { avatarHTML } from '../services/avatarService.js';
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
      </div>
    </main>
  </div>
`;

ligarSidebar();

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

onAuthChange((user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  atualizarPerfilSidebar(user.displayName);
  document.body.dataset.authReady = 'true';
  botaoSalvar.disabled = false;

  const apelido = user.displayName || '';
  campoApelido.value = apelido;
  avatarPreview.innerHTML = avatarHTML(apelido, 72);
});
