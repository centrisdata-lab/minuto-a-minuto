/**
 * app.js
 * Punto de entrada de la aplicación: inicializa módulos y conecta las
 * acciones globales (tema, exportación).
 */

const App = (() => {
  function init() {
    ThemeManager.init();
    ConfirmModal.init();
    AdminPanel.init();
    Storage.getTeacherId(); // asegura que exista una sesión de navegador
    TeacherIdentity.init(() => PlanForm.init());
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

    const toggle = document.getElementById('btn-download-toggle');
    const menu = document.getElementById('download-menu');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#download-dropdown')) {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('btn-download-xlsx').addEventListener('click', () => {
      PlanForm.save();
      Exporters.exportXlsx(PlanForm.getCurrentPlanObject());
      menu.classList.remove('open');
    });
    document.getElementById('btn-download-pdf').addEventListener('click', () => {
      PlanForm.save();
      Exporters.exportPdf(PlanForm.getCurrentPlanObject());
      menu.classList.remove('open');
    });
  }

  return { init };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
