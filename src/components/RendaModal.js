import { excluirRenda, salvarRenda } from '../services/rendaService.js';
import { escapeHTML } from '../services/securityService.js';

export function abrirModalRenda(uid, renda = null) {
  fecharModal();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="elevated-card modal-card">
      <div class="modal-header">
        <h2>${renda ? 'Editar renda' : 'Nova renda'}</h2>
        <button id="btn-fechar-modal" class="icon-btn" type="button">&times;</button>
      </div>
      <form id="form-renda" class="modal-form">
        <label>Nome
          <input type="text" id="campo-nome" placeholder="Ex: Salário CLT" required value="${renda ? escapeHTML(renda.nome) : ''}">
        </label>
        <label>De quem é
          <input type="text" id="campo-dono" placeholder="Ex: Mellissa" required value="${renda ? escapeHTML(renda.dono) : ''}">
        </label>
        <label>Valor mensal (R$)
          <input type="number" id="campo-valor" step="0.01" min="0" placeholder="0,00" required value="${renda ? renda.valor : ''}">
        </label>
        <div id="erro-modal" class="form-error"></div>
        <div class="modal-acoes">
          ${renda ? '<button type="button" id="btn-excluir" class="btn-secondary btn-perigo">Excluir</button>' : '<span></span>'}
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', fecharAoEsc);

  const elErro = document.getElementById('erro-modal');
  function mostrarErro(texto) {
    elErro.textContent = texto;
    elErro.classList.add('visible');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal();
  });
  document.getElementById('btn-fechar-modal').onclick = fecharModal;

  if (renda) {
    document.getElementById('btn-excluir').onclick = async () => {
      if (!confirm('Excluir essa fonte de renda?')) return;
      await excluirRenda(uid, renda.id);
      fecharModal();
    };
  }

  document.getElementById('form-renda').addEventListener('submit', async (e) => {
    e.preventDefault();
    elErro.classList.remove('visible');

    const dados = {
      nome: document.getElementById('campo-nome').value.trim(),
      dono: document.getElementById('campo-dono').value.trim(),
      valor: Number(document.getElementById('campo-valor').value),
    };

    if (!dados.nome || !dados.dono) {
      mostrarErro('Preencha nome e de quem é a renda.');
      return;
    }
    if (!Number.isFinite(dados.valor) || dados.valor < 0) {
      mostrarErro('Valor inválido.');
      return;
    }

    const botao = e.target.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = 'Salvando...';

    try {
      await salvarRenda(uid, dados, renda?.id);
      fecharModal();
    } catch (err) {
      console.error(err);
      mostrarErro('Não foi possível salvar. Tente novamente.');
      botao.disabled = false;
      botao.textContent = 'Salvar';
    }
  });
}

function fecharAoEsc(e) {
  if (e.key === 'Escape') fecharModal();
}

function fecharModal() {
  document.getElementById('modal-overlay')?.remove();
  document.removeEventListener('keydown', fecharAoEsc);
}
