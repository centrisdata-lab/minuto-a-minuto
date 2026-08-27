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

    // El callback de TeacherIdentity se dispara tanto la primera vez que se
    // completa el formulario de identidad como cada vez que el profesor usa
    // el badge "Cambiar" para corregir su nombre/grupo más tarde. PlanForm
    // solo debe inicializarse una sola vez (reinicializarlo duplicaría
    // listeners y volvería a disparar guardados); en los cambios posteriores
    // no hace falta hacer nada más, el plan activo no depende de la
    // identidad para cargarse.
    let planFormStarted = false;
    TeacherIdentity.init(() => {
      if (planFormStarted) return;
      planFormStarted = true;
      PlanForm.init();
    });

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

    document.getElementById('btn-download-image').addEventListener('click', () => {
      PlanForm.save();
      Exporters.exportPdf(PlanForm.getCurrentPlanObject());
    });
  }

  return { init };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
