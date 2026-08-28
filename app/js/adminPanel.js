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
  let currentDetailGroup = null;

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
      detailDeletePlan: document.getElementById('admin-detail-delete-plan'),
      detailDeleteFeedback: document.getElementById('admin-detail-delete-feedback'),
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
      if (viewBtn) showDetail(viewBtn.dataset.key);
    });
    els.detailBack.addEventListener('click', () => showStep('table'));
    els.detailDeletePlan.addEventListener('click', () => {
      if (currentDetailGroup && currentDetailGroup.planSubmission) {
        handleDelete(currentDetailGroup.planSubmission.id, { fromDetail: true });
      }
    });
    els.detailDeleteFeedback.addEventListener('click', () => {
      if (currentDetailGroup && currentDetailGroup.feedbackSubmission) {
        handleDelete(currentDetailGroup.feedbackSubmission.id, { fromDetail: true });
      }
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

  /** Clave de agrupación: mismo profesor + mismo grupo = mismo informe. */
  function groupKey(teacherName, groupCode) {
    return `${String(teacherName || '').trim().toLowerCase()}||${String(groupCode || '').trim().toLowerCase()}`;
  }

  /**
   * Agrupa los envíos planos de Supabase por profesor+grupo. Cada grupo se
   * queda con el envío más reciente de cada `stage` (plan/feedback) — como
   * `allSubmissions` ya viene ordenado created_at.desc, el primero de cada
   * stage que aparece por grupo es el más reciente. Los envíos hechos antes
   * de agregar la columna `stage` quedan como `stage: 'plan'` (default de
   * la migración), así que siguen agrupándose correctamente.
   */
  function groupSubmissions(submissions) {
    const groups = new Map();
    submissions.forEach((s) => {
      const key = groupKey(s.teacher_name, s.group_code);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          teacher_name: s.teacher_name,
          group_code: s.group_code,
          course_label: s.course_label,
          schedule: s.schedule,
          latestDate: s.created_at,
          planSubmission: null,
          feedbackSubmission: null,
        });
      }
      const entry = groups.get(key);
      if (s.stage === 'feedback') {
        if (!entry.feedbackSubmission) entry.feedbackSubmission = s;
      } else if (!entry.planSubmission) {
        entry.planSubmission = s;
      }
      if (!entry.course_label && s.course_label) entry.course_label = s.course_label;
      if (!entry.schedule && s.schedule) entry.schedule = s.schedule;
      if (new Date(s.created_at) > new Date(entry.latestDate)) entry.latestDate = s.created_at;
    });
    return Array.from(groups.values());
  }

  function renderRows(query) {
    const q = query.trim().toLowerCase();
    const groups = groupSubmissions(allSubmissions);
    const filtered = !q
      ? groups
      : groups.filter((g) => [g.teacher_name, g.group_code, g.course_label]
        .some((val) => String(val || '').toLowerCase().includes(q)));

    if (filtered.length === 0) {
      els.tableBody.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    els.tableBody.innerHTML = filtered.map((g) => {
      const statusBadge = g.planSubmission && g.feedbackSubmission
        ? '<span class="admin-status-badge status-complete">Completo</span>'
        : g.planSubmission
          ? '<span class="admin-status-badge status-partial">Solo Minuto a Minuto</span>'
          : '<span class="admin-status-badge status-partial">Solo retroalimentación</span>';
      return `
        <tr>
          <td>${Utils.escapeHtml(formatDate(g.latestDate))}</td>
          <td>${Utils.escapeHtml(g.teacher_name || '')}</td>
          <td>${Utils.escapeHtml(g.group_code || '')}</td>
          <td>${Utils.escapeHtml(g.course_label || '')}</td>
          <td>${statusBadge}</td>
          <td class="admin-table-actions">
            <button type="button" class="btn btn-icon js-view-detail" data-key="${Utils.escapeHtml(g.key)}"><i class="fa-solid fa-eye"></i> Ver detalle</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function showDetail(key) {
    const group = groupSubmissions(allSubmissions).find((g) => g.key === key);
    if (!group) return;
    currentDetailGroup = group;
    els.detailBody.innerHTML = renderGroupDetailHtml(group);
    els.detailDeletePlan.disabled = !group.planSubmission;
    els.detailDeleteFeedback.disabled = !group.feedbackSubmission;
    showStep('detail');
  }

  /** Pide confirmación y elimina un envío puntual (plan o feedback), tanto desde la vista de detalle. */
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
        currentDetailGroup = null;
        showStep('table');
      }
      renderRows(els.searchInput.value);
    } catch (e) {
      console.error('No se pudo eliminar el envío.', e);
      Toast.error('No se pudo eliminar el envío. Revisa tu conexión e intenta de nuevo.');
    }
  }

  /**
   * Combina el registro `stage:'plan'` y el registro `stage:'feedback'` del
   * mismo profesor+grupo en un solo detalle. Compatibilidad retroactiva:
   * los envíos hechos antes de separar los flujos ya traían el feedback
   * embebido dentro del mismo registro plan (`plan.feedback`) — si no hay
   * un registro `feedback` separado, se usa ese como respaldo.
   */
  function renderGroupDetailHtml(group) {
    const planSub = group.planSubmission;
    const feedbackSub = group.feedbackSubmission;
    const plan = planSub ? (planSub.plan || {}) : {};
    const blocks = plan.blocks || [];
    const feedbackSource = (feedbackSub && feedbackSub.plan && feedbackSub.plan.feedback) || plan.feedback;

    const generalHtml = `
      <div class="admin-detail-general">
        <div><strong>Profesor:</strong> ${Utils.escapeHtml(group.teacher_name || '')}</div>
        <div><strong>Grupo:</strong> ${Utils.escapeHtml(group.group_code || '—')}</div>
        <div><strong>Curso:</strong> ${Utils.escapeHtml(group.course_label || plan.courseName || '—')}</div>
        <div><strong>Horario del grupo:</strong> ${Utils.escapeHtml(group.schedule || '—')}</div>
        <div><strong>Nombre del curso (Minuto a Minuto):</strong> ${Utils.escapeHtml(plan.courseName || '—')}</div>
        <div><strong>Hora de inicio:</strong> ${Utils.escapeHtml(plan.startTime || '—')}</div>
        <div><strong>Minuto a Minuto enviado:</strong> ${planSub ? Utils.escapeHtml(formatDate(planSub.created_at)) : 'Aún no se ha diligenciado.'}</div>
        <div><strong>Retroalimentación enviada:</strong> ${feedbackSub ? Utils.escapeHtml(formatDate(feedbackSub.created_at)) : 'Aún no se ha diligenciado.'}</div>
      </div>
    `;

    if (!planSub) {
      const feedbackOnlyHtml = renderFeedbackHtml(feedbackSource);
      return generalHtml + '<p class="admin-empty-state">Aún no se ha diligenciado el Minuto a Minuto.</p>' + feedbackOnlyHtml;
    }

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

    return generalHtml + blocksHtml + recommendationsHtml + renderFeedbackHtml(feedbackSource);
  }

  /** Sección de retroalimentación, reutilizada tanto si el plan está diligenciado como si solo llegó la retroalimentación. */
  function renderFeedbackHtml(feedbackSource) {
    const feedback = feedbackSource && feedbackSource.answers;
    if (!feedback) return '<div class="admin-detail-section"><h4>Retroalimentación</h4><p class="admin-empty-state">Aún no se ha diligenciado la retroalimentación.</p></div>';
    const feedbackLabels = { onTime: '¿Se cumplió con el tiempo planeado?', dua: '¿Se aplicó el DUA?', topics: '¿Se abordaron todos los temas planeados?' };
    const answersHtml = Object.entries(feedbackLabels).map(([key, label]) => {
      const answer = feedback[key];
      if (!answer || !answer.value) return '';
      return `<p class="admin-detail-text"><strong>${Utils.escapeHtml(label)}</strong> ${Utils.escapeHtml(answer.value === 'si' ? 'Sí' : 'No')}${answer.comment ? ' — ' + Utils.escapeHtml(answer.comment) : ''}</p>`;
    }).join('');
    const improveHtml = feedbackSource.improve
      ? `<p class="admin-detail-text"><strong>Aspectos a mejorar:</strong> ${Utils.escapeHtml(feedbackSource.improve)}</p>`
      : '';
    return `<div class="admin-detail-section"><h4>Retroalimentación</h4>${answersHtml}${improveHtml}</div>`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return { init };
})();

window.AdminPanel = AdminPanel;
