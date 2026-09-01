/**
 * app.js
 * Punto de entrada de la aplicación: inicializa módulos y conecta las
 * acciones globales (tema, exportación).
 */

const App = (() => {
  function init() {
    ThemeManager.init();
    ConfirmModal.init();
    Storage.getTeacherId(); // asegura que exista una sesión de navegador
    TeacherIdentity.init();
    AdminPanel.init();
    PlanForm.init();
    bindGlobalActions();
    document.getElementById('footer-year').textContent = new Date().getFullYear();
  }

  function bindGlobalActions() {
    const exampleToggle = document.getElementById('btn-toggle-example');
    const exampleCard = document.getElementById('example-card');
    exampleToggle.addEventListener('click', () => {
      const isOpen = exampleCard.hidden;
      exampleCard.hidden = !isOpen;
      exampleToggle.setAttribute('aria-expanded', String(isOpen));
      exampleToggle.querySelector('span').textContent = isOpen ? 'Ocultar ejemplo' : 'Ver ejemplo';
    });

    bindTutorialModal();
  }

  /** Modal con el video tutorial ("¿Cómo diligenciar el Minuto a Minuto?"), abierto desde el header. */
  function bindTutorialModal() {
    const openBtn = document.getElementById('btn-tutorial');
    const closeBtn = document.getElementById('tutorial-modal-close');
    const overlay = document.getElementById('tutorial-modal');
    const video = document.getElementById('tutorial-video');
    let releaseFocusTrap = null;

    const open = () => {
      overlay.hidden = false;
      releaseFocusTrap = Utils.trapFocus(overlay);
      closeBtn.focus();
    };
    const close = () => {
      overlay.hidden = true;
      video.pause();
      if (releaseFocusTrap) { releaseFocusTrap(); releaseFocusTrap = null; }
    };

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  return { init };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
