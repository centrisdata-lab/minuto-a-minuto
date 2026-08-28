/**
 * adminPanel.js
 * Panel de administración: lista los envíos de todos los profesores leyendo
 * la tabla `submissions` de Supabase (ver submissionsApi.js) — sin ningún
 * login de Google, solo la contraseña simple de este panel. Protegido con
 * una contraseña simple en el cliente — NO es seguridad real (cualquiera
 * puede leerla abriendo las herramientas de desarrollador), solo un filtro
 * básico de conveniencia para evitar que alguien entre por error. La
 * sesión admin se guarda en sessionStorage, así que se pide de nuevo cada
 * vez que se cierra la pestaña.
 */

const AdminPanel = (() => {
  const ADMIN_PASSWORD = '123'; // Ver nota de seguridad arriba: filtro de conveniencia, no protección real.
  const SESSION_KEY = 'mam_admin_session';

  let els = {};
  let allSubmissions = [];
  let currentDetailId = null;

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
      detailStep: document.getElementById('admin-detail-step'),
      searchInput: document.getElementById('admin-search'),
      tableBody: document.getElementById('admin-table-body'),
      emptyState: document.getElementById('admin-empty-state'),
      logoutBtn: document.getElementById('admin-logout'),
      retryBtn: document.getElementById('admin-retry'),
      errorStep: document.getElementById('admin-error-step'),
      errorMessage: document.getElementById('admin-error-message'),
      detailBack: document.getElementById('admin-detail-back'),
      detailBody: document.getElementById('admin-detail-body'),
      detailDelete: document.getElementById('admin-detail-delete'),
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
    els.tableBody.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.js-view-detail');
      if (viewBtn) { showDetail(viewBtn.dataset.id); return; }
      const deleteBtn = e.target.closest('.js-delete-submission');
      if (deleteBtn) handleDelete(deleteBtn.dataset.id);
    });
    els.detailBack.addEventListener('click', () => showStep('table'));
    els.detailDelete.addEventListener('click', () => {
      if (currentDetailId) handleDelete(currentDetailId, { fromDetail: true });
    });
  }

  function hasAdminSession() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function showStep(step) {
    els.passwordStep.hidden = step !== 'password';
    els.loadingStep.hidden = step !== 'loading';
    els.tableStep.hidden = step !== 'table';
    els.detailStep.hidden = step !== 'detail';
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
      allSubmissions = await SubmissionsApi.fetchAllSubmissions();
      renderRows('');
      showStep('table');
      els.searchInput.value = '';
      els.searchInput.focus();
    } catch (e) {
      console.error('No se pudieron cargar los envíos del panel admin.', e);
      els.errorMessage.textContent = e.message || 'Ocurrió un error al conectar con la base de datos.';
      showStep('error');
    }
  }

  function renderRows(query) {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? allSubmissions
      : allSubmissions.filter((s) => [s.teacher_name, s.group_code, s.course_label, s.course_name]
        .some((val) => String(val || '').toLowerCase().includes(q)));

    if (filtered.length === 0) {
      els.tableBody.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    els.tableBody.innerHTML = filtered.map((s) => `
      <tr>
        <td>${Utils.escapeHtml(formatDate(s.created_at))}</td>
        <td>${Utils.escapeHtml(s.teacher_name || '')}</td>
        <td>${Utils.escapeHtml(s.group_code || '')}</td>
        <td>${Utils.escapeHtml(s.course_label || s.course_name || '')}</td>
        <td>${Utils.escapeHtml(s.start_time || '')}</td>
        <td class="admin-table-actions">
          <button type="button" class="btn btn-icon js-view-detail" data-id="${Utils.escapeHtml(s.id)}"><i class="fa-solid fa-eye"></i> Ver detalle</button>
          <button type="button" class="icon-btn icon-btn-danger js-delete-submission" data-id="${Utils.escapeHtml(s.id)}" title="Eliminar envío" aria-label="Eliminar envío"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  function showDetail(id) {
    const submission = allSubmissions.find((s) => String(s.id) === String(id));
    if (!submission) return;
    currentDetailId = id;
    els.detailBody.innerHTML = renderDetailHtml(submission);
    showStep('detail');
  }

  /** Pide confirmación y elimina un envío, tanto desde la fila de la tabla como desde el botón de la vista de detalle. */
  async function handleDelete(id, { fromDetail = false } = {}) {
    const submission = allSubmissions.find((s) => String(s.id) === String(id));
    const label = submission ? `de ${submission.teacher_name || 'este profesor'}` : '';
    const confirmed = await ConfirmModal.ask({
      title: 'Eliminar envío',
      message: `Se eliminará permanentemente el envío ${label}. Esta acción no se puede deshacer.`,
      acceptLabel: 'Sí, eliminar',
    });
    if (!confirmed) return;

    try {
      await SubmissionsApi.deleteSubmission(id);
      allSubmissions = allSubmissions.filter((s) => String(s.id) !== String(id));
      Toast.success('Envío eliminado.');
      if (fromDetail) {
        currentDetailId = null;
        showStep('table');
      }
      renderRows(els.searchInput.value);
    } catch (e) {
      console.error('No se pudo eliminar el envío.', e);
      Toast.error('No se pudo eliminar el envío. Revisa tu conexión e intenta de nuevo.');
    }
  }

  /** Renderiza el `plan` completo (jsonb) de un envío: datos generales, bloques con sus sub-bloques, recomendaciones y retroalimentación. */
  function renderDetailHtml(submission) {
    const plan = submission.plan || {};
    const blocks = plan.blocks || [];

    const generalHtml = `
      <div class="admin-detail-general">
        <div><strong>Profesor:</strong> ${Utils.escapeHtml(submission.teacher_name || '')}</div>
        <div><strong>Grupo:</strong> ${Utils.escapeHtml(submission.group_code || '—')}</div>
        <div><strong>Curso:</strong> ${Utils.escapeHtml(submission.course_label || plan.courseName || '—')}</div>
        <div><strong>Horario del grupo:</strong> ${Utils.escapeHtml(submission.schedule || '—')}</div>
        <div><strong>Nombre del curso (Minuto a Minuto):</strong> ${Utils.escapeHtml(plan.courseName || '—')}</div>
        <div><strong>Hora de inicio:</strong> ${Utils.escapeHtml(plan.startTime || '—')}</div>
        <div><strong>Enviado:</strong> ${Utils.escapeHtml(formatDate(submission.created_at))}</div>
      </div>
    `;

    const blocksHtml = blocks.map((container, i) => {
      const subRows = (container.subBlocks || []).map((sb) => `
        <tr>
          <td>${Utils.escapeHtml(sb.name || '')}</td>
          <td>${Utils.escapeHtml(sb.duration ? Utils.durationLabel(sb.duration) : '')}</td>
          <td>${Utils.escapeHtml(sb.start || '')}</td>
          <td>${Utils.escapeHtml(sb.activity || '')}</td>
          <td>${Utils.escapeHtml(sb.resources || '')}</td>
          <td>${Utils.escapeHtml(sb.responsible || '')}</td>
        </tr>
      `).join('');
      const noteHtml = container.note
        ? `<p class="admin-detail-block-note"><i class="fa-solid fa-note-sticky"></i> ${Utils.escapeHtml(container.note)}</p>`
        : '';
      return `
        <div class="admin-detail-block">
          <h4>Bloque ${i + 1}</h4>
          ${noteHtml}
          <div class="example-table-wrap">
            <table class="example-table">
              <thead><tr><th>Bloque</th><th>Duración</th><th>Hora inicio</th><th>Actividad</th><th>Recursos / Links</th><th>Responsable</th></tr></thead>
              <tbody>${subRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    const recommendations = (plan.recommendations && plan.recommendations.notes || '').trim();
    const recommendationsHtml = recommendations
      ? `<div class="admin-detail-section"><h4>Recomendaciones generales</h4><p class="admin-detail-text">${Utils.escapeHtml(recommendations)}</p></div>`
      : '';

    const feedback = plan.feedback && plan.feedback.answers;
    const feedbackLabels = { onTime: '¿Se cumplió con el tiempo planeado?', dua: '¿Se aplicó el DUA?', topics: '¿Se abordaron todos los temas planeados?' };
    const feedbackHtml = feedback
      ? `<div class="admin-detail-section"><h4>Retroalimentación</h4>${Object.entries(feedbackLabels).map(([key, label]) => {
          const answer = feedback[key];
          if (!answer || !answer.value) return '';
          return `<p class="admin-detail-text"><strong>${Utils.escapeHtml(label)}</strong> ${Utils.escapeHtml(answer.value === 'si' ? 'Sí' : 'No')}${answer.comment ? ' — ' + Utils.escapeHtml(answer.comment) : ''}</p>`;
        }).join('')}${plan.feedback.improve ? `<p class="admin-detail-text"><strong>Aspectos a mejorar:</strong> ${Utils.escapeHtml(plan.feedback.improve)}</p>` : ''}</div>`
      : '';

    return generalHtml + blocksHtml + recommendationsHtml + feedbackHtml;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return { init };
})();

window.AdminPanel = AdminPanel;
