/**
 * planForm.js
 * Controla el editor de las 2 etapas de envío (Preparación + Recomendaciones
 * generales, luego Retroalimentación tras el primer envío): carga de datos y
 * autoguardado.
 * Solo existe una planeación activa por navegador (ver storage.js).
 */

const PlanForm = (() => {
  let planId = null;
  let planCreatedAt = null;
  let els = {};
  let submissionState = { submitted: false, submittedAt: null, feedbackSubmitted: false, feedbackSubmittedAt: null };
  const debouncedSave = Utils.debounce(() => save(), 600);

  const FEEDBACK_QUESTIONS = ['onTime', 'dua', 'topics'];

  function cacheEls() {
    els = {
      form: document.getElementById('plan-form'),
      courseName: document.getElementById('plan-course-name'),
      startTime: document.getElementById('plan-start-time'),
      saveStatus: document.getElementById('save-status'),
      recommendationsNotes: document.getElementById('recommendations-notes'),
      feedbackImprove: document.getElementById('feedback-improve'),
      recommendationsCard: document.getElementById('card-recommendations'),
      feedbackCard: document.getElementById('card-feedback'),
      btnSubmitPlan: document.getElementById('btn-submit-plan'),
      btnSubmitFeedback: document.getElementById('btn-submit-feedback'),
      planSubmittedBanner: document.getElementById('plan-submitted-banner'),
      feedbackSubmittedBanner: document.getElementById('feedback-submitted-banner'),
    };
  }

  function init() {
    cacheEls();
    BlocksManager.init(document.getElementById('blocks-list'), () => {
      debouncedSave();
    });

    els.courseName.addEventListener('input', () => {
      debouncedSave();
    });

    els.startTime.addEventListener('input', () => {
      BlocksManager.recalculateStartTimes();
      debouncedSave();
    });

    document.getElementById('btn-add-block').addEventListener('click', () => BlocksManager.addBlock({}, { focus: true }));
    document.getElementById('btn-add-block-bottom').addEventListener('click', () => BlocksManager.addBlock({}, { focus: true }));

    document.getElementById('btn-clear-form').addEventListener('click', handleClearForm);
    document.getElementById('btn-duplicate-plan').addEventListener('click', handleExportCopy);

    initCollapsibleSections();
    initRecommendationsSection();
    initFeedbackSection();
    els.btnSubmitPlan.addEventListener('click', handleSubmitPlan);
    els.btnSubmitFeedback.addEventListener('click', handleSubmitFeedback);

    loadOrCreate();
  }

  /** Header-botón de una card colapsable: alterna `hidden` del body + aria-expanded + chevron. */
  function initCollapsibleSections() {
    document.querySelectorAll('.js-card-toggle').forEach((toggle) => {
      const bodyId = toggle.getAttribute('aria-controls');
      const body = document.getElementById(bodyId);
      if (!body) return;
      toggle.addEventListener('click', () => {
        const isOpen = !body.hidden;
        body.hidden = isOpen;
        toggle.setAttribute('aria-expanded', String(!isOpen));
      });
    });
  }

  /**
   * Bloques con los que arranca toda planeación nueva (y "Limpiar formulario").
   * Los 3 bloques ya vienen con su contenido estándar definido; el profesor
   * puede seguir editando, agregando o quitando sub-bloques igual que en
   * cualquier otro bloque (nada queda bloqueado a la fuerza, solo precargado).
   */
  function defaultBlocks() {
    return [
      {
        subBlocks: [
          { name: 'Saludo y bienvenida', duration: '00:02', activity: '', resources: '', responsible: '' },
          { name: 'Agenda de clase', duration: '00:02', activity: '', resources: '', responsible: '' },
          { name: 'Recordando lo aprendido', duration: '00:06', activity: '', resources: '', responsible: '' },
          { name: 'Gamificación opcional', duration: '00:00', activity: '', resources: '', responsible: '' },
        ],
      },
      {
        subBlocks: [
          { name: 'Inicio del tema', duration: '00:15', activity: '', resources: '', responsible: '' },
          { name: 'Pausa activa', duration: '00:03', activity: '', resources: '', responsible: '' },
          { name: 'Continuidad del tema', duration: '00:12', activity: '', resources: '', responsible: '' },
          { name: 'Momento de práctica', duration: '00:20', activity: '', resources: '', responsible: '' },
        ],
      },
      {
        subBlocks: [
          { name: 'Preguntas e inquietudes', duration: '00:30', activity: '', resources: '', responsible: '' },
        ],
        note: 'Aquí se podrán abordar las preguntas sobre temas de la clase o sobre la navegación en el Campus',
      },
    ];
  }

  /**
   * true si ningún sub-bloque tiene contenido real diligenciado por el
   * profesor (nombre, actividad, recursos o responsable). Un plan guardado
   * antes de que existiera la plantilla de 7 bloques cae aquí, así que se
   * puede migrar a la plantilla nueva sin perder ningún trabajo real. El
   * nombre se incluye en la verificación porque ahora viene precargado y el
   * profesor puede editarlo sin haber llenado todavía los demás campos.
   */
  function hasNoRealBlockContent(subBlocks) {
    if (!subBlocks || subBlocks.length === 0) return true;
    return subBlocks.every((b) => !b.name?.trim() && !b.activity?.trim() && !b.resources?.trim() && !b.responsible?.trim());
  }

  /** true si `blocks` viene en la forma plana antigua (bloques-hoja, sin `subBlocks`), previa a la jerarquía de dos niveles. */
  function isOldFlatShape(blocks) {
    return Array.isArray(blocks) && blocks.length > 0 && !Array.isArray(blocks[0].subBlocks);
  }

  /** Envuelve cada bloque plano antiguo en su propio bloque contenedor con 1 sub-bloque, preservando todo su contenido. */
  function migrateFlatBlocksToContainers(flatBlocks) {
    return flatBlocks.map((b) => ({
      subBlocks: [{
        name: b.name, duration: b.duration, start: b.start,
        activity: b.activity, resources: b.resources, responsible: b.responsible,
      }],
    }));
  }

  /** Aplana bloques contenedores (forma nueva) a la lista de sus sub-bloques, en orden. */
  function getFlatFromContainers(containers) {
    return (containers || []).flatMap((c) => c.subBlocks || []);
  }

  /**
   * Completa con los bloques estándar que falten al final un plan que quedó
   * con menos de los 7 bloques de la plantilla (por ejemplo, guardado
   * durante una versión anterior de la app que aún no tenía todos, o si el
   * profesor ya renombró alguno). Se completa por POSICIÓN, no por nombre
   * (renombrar un bloque no debe hacer que se agregue un duplicado): si el
   * plan ya tiene N bloques, se agregan los bloques estándar de la
   * plantilla desde la posición N en adelante. Los bloques existentes del
   * profesor nunca se tocan ni se reordenan.
   */
  function fillMissingDefaultBlocks(containers) {
    if (containers.length >= defaultBlocks().length) return containers;
    const missing = defaultBlocks().slice(containers.length);
    return [...containers, ...missing];
  }

  /* ---------------------------------------------------------------------
     Sección "Recomendaciones generales" (texto libre, parte del "antes")
     --------------------------------------------------------------------- */
  function initRecommendationsSection() {
    els.recommendationsNotes.addEventListener('input', () => {
      debouncedSave();
    });
  }

  /** Texto con el que arranca "Recomendaciones generales" en un plan nuevo — el profesor puede editarlo o borrarlo libremente. */
  const DEFAULT_RECOMMENDATIONS_TEXT = 'Conectarse mínimo 15 minutos antes de iniciar la clase.\nProbar cámara y audio (micrófono y parlantes).\nRevisar encuadre: buena iluminación y postura frente a la cámara.\nVerificar fondo (real o virtual) limpio y sin distractores.\nTener listos y abiertos los recursos (diapositivas, links, Padlet, etc.).\nVerificar conexión a internet estable.';

  function getRecommendationsData() {
    return { notes: els.recommendationsNotes.value };
  }

  /** Acepta tanto la forma nueva ({notes}) como el `duringClass` antiguo ({checks, notes}) para no perder notas ya guardadas. Si no hay nada guardado todavía, precarga el texto estándar de recomendaciones (editable). */
  function loadRecommendationsData(data) {
    els.recommendationsNotes.value = (data && data.notes) || DEFAULT_RECOMMENDATIONS_TEXT;
  }

  /* ---------------------------------------------------------------------
     Sección "Después de la clase" (retroalimentación)
     --------------------------------------------------------------------- */
  function initFeedbackSection() {
    document.querySelectorAll('.feedback-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const question = btn.dataset.question;
        const wasActive = btn.classList.contains('active');
        document.querySelectorAll(`.feedback-option[data-question="${question}"]`).forEach((sibling) => {
          sibling.classList.remove('active');
        });
        if (!wasActive) btn.classList.add('active');
        debouncedSave();
      });
    });

    document.querySelectorAll('.js-feedback-comment').forEach((textarea) => {
      textarea.addEventListener('input', () => {
        debouncedSave();
      });
    });

    els.feedbackImprove.addEventListener('input', () => {
      debouncedSave();
    });
  }

  function getFeedbackData() {
    const answers = {};
    FEEDBACK_QUESTIONS.forEach((question) => {
      const activeBtn = document.querySelector(`.feedback-option.active[data-question="${question}"]`);
      const comment = document.querySelector(`.js-feedback-comment[data-question="${question}"]`);
      answers[question] = {
        value: activeBtn ? activeBtn.dataset.value : '',
        comment: comment ? comment.value : '',
      };
    });
    return { answers, improve: els.feedbackImprove.value };
  }

  function loadFeedbackData(data) {
    const answers = (data && data.answers) || {};
    FEEDBACK_QUESTIONS.forEach((question) => {
      document.querySelectorAll(`.feedback-option[data-question="${question}"]`).forEach((btn) => {
        const shouldBeActive = !!(answers[question] && answers[question].value === btn.dataset.value);
        btn.classList.toggle('active', shouldBeActive);
      });
      const comment = document.querySelector(`.js-feedback-comment[data-question="${question}"]`);
      if (comment) comment.value = (answers[question] && answers[question].comment) || '';
    });
    els.feedbackImprove.value = (data && data.improve) || '';
  }

  /* ---------------------------------------------------------------------
     Carga / guardado general
     --------------------------------------------------------------------- */

  /**
   * Deja el formulario en blanco. Usado tanto al crear una planeación nueva
   * (sin plan activo aún, `keepId: false`) como al limpiar una existente
   * (mismo registro, solo se vacía su contenido, `keepId: true`).
   */
  function resetToEmptyPlan({ keepId = false } = {}) {
    if (!keepId) {
      planId = null;
      planCreatedAt = null;
    }
    els.courseName.value = '';
    els.startTime.value = '09:00';
    BlocksManager.loadBlocks(defaultBlocks());
    loadRecommendationsData(null);
    loadFeedbackData(null);
    applySubmissionState({ submitted: false, feedbackSubmitted: false });
  }

  function loadOrCreate() {
    const plan = Storage.getActivePlan();
    if (plan) {
      planId = plan.id;
      planCreatedAt = plan.createdAt || null;
      els.courseName.value = plan.courseName || '';
      els.startTime.value = plan.startTime || '09:00';

      // Migra planes guardados en la forma plana antigua (antes de la
      // jerarquía de dos niveles) a bloques contenedores con sub-bloques.
      let blocksToLoad = plan.blocks;
      if (isOldFlatShape(blocksToLoad)) {
        blocksToLoad = migrateFlatBlocksToContainers(blocksToLoad);
      }
      // Si nadie diligenció nada real todavía, se reemplaza por la plantilla
      // estándar sin perder ningún trabajo real.
      if (hasNoRealBlockContent(getFlatFromContainers(blocksToLoad))) {
        blocksToLoad = defaultBlocks();
      } else {
        // Si hay contenido real pero faltan bloques estándar (por ejemplo,
        // guardado durante una versión anterior con menos bloques), se
        // completan al final sin tocar los que ya existen.
        blocksToLoad = fillMissingDefaultBlocks(blocksToLoad);
      }

      BlocksManager.loadBlocks(blocksToLoad);
      // `duringClass` es el nombre antiguo del campo (antes de que la
      // sección dejara de ser un checklist); se sigue leyendo por si el
      // plan guardado viene de una versión previa.
      loadRecommendationsData(plan.recommendations || plan.duringClass);
      loadFeedbackData(plan.feedback);
      applySubmissionState(plan);
    } else {
      resetToEmptyPlan();
    }
    setSaveStatus('saved');
  }

  function buildPlanObject() {
    const blocks = BlocksManager.getAllBlocksData();
    const flatSubBlocks = BlocksManager.getFlatSubBlocksData();
    const recommendations = getRecommendationsData();
    const feedback = getFeedbackData();
    return {
      id: planId,
      createdAt: planCreatedAt,
      courseName: els.courseName.value,
      startTime: els.startTime.value,
      blocks,
      recommendations,
      feedback,
      submitted: submissionState.submitted,
      submittedAt: submissionState.submittedAt,
      feedbackSubmitted: submissionState.feedbackSubmitted,
      feedbackSubmittedAt: submissionState.feedbackSubmittedAt,
      progress: calculateProgress(flatSubBlocks, recommendations, feedback),
    };
  }

  /** Calcula el % de diligenciamiento combinando las 2 etapas (uso interno, no se muestra en la UI). */
  function calculateProgress(subBlocks, recommendations, feedback) {
    let total = 0;
    let filled = 0;

    subBlocks.forEach((b) => {
      ['name', 'duration', 'activity', 'resources', 'responsible'].forEach((key) => {
        total++;
        if (b[key] && String(b[key]).trim()) filled++;
      });
    });

    total++;
    if (recommendations.notes && recommendations.notes.trim()) filled++;

    FEEDBACK_QUESTIONS.forEach((question) => {
      total++;
      if (feedback.answers[question].value) filled++;
    });

    if (total === 0) return 0;
    return Utils.clamp(Math.round((filled / total) * 100), 0, 100);
  }

  function setSaveStatus(state) {
    const el = els.saveStatus;
    el.classList.remove('saving', 'error');
    if (state === 'saving') {
      el.classList.add('saving');
      el.innerHTML = '<i class="fa-solid fa-circle-notch"></i><span>Guardando...</span>';
    } else if (state === 'error') {
      el.classList.add('error');
      el.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Error al guardar</span>';
    } else {
      el.innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Guardado</span>';
    }
  }

  function save() {
    setSaveStatus('saving');
    try {
      const plan = buildPlanObject();
      const saved = Storage.savePlan(plan);
      planId = saved.id;
      planCreatedAt = saved.createdAt;
      setTimeout(() => setSaveStatus('saved'), 250);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
      Toast.error('No se pudo guardar. Verifica el espacio disponible en tu navegador.');
    }
  }

  async function handleClearForm() {
    const confirmed = await ConfirmModal.ask({
      title: 'Limpiar formulario',
      message: 'Se borrará toda la información de la planeación (preparación, recomendaciones y retroalimentación). Esta acción no se puede deshacer.',
      acceptLabel: 'Sí, limpiar',
    });
    if (!confirmed) return;
    resetToEmptyPlan({ keepId: true });
    save();
    Toast.info('Formulario reiniciado.');
  }

  /**
   * Descarga una copia en Excel de la planeación actual (no crea una segunda
   * planeación editable: este navegador solo mantiene una activa a la vez).
   */
  function handleExportCopy() {
    save();
    const current = Storage.getActivePlan();
    if (!current) return;
    Exporters.exportXlsx(current);
    Toast.info('Se descargó una copia en Excel. Sigues editando la misma planeación.');
  }

  function getCurrentPlanObject() {
    return buildPlanObject();
  }

  /* ---------------------------------------------------------------------
     Envío en dos etapas: "antes" (Minuto a Minuto + recomendaciones) y,
     tras enviarlo, "después" (retroalimentación). Cada envío queda fijo:
     una vez enviada una etapa, sus campos se bloquean y no se puede volver
     a editar (habría que crear una planeación nueva).
     --------------------------------------------------------------------- */

  function formatSubmittedAt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Refleja en la UI el estado guardado (`submitted`/`feedbackSubmitted`) de un plan: bloquea campos, muestra banners, revela la card de retroalimentación. */
  function applySubmissionState(plan) {
    submissionState = {
      submitted: !!(plan && plan.submitted),
      submittedAt: (plan && plan.submittedAt) || null,
      feedbackSubmitted: !!(plan && plan.feedbackSubmitted),
      feedbackSubmittedAt: (plan && plan.feedbackSubmittedAt) || null,
    };
    const { submitted, submittedAt, feedbackSubmitted, feedbackSubmittedAt } = submissionState;

    els.recommendationsCard.classList.toggle('is-locked', submitted);
    els.btnSubmitPlan.hidden = submitted;
    els.planSubmittedBanner.hidden = !submitted;
    els.planSubmittedBanner.querySelector('.js-submitted-at').textContent = formatSubmittedAt(submittedAt);
    setFormFieldsDisabled(els.recommendationsCard, submitted);
    BlocksManager.setLocked(submitted);

    els.feedbackCard.hidden = !submitted;
    els.feedbackCard.classList.toggle('is-locked', feedbackSubmitted);
    els.btnSubmitFeedback.hidden = feedbackSubmitted;
    els.feedbackSubmittedBanner.hidden = !feedbackSubmitted;
    els.feedbackSubmittedBanner.querySelector('.js-submitted-at').textContent = formatSubmittedAt(feedbackSubmittedAt);
    setFormFieldsDisabled(els.feedbackCard, feedbackSubmitted);
  }

  function setFormFieldsDisabled(cardEl, disabled) {
    cardEl.querySelectorAll('input, textarea, select, button.feedback-option').forEach((el) => {
      el.disabled = disabled;
    });
  }

  /**
   * Registra el envío localmente (respaldo/cache, y lo que hoy usa
   * localStorage['mam_submissions']) y, si es posible, lo sincroniza con
   * Google Drive real: sube el Excel del plan a la carpeta compartida y
   * agrega una fila al Sheet central que lee el panel admin (ver
   * driveSync.js). Si Drive falla (sin conexión, permiso rechazado, etc.)
   * el envío local ya quedó guardado igual — no se pierde el trabajo del
   * profesor, solo no llega al panel admin hasta que reintente.
   */
  async function submitToBackend(payload) {
    try {
      const key = 'mam_submissions';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(payload);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.error('No se pudo registrar el envío localmente.', e);
    }

    if (typeof DriveSync === 'undefined') return { synced: false };

    try {
      const identity = TeacherIdentity.getIdentity() || {};
      const blob = Exporters.exportXlsxBlob(payload.plan);
      let driveLink = '';
      if (blob) {
        const fileName = Exporters.buildFileName(payload.plan.courseName, 'xlsx');
        const uploaded = await DriveSync.uploadExcelToDrive(blob, fileName);
        driveLink = uploaded.webViewLink || '';
      }
      await DriveSync.appendSubmissionRow([
        new Date().toISOString(),
        payload.type,
        identity.name || '',
        identity.group || '',
        identity.courseLabel || '',
        identity.schedule || '',
        driveLink,
        `${payload.plan.progress || 0}%`,
      ]);
      return { synced: true };
    } catch (e) {
      console.error('No se pudo sincronizar el envío con Google Drive.', e);
      return { synced: false, error: e };
    }
  }

  async function handleSubmitPlan() {
    if (!els.courseName.value.trim()) {
      Toast.warning('Escribe el nombre del curso antes de enviar.');
      els.courseName.focus();
      return;
    }
    els.btnSubmitPlan.disabled = true;
    const originalLabel = els.btnSubmitPlan.innerHTML;
    els.btnSubmitPlan.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    const result = await submitToBackend({ type: 'plan', plan: buildPlanObject() });

    els.btnSubmitPlan.innerHTML = originalLabel;
    els.btnSubmitPlan.disabled = false;
    submissionState.submitted = true;
    submissionState.submittedAt = new Date().toISOString();
    applySubmissionState({ ...submissionState });
    save();

    if (result.synced) {
      Toast.success('Minuto a Minuto enviado y sincronizado con Drive. Ahora puedes registrar la retroalimentación al terminar la clase.');
    } else {
      Toast.warning('Se guardó tu Minuto a Minuto, pero no se pudo sincronizar con Drive (revisa tu conexión o permisos de Google). Puedes seguir usando la app normalmente.');
    }
    els.feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmitFeedback() {
    els.btnSubmitFeedback.disabled = true;
    const originalLabel = els.btnSubmitFeedback.innerHTML;
    els.btnSubmitFeedback.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    const result = await submitToBackend({ type: 'feedback', plan: buildPlanObject() });

    els.btnSubmitFeedback.innerHTML = originalLabel;
    els.btnSubmitFeedback.disabled = false;
    submissionState.feedbackSubmitted = true;
    submissionState.feedbackSubmittedAt = new Date().toISOString();
    applySubmissionState({ ...submissionState });
    save();

    if (result.synced) {
      Toast.success('Retroalimentación enviada y sincronizada con Drive. ¡Gracias!');
    } else {
      Toast.warning('Se guardó tu retroalimentación, pero no se pudo sincronizar con Drive (revisa tu conexión o permisos de Google).');
    }
  }

  return {
    init,
    save,
    getCurrentPlanObject,
  };
})();

window.PlanForm = PlanForm;
