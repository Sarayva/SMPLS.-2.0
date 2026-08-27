import { PADRAO_CONTAS } from '../services/categoriasService.js';
import { excluirConta, salvarConta } from '../services/contasService.js';
import { escapeHTML } from '../services/securityService.js';

export function abrirModalConta(uid, conta = null, categorias = []) {
  const sugestoesCategoria = categorias.length ? categorias.map((c) => c.nome) : PADRAO_CONTAS;
  fecharModal();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="elevated-card modal-card">
      <div class="modal-header">
        <h2>${conta ? 'Editar conta' : 'Nova conta fixa'}</h2>
        <button id="btn-fechar-modal" class="icon-btn" type="button">&times;</button>
      </div>
      <form id="form-conta" class="modal-form">
        <label>Nome
          <input type="text" id="campo-nome" placeholder="Ex: Internet Vivo" required value="${conta ? escapeHTML(conta.nome) : ''}">
        </label>
        <label>Categoria
          <input type="text" id="campo-categoria" list="lista-categorias" placeholder="Ex: Internet" required value="${conta ? escapeHTML(conta.categoria) : ''}">
          <datalist id="lista-categorias">
            ${sugestoesCategoria.map((c) => `<option value="${escapeHTML(c)}">`).join('')}
          </datalist>
        </label>
        <label class="checkbox-linha">
          <input type="checkbox" id="campo-variavel" ${conta?.valorVariavel ? 'checked' : ''}>
          O valor muda todo mês (defino o valor a cada mês, a partir do próximo)
        </label>
        <div class="campo-dupla">
          <label>Valor (R$)
            <input type="number" id="campo-valor" step="0.01" min="0" placeholder="0,00" value="${conta && conta.valor != null ? conta.valor : ''}">
          </label>
          <label>Dia de vencimento
            <input type="number" id="campo-dia" min="1" max="31" placeholder="Ex: 10" required value="${conta ? conta.diaVencimento : ''}">
          </label>
        </div>
        <label>Observações
          <textarea id="campo-obs" rows="2" placeholder="Opcional">${conta ? escapeHTML(conta.observacoes || '') : ''}</textarea>
        </label>
        <div id="erro-modal" class="form-error"></div>
        <div class="modal-acoes">
          ${conta ? '<button type="button" id="btn-excluir" class="btn-secondary btn-perigo">Excluir</button>' : '<span></span>'}
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const elErro = document.getElementById('erro-modal');
  function mostrarErro(texto) {
    elErro.textContent = texto;
    elErro.classList.add('visible');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal();
  });
  document.getElementById('btn-fechar-modal').onclick = fecharModal;

  const campoVariavel = document.getElementById('campo-variavel');
  const campoValor = document.getElementById('campo-valor');
  function atualizarCampoValor() {
    const variavel = campoVariavel.checked;
    campoValor.disabled = variavel;
    campoValor.placeholder = variavel ? 'Definido a cada mês' : '0,00';
    if (variavel) campoValor.value = '';
  }
  campoVariavel.addEventListener('change', atualizarCampoValor);
  atualizarCampoValor();

  if (conta) {
    document.getElementById('btn-excluir').onclick = async () => {
      if (!confirm('Excluir esta conta? O histórico de pagamentos também será perdido.')) return;
      await excluirConta(uid, conta.id);
      fecharModal();
    };
  }

  document.getElementById('form-conta').addEventListener('submit', async (e) => {
    e.preventDefault();
    elErro.classList.remove('visible');

    const valorVariavel = campoVariavel.checked;
    const dados = {
      nome: document.getElementById('campo-nome').value.trim(),
      categoria: document.getElementById('campo-categoria').value.trim(),
      valorVariavel,
      valor: valorVariavel ? null : Number(campoValor.value),
      diaVencimento: Number(document.getElementById('campo-dia').value),
      observacoes: document.getElementById('campo-obs').value.trim(),
    };

    if (!dados.nome || !dados.categoria) {
      mostrarErro('Preencha nome e categoria.');
      return;
    }
    if (!valorVariavel && (!Number.isFinite(dados.valor) || dados.valor < 0)) {
      mostrarErro('Valor inválido.');
      return;
    }
    if (!Number.isInteger(dados.diaVencimento) || dados.diaVencimento < 1 || dados.diaVencimento > 31) {
      mostrarErro('Dia de vencimento deve ser entre 1 e 31.');
      return;
    }

    const botao = e.target.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = 'Salvando...';

    try {
      await salvarConta(uid, dados, conta?.id);
      fecharModal();
    } catch (err) {
      console.error(err);
      mostrarErro('Não foi possível salvar. Tente novamente.');
      botao.disabled = false;
      botao.textContent = 'Salvar';
    }
  });
}

function fecharModal() {
  document.getElementById('modal-overlay')?.remove();
}
