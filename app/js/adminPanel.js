/**
 * adminPanel.js
 * Panel de administración: lista los envíos de todos los profesores leyendo
 * el Google Sheet central (ver driveSync.js). Protegido con una contraseña
 * simple en el cliente — NO es seguridad real (cualquiera puede leerla
 * abriendo las herramientas de desarrollador), solo un filtro básico de
 * conveniencia para evitar que alguien entre por error. La sesión admin
 * (una vez pasada la contraseña) se guarda en sessionStorage, así que se
 * pide de nuevo cada vez que se cierra la pestaña.
 */

const AdminPanel = (() => {
  const ADMIN_PASSWORD = '123'; // Ver nota de seguridad arriba: filtro de conveniencia, no protección real.
  const SESSION_KEY = 'mam_admin_session';
  const COLUMNS = ['Fecha', 'Tipo', 'Profesor', 'Grupo', 'Curso', 'Horario', 'Link Excel', 'Progreso'];

  let els = {};
  let allRows = [];

  function cacheEls() {
    els = {
      overlay: document.getElementById('admin-modal'),
      openBtn: document.getElementById('btn-admin-panel'),
      closeBtn: document.getElementById('admin-modal-close'),
      passwordStep: document.getElementById('admin-password-step'),
      passwordInput: document.getElementById('admin-password-input'),
      passwordForm: document.getElementById('admin-password-form'),
      passwordError: document.getElementById('admin-password-error'),
      loadingStep: document.getElementById('admin-loading-step'),
      tableStep: document.getElementById('admin-table-step'),
      searchInput: document.getElementById('admin-search'),
      tableBody: document.getElementById('admin-table-body'),
      emptyState: document.getElementById('admin-empty-state'),
      logoutBtn: document.getElementById('admin-logout'),
      retryBtn: document.getElementById('admin-retry'),
      errorStep: document.getElementById('admin-error-step'),
      errorMessage: document.getElementById('admin-error-message'),
    };
  }

  function init() {
    cacheEls();
    els.openBtn.addEventListener('click', open);
    els.closeBtn.addEventListener('click', close);
    els.overlay.addEventListener('click', (e) => { if (e.target === els.overlay) close(); });
    els.passwordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePasswordSubmit();
    });
    els.searchInput.addEventListener('input', () => renderRows(els.searchInput.value));
    els.logoutBtn.addEventListener('click', logout);
    els.retryBtn.addEventListener('click', loadSubmissions);
  }

  function hasAdminSession() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function showStep(step) {
    els.passwordStep.hidden = step !== 'password';
    els.loadingStep.hidden = step !== 'loading';
    els.tableStep.hidden = step !== 'table';
    els.errorStep.hidden = step !== 'error';
  }

  function open() {
    els.overlay.hidden = false;
    els.passwordError.hidden = true;
    els.passwordInput.value = '';
    if (hasAdminSession()) {
      loadSubmissions();
    } else {
      showStep('password');
      els.passwordInput.focus();
    }
  }

  function close() {
    els.overlay.hidden = true;
  }

  function handlePasswordSubmit() {
    if (els.passwordInput.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      loadSubmissions();
    } else {
      els.passwordError.hidden = false;
      els.passwordInput.value = '';
      els.passwordInput.focus();
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    close();
  }

  async function loadSubmissions() {
    showStep('loading');
    try {
      allRows = await DriveSync.fetchAllSubmissions();
      renderRows('');
      showStep('table');
      els.searchInput.value = '';
      els.searchInput.focus();
    } catch (e) {
      console.error('No se pudieron cargar los envíos del panel admin.', e);
      els.errorMessage.textContent = e.message || 'Ocurrió un error al conectar con Google Sheets.';
      showStep('error');
    }
  }

  function renderRows(query) {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? allRows
      : allRows.filter((row) => row.some((cell) => String(cell || '').toLowerCase().includes(q)));

    if (filtered.length === 0) {
      els.tableBody.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    els.tableBody.innerHTML = filtered
      .slice()
      .reverse() // más recientes primero
      .map((row) => {
        const [fecha, tipo, profesor, grupo, curso, horario, link, progreso] = row;
        const fechaLabel = formatDate(fecha);
        const linkCell = link
          ? `<a href="${Utils.escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="admin-link"><i class="fa-solid fa-file-excel"></i> Abrir</a>`
          : '<span class="admin-link-empty">—</span>';
        return `
          <tr>
            <td>${Utils.escapeHtml(fechaLabel)}</td>
            <td>${Utils.escapeHtml(tipo === 'plan' ? 'Minuto a Minuto' : 'Retroalimentación')}</td>
            <td>${Utils.escapeHtml(profesor || '')}</td>
            <td>${Utils.escapeHtml(grupo || '')}</td>
            <td>${Utils.escapeHtml(curso || '')}</td>
            <td>${Utils.escapeHtml(horario || '')}</td>
            <td>${linkCell}</td>
            <td>${Utils.escapeHtml(progreso || '')}</td>
          </tr>
        `;
      })
      .join('');
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return { init };
})();

window.AdminPanel = AdminPanel;
