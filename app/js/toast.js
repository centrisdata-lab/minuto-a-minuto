/**
 * toast.js
 * Notificaciones tipo "toast" y modal de confirmación reutilizable.
 */

const Toast = {
  icons: {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
  },

  show(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${this.icons[type] || this.icons.info}"></i>
      <span>${Utils.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 220);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); },
};

/**
 * Modal de confirmación genérico (reemplaza confirm() nativo por uno
 * acorde a la identidad visual). Devuelve una Promise<boolean>.
 */
const ConfirmModal = {
  overlay: null, titleEl: null, msgEl: null, iconEl: null, acceptBtn: null, cancelBtn: null,

  init() {
    this.overlay = document.getElementById('confirm-modal');
    this.titleEl = document.getElementById('confirm-modal-title');
    this.msgEl = document.getElementById('confirm-modal-message');
    this.iconEl = document.getElementById('confirm-modal-icon');
    this.acceptBtn = document.getElementById('confirm-modal-accept');
    this.cancelBtn = document.getElementById('confirm-modal-cancel');
  },

  ask({ title = '¿Estás seguro?', message = 'Esta acción no se puede deshacer.', acceptLabel = 'Sí, continuar', danger = true } = {}) {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.msgEl.textContent = message;
      this.acceptBtn.textContent = acceptLabel;
      this.acceptBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      this.overlay.hidden = false;

      const cleanup = (result) => {
        this.overlay.hidden = true;
        this.acceptBtn.removeEventListener('click', onAccept);
        this.cancelBtn.removeEventListener('click', onCancel);
        this.overlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      };
      const onAccept = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlayClick = (e) => { if (e.target === this.overlay) cleanup(false); };
      const onKeydown = (e) => { if (e.key === 'Escape') cleanup(false); };

      this.acceptBtn.addEventListener('click', onAccept);
      this.cancelBtn.addEventListener('click', onCancel);
      this.overlay.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeydown);
    });
  },
};

window.Toast = Toast;
window.ConfirmModal = ConfirmModal;
