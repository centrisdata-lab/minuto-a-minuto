/**
 * planForm.js
 * Controla el editor de las 3 secciones (Preparación / Durante / Después de
 * la clase): carga de datos y autoguardado.
 * Solo existe una planeación activa por navegador (ver storage.js).
 */

const PlanForm = (() => {
  let planId = null;
  let planCreatedAt = null;
  let els = {};
  const debouncedSave = Utils.debounce(() => save(), 600);

  const DURING_CHECK_KEYS = ['connectEarly', 'testCamera', 'framing', 'background', 'resourcesReady', 'internet'];
  const FEEDBACK_QUESTIONS = ['onTime', 'dua', 'topics'];

  function cacheEls() {
    els = {
      form: document.getElementById('plan-form'),
      courseName: document.getElementById('plan-course-name'),
      startTime: document.getElementById('plan-start-time'),
      saveStatus: document.getElementById('save-status'),
      duringNotes: document.getElementById('during-class-notes'),
      feedbackImprove: document.getElementById('feedback-improve'),
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

    initDuringClassChecklist();
    initFeedbackSection();

    loadOrCreate();
  }

  /**
   * Bloques con los que arranca toda planeación nueva (y "Limpiar formulario").
   * Cada uno de los 7 bloques estándar de una clase de 90 minutos se envuelve
   * en su propio bloque contenedor con un solo sub-bloque adentro; el profesor
   * puede editar nombre/duración, agregar más sub-bloques, borrar o reordenar,
   * y solo necesita completar Recursos/Links y Responsable en cada uno.
   */
  function defaultBlocks() {
    const flat = [
      { name: 'Saludo y bienvenida', duration: '00:02', activity: '', resources: '', responsible: '' },
      { name: 'Agenda de clase', duration: '00:01', activity: '', resources: '', responsible: '' },
      { name: 'Recordemos lo aprendido', duration: '00:05', activity: '', resources: '', responsible: '' },
      { name: 'Desarrollo del tema', duration: '00:40', activity: '', resources: '', responsible: '' },
      { name: 'Práctica', duration: '00:25', activity: '', resources: '', responsible: '' },
      { name: 'Pausa activa', duration: '00:07', activity: '', resources: '', responsible: '' },
      { name: 'Preguntas e inquietudes', duration: '00:10', activity: '', resources: '', responsible: '' },
    ];
    return flat.map((subBlock) => ({ subBlocks: [subBlock] }));
  }

  /**
   * true si ningún sub-bloque tiene contenido real diligenciado por el
   * profesor (actividad, recursos o responsable). Un plan guardado antes de
   * que existiera la plantilla de 7 bloques cae aquí, así que se puede
   * migrar a la plantilla nueva sin perder ningún trabajo real.
   */
  function hasNoRealBlockContent(subBlocks) {
    if (!subBlocks || subBlocks.length === 0) return true;
    return subBlocks.every((b) => !b.activity?.trim() && !b.resources?.trim() && !b.responsible?.trim());
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

  /* ---------------------------------------------------------------------
     Sección "Durante la clase" (checklist)
     --------------------------------------------------------------------- */
  function initDuringClassChecklist() {
    document.querySelectorAll('.js-during-check').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        debouncedSave();
      });
    });
    els.duringNotes.addEventListener('input', () => {
      debouncedSave();
    });
  }

  function getDuringClassData() {
    const checks = {};
    DURING_CHECK_KEYS.forEach((key) => {
      const checkbox = document.querySelector(`.js-during-check[data-key="${key}"]`);
      checks[key] = checkbox ? checkbox.checked : false;
    });
    return { checks, notes: els.duringNotes.value };
  }

  function loadDuringClassData(data) {
    const checks = (data && data.checks) || {};
    DURING_CHECK_KEYS.forEach((key) => {
      const checkbox = document.querySelector(`.js-during-check[data-key="${key}"]`);
      if (checkbox) checkbox.checked = !!checks[key];
    });
    els.duringNotes.value = (data && data.notes) || '';
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
    loadDuringClassData(null);
    loadFeedbackData(null);
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
      // estándar de 7 bloques sin perder ningún trabajo real.
      if (hasNoRealBlockContent(getFlatFromContainers(blocksToLoad))) {
        blocksToLoad = defaultBlocks();
      }

      BlocksManager.loadBlocks(blocksToLoad);
      loadDuringClassData(plan.duringClass);
      loadFeedbackData(plan.feedback);
    } else {
      resetToEmptyPlan();
    }
    setSaveStatus('saved');
  }

  function buildPlanObject() {
    const blocks = BlocksManager.getAllBlocksData();
    const flatSubBlocks = BlocksManager.getFlatSubBlocksData();
    const duringClass = getDuringClassData();
    const feedback = getFeedbackData();
    return {
      id: planId,
      createdAt: planCreatedAt,
      courseName: els.courseName.value,
      startTime: els.startTime.value,
      blocks,
      duringClass,
      feedback,
      progress: calculateProgress(flatSubBlocks, duringClass, feedback),
    };
  }

  /** Calcula el % de diligenciamiento combinando las 3 secciones (uso interno, no se muestra en la UI). */
  function calculateProgress(subBlocks, duringClass, feedback) {
    let total = 0;
    let filled = 0;

    subBlocks.forEach((b) => {
      ['name', 'duration', 'activity', 'resources', 'responsible'].forEach((key) => {
        total++;
        if (b[key] && String(b[key]).trim()) filled++;
      });
    });

    DURING_CHECK_KEYS.forEach((key) => {
      total++;
      if (duringClass.checks[key]) filled++;
    });

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
      message: 'Se borrará toda la información de las 3 secciones (preparación, durante y después de la clase). Esta acción no se puede deshacer.',
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

  return {
    init,
    save,
    getCurrentPlanObject,
  };
})();

window.PlanForm = PlanForm;
