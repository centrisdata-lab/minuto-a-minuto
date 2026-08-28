/**
 * teacherIdentity.js
 * Pide nombre + rol (Profesor/Tutor/Administrador) justo en el momento en
 * que se hace clic en "Descargar PDF y Enviar" o "Enviar retroalimentación"
 * — no bloquea la app al cargar la página. El grupo/curso/horario ya no se
 * pide aquí: se selecciona una sola vez al inicio del formulario (ver el
 * selector de grupo en planForm.js) y viaja con el resto del plan.
 * `askIdentity()` devuelve una Promise que resuelve con { name, role } al
 * confirmar, o null si se cancela.
 */

const TeacherIdentity = (() => {
  let els = {};
  let resolveCurrent = null;

  function cacheEls() {
    els = {
      overlay: document.getElementById('identity-modal'),
      form: document.getElementById('identity-form'),
      nameInput: document.getElementById('identity-name'),
      roleSelect: document.getElementById('identity-role'),
      errorEl: document.getElementById('identity-error'),
      cancelBtn: document.getElementById('identity-cancel'),
    };
  }

  function init() {
    cacheEls();

    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleConfirm();
    });
    els.cancelBtn.addEventListener('click', () => finish(null));
    els.overlay.addEventListener('click', (e) => { if (e.target === els.overlay) finish(null); });
  }

  /** Abre el modal y devuelve una Promise que resuelve con la identidad elegida, o null si se cancela. */
  function askIdentity() {
    return new Promise((resolve) => {
      resolveCurrent = resolve;
      els.nameInput.value = '';
      els.roleSelect.value = 'profesor';
      els.errorEl.hidden = true;
      els.overlay.hidden = false;
      els.nameInput.focus();
    });
  }

  function finish(result) {
    els.overlay.hidden = true;
    const resolve = resolveCurrent;
    resolveCurrent = null;
    if (resolve) resolve(result);
  }

  function handleConfirm() {
    const name = els.nameInput.value.trim();
    if (!name) {
      showError('Escribe tu nombre.');
      els.nameInput.focus();
      return;
    }
    finish({
      name,
      role: els.roleSelect.value,
    });
  }

  function showError(msg) {
    els.errorEl.textContent = msg;
    els.errorEl.hidden = false;
  }

  return { init, askIdentity };
})();

window.TeacherIdentity = TeacherIdentity;
