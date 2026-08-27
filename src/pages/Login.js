import { onAuthChange, signIn, signUp } from '../firebase/auth.js';
import { icones } from '../services/icones.js';
import { getTheme, initTheme, toggleTheme } from '../services/themeService.js';

initTheme();

onAuthChange((user) => {
  if (user) window.location.href = '/index.html';
});

const MENSAGENS_ERRO = {
  'auth/email-already-in-use': 'Esse e-mail já está cadastrado.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
};

function mensagemDeErro(err) {
  return MENSAGENS_ERRO[err.code] || 'Não foi possível concluir. Tente novamente.';
}

const app = document.getElementById('app');

app.innerHTML = `
  <div class="login-page">
    <button id="btn-theme" class="theme-toggle" title="Mudar tema" type="button">${getTheme() === 'dark' ? icones.sol : icones.lua}</button>

    <div class="login-card elevated-card">
      <div class="login-brand">
        <h1>SMPLS.</h1>
        <p>Gestão financeira transparente, sem complexidade.</p>
      </div>

      <div class="login-tabs">
        <button id="tab-login" class="active" type="button">Entrar</button>
        <button id="tab-cadastro" type="button">Criar conta</button>
      </div>

      <div id="erro" class="login-error"></div>

      <form id="form-login" class="login-form">
        <label>E-mail
          <input type="email" id="login-email" required autocomplete="email">
        </label>
        <label>Senha
          <div class="password-field">
            <input type="password" id="login-senha" required autocomplete="current-password">
            <button type="button" class="password-toggle" data-alvo="login-senha">mostrar</button>
          </div>
        </label>
        <button type="submit" class="btn-primary login-submit">Entrar</button>
      </form>

      <form id="form-cadastro" class="login-form" style="display:none;">
        <label>Nome
          <input type="text" id="cad-nome" required autocomplete="name">
        </label>
        <label>E-mail
          <input type="email" id="cad-email" required autocomplete="email">
        </label>
        <label>Senha
          <div class="password-field">
            <input type="password" id="cad-senha" required autocomplete="new-password" minlength="6">
            <button type="button" class="password-toggle" data-alvo="cad-senha">mostrar</button>
          </div>
        </label>
        <label>Confirmar senha
          <div class="password-field">
            <input type="password" id="cad-confirma" required autocomplete="new-password" minlength="6">
            <button type="button" class="password-toggle" data-alvo="cad-confirma">mostrar</button>
          </div>
        </label>
        <button type="submit" class="btn-primary login-submit">Criar conta</button>
      </form>
    </div>
  </div>
`;

const elErro = document.getElementById('erro');
const formLogin = document.getElementById('form-login');
const formCadastro = document.getElementById('form-cadastro');
const tabLogin = document.getElementById('tab-login');
const tabCadastro = document.getElementById('tab-cadastro');

function mostrarErro(texto) {
  elErro.textContent = texto;
  elErro.classList.add('visible');
}

function limparErro() {
  elErro.textContent = '';
  elErro.classList.remove('visible');
}

function mudarAba(aba) {
  limparErro();
  const noLogin = aba === 'login';
  tabLogin.classList.toggle('active', noLogin);
  tabCadastro.classList.toggle('active', !noLogin);
  formLogin.style.display = noLogin ? 'flex' : 'none';
  formCadastro.style.display = noLogin ? 'none' : 'flex';
}

tabLogin.onclick = () => mudarAba('login');
tabCadastro.onclick = () => mudarAba('cadastro');

document.getElementById('btn-theme').onclick = (e) => {
  const novoTema = toggleTheme();
  e.currentTarget.innerHTML = novoTema === 'dark' ? icones.sol : icones.lua;
};

document.querySelectorAll('.password-toggle').forEach((botao) => {
  botao.onclick = () => {
    const input = document.getElementById(botao.dataset.alvo);
    const visivel = input.type === 'text';
    input.type = visivel ? 'password' : 'text';
    botao.textContent = visivel ? 'mostrar' : 'ocultar';
  };
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErro();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const botao = formLogin.querySelector('button[type="submit"]');

  botao.disabled = true;
  botao.textContent = 'Entrando...';
  try {
    await signIn(email, senha);
  } catch (err) {
    mostrarErro(mensagemDeErro(err));
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

formCadastro.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErro();
  const nome = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;
  const confirma = document.getElementById('cad-confirma').value;
  const botao = formCadastro.querySelector('button[type="submit"]');

  if (senha !== confirma) {
    mostrarErro('As senhas não conferem.');
    return;
  }

  botao.disabled = true;
  botao.textContent = 'Criando conta...';
  try {
    await signUp(nome, email, senha);
  } catch (err) {
    mostrarErro(mensagemDeErro(err));
    botao.disabled = false;
    botao.textContent = 'Criar conta';
  }
});
