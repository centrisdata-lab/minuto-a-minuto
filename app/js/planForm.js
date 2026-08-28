/**
 * planForm.js
 * Controla el editor del Minuto a Minuto (Preparación + Recomendaciones
 * generales + Retroalimentación): carga de datos y autoguardado local.
 * Solo existe una planeación activa por navegador (ver storage.js). El
 * curso/grupo/horario se elige una sola vez, al inicio (initGroupPicker),
 * visible en ambos modos. Además de "Descargar PDF" (PDF), "Enviar" registra
 * el envío en la base de datos central (ver submissionsApi.js) que lee el
 * panel admin — pide nombre + rol justo antes de enviar (teacherIdentity.js).
 */

const PlanForm = (() => {
  let planId = null;
  let planCreatedAt = null;
  let els = {};
  let currentMode = null; // 'plan' | 'feedback' | null (pantalla de selección)
  let selectedGroup = null; // { course, group, courseCode, schedule } elegido en el selector de grupo
  const debouncedSave = Utils.debounce(() => save(), 600);

  const FEEDBACK_QUESTIONS = ['onTime', 'dua', 'topics'];

  function cacheEls() {
    els = {
      form: document.getElementById('plan-form'),
      courseSearch: document.getElementById('course-search'),
      courseResults: document.getElementById('course-results'),
      groupSearch: document.getElementById('group-search'),
      groupResults: document.getElementById('group-results'),
      startTime: document.getElementById('plan-start-time'),
      startTimeHour: document.getElementById('start-time-hour'),
      startTimeMinute: document.getElementById('start-time-minute'),
      startTimeAm: document.getElementById('start-time-am'),
      startTimePm: document.getElementById('start-time-pm'),
      saveStatus: document.getElementById('save-status'),
      recommendationsList: document.getElementById('recommendations-list'),
      feedbackImprove: document.getElementById('feedback-improve'),
      btnSubmitPlan: document.getElementById('btn-submit-plan'),
      btnSubmitFeedback: document.getElementById('btn-submit-feedback'),
      modeSelect: document.getElementById('mode-select'),
      modeActive: document.getElementById('mode-active'),
      btnModePlan: document.getElementById('btn-mode-plan'),
      btnModeFeedback: document.getElementById('btn-mode-feedback'),
      btnBackToModeSelect: document.getElementById('btn-back-to-mode-select'),
      cardPrep: document.getElementById('card-prep'),
      cardRecommendations: document.getElementById('card-recommendations'),
      cardFeedback: document.getElementById('card-feedback'),
    };
  }

  /**
   * Muestra el modo elegido ('plan' o 'feedback') y oculta la pantalla de
   * selección; `null` vuelve a la pantalla de selección. Ambos modos
   * comparten el mismo formulario montado en el DOM (nunca se destruye),
   * solo se alternan las cards y botones de envío visibles con `hidden`.
   */
  function setMode(mode) {
    currentMode = mode;
    els.modeSelect.hidden = !!mode;
    els.modeActive.hidden = !mode;
    if (!mode) return;

    const isPlan = mode === 'plan';
    els.cardPrep.hidden = !isPlan;
    els.cardRecommendations.hidden = !isPlan;
    els.cardFeedback.hidden = isPlan;
    els.btnSubmitPlan.hidden = !isPlan;
    els.btnSubmitFeedback.hidden = isPlan;
  }

  function init() {
    cacheEls();
    BlocksManager.init(document.getElementById('blocks-list'), () => {
      debouncedSave();
    });

    initGroupPicker();

    els.startTime.addEventListener('input', () => {
      BlocksManager.recalculateStartTimes();
      debouncedSave();
    });
    initStartTimePicker();

    els.btnSubmitPlan.addEventListener('click', handleSubmitPlan);
    els.btnSubmitFeedback.addEventListener('click', handleSubmitFeedback);
    els.btnModePlan.addEventListener('click', () => setMode('plan'));
    els.btnModeFeedback.addEventListener('click', () => setMode('feedback'));
    els.btnBackToModeSelect.addEventListener('click', () => setMode(null));

    initCollapsibleSections();
    initRecommendationsSection();
    initFeedbackSection();

    loadOrCreate();
    setMode(null);
  }

  /* ---------------------------------------------------------------------
     Selector de "Curso, grupo y horario" en 2 pasos: primero se elige el
     curso (buscador sobre los nombres únicos de GROUPS_DATA), y solo
     entonces se habilita el buscador de grupo, ya filtrado a los grupos de
     ese curso — más fácil de encontrar que buscar entre los 91 grupos a la
     vez. Visible en ambos modos (Minuto a Minuto y Retroalimentación); se
     elige una sola vez y el modal de envío (teacherIdentity.js) ya no lo
     vuelve a preguntar.
     --------------------------------------------------------------------- */
  let selectedCourseName = null;

  function groupMatchLabel(g) {
    return `${g.group} — ${g.schedule}`;
  }

  function renderCourseResults(query) {
    const courseNames = [...new Set(GROUPS_DATA.map((g) => g.course))].sort((a, b) => a.localeCompare(b, 'es'));
    const q = query.trim().toLowerCase();
    const filtered = !q ? courseNames : courseNames.filter((c) => c.toLowerCase().includes(q));
    if (filtered.length === 0) {
      els.courseResults.innerHTML = '<div class="identity-group-empty">Sin resultados. Intenta con otro nombre.</div>';
    } else {
      els.courseResults.innerHTML = filtered.map((c) => `
        <button type="button" class="identity-group-item" data-course="${Utils.escapeHtml(c)}">
          <span class="identity-group-course">${Utils.escapeHtml(c)}</span>
        </button>
      `).join('');
    }
    els.courseResults.hidden = false;
  }

  function renderGroupResults(query) {
    const groupsInCourse = GROUPS_DATA.filter((g) => g.course === selectedCourseName);
    const q = query.trim().toLowerCase();
    const filtered = !q ? groupsInCourse : groupsInCourse.filter((g) => groupMatchLabel(g).toLowerCase().includes(q));
    if (filtered.length === 0) {
      els.groupResults.innerHTML = '<div class="identity-group-empty">Sin resultados para este curso.</div>';
    } else {
      els.groupResults.innerHTML = filtered.map((g) => `
        <button type="button" class="identity-group-item" data-group="${g.group}">
          <span class="identity-group-course">${Utils.escapeHtml(g.group)}</span>
          <span class="identity-group-meta">${Utils.escapeHtml(g.schedule)}</span>
        </button>
      `).join('');
    }
    els.groupResults.hidden = false;
  }

  /** Elige el curso del paso 1: habilita el buscador de grupo y limpia cualquier grupo ya elegido de un curso distinto. */
  function selectCourse(courseName, { silent = false } = {}) {
    selectedCourseName = courseName || null;
    els.courseSearch.value = selectedCourseName || '';
    if (selectedGroup && selectedGroup.course !== selectedCourseName) {
      selectGroup(null, { silent: true });
    }
    els.groupSearch.disabled = !selectedCourseName;
    els.groupSearch.placeholder = selectedCourseName ? 'Busca por grupo u horario...' : 'Elige primero un curso...';
    if (!silent) {
      els.courseResults.hidden = true;
      els.groupSearch.value = '';
      if (selectedCourseName) els.groupSearch.focus();
      debouncedSave();
    }
  }

  /** Selecciona (o limpia, si `groupCode` es null) el grupo activo. `silent` evita cerrar el buscador ni autoguardar (usado al restaurar desde Storage). */
  function selectGroup(groupCode, { silent = false } = {}) {
    selectedGroup = GROUPS_DATA.find((g) => g.group === groupCode) || null;
    // El propio input queda mostrando el grupo elegido (igual que el campo
    // de curso) — antes se limpiaba y solo se veía en el texto azul de
    // abajo, dando la falsa impresión de que no se había seleccionado nada.
    els.groupSearch.value = selectedGroup ? `${selectedGroup.group} — ${selectedGroup.schedule}` : '';
    if (!silent) {
      els.groupResults.hidden = true;
      debouncedSave();
    }
  }

  function initGroupPicker() {
    if (typeof GROUPS_DATA === 'undefined') return; // groupsData.js no cargado, degrada a selector inactivo

    // Al enfocar un campo que ya tiene un valor elegido, se selecciona todo
    // el texto (como cualquier selector "escribe para cambiar") en vez de
    // filtrar por ese mismo valor puesto — así se ve la lista completa de
    // nuevo y basta con escribir para reemplazarlo.
    els.courseSearch.addEventListener('focus', () => { els.courseSearch.select(); renderCourseResults(''); });
    els.courseSearch.addEventListener('input', () => renderCourseResults(els.courseSearch.value));
    els.courseResults.addEventListener('click', (e) => {
      const item = e.target.closest('.identity-group-item');
      if (!item) return;
      selectCourse(item.dataset.course);
    });

    els.groupSearch.addEventListener('focus', () => {
      if (!selectedCourseName) return;
      els.groupSearch.select();
      renderGroupResults('');
    });
    els.groupSearch.addEventListener('input', () => renderGroupResults(els.groupSearch.value));
    els.groupResults.addEventListener('click', (e) => {
      const item = e.target.closest('.identity-group-item');
      if (!item) return;
      selectGroup(item.dataset.group);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.identity-group-field')) {
        els.courseResults.hidden = true;
        els.groupResults.hidden = true;
      }
    });
  }

  /* ---------------------------------------------------------------------
     Selector de hora de inicio: 3 controles simples (hora 1-12, minutos,
     AM/PM) en vez del <input type="time"> nativo, cuyo formato 12h/24h
     depende de la configuración del navegador/sistema de cada profesor.
     Los 3 controles solo actualizan un <input type="hidden"> con el valor
     real en formato "HH:MM" (24h) — el mismo que ya leen blocks.js y el
     resto de la app — para no tocar la lógica de cálculo de horas.
     --------------------------------------------------------------------- */
  function initStartTimePicker() {
    const updateFromPicker = () => {
      let hour = parseInt(els.startTimeHour.value, 10);
      const minute = els.startTimeMinute.value;
      const isPm = els.startTimePm.classList.contains('active');
      if (isPm && hour !== 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      els.startTime.value = `${String(hour).padStart(2, '0')}:${minute}`;
      els.startTime.dispatchEvent(new Event('input', { bubbles: true }));
    };

    els.startTimeHour.addEventListener('change', updateFromPicker);
    els.startTimeMinute.addEventListener('change', updateFromPicker);
    [els.startTimeAm, els.startTimePm].forEach((btn) => {
      btn.addEventListener('click', () => {
        els.startTimeAm.classList.toggle('active', btn === els.startTimeAm);
        els.startTimePm.classList.toggle('active', btn === els.startTimePm);
        updateFromPicker();
      });
    });
  }

  /**
   * Refleja en los 3 controles (hora/minutos/AM-PM) el valor 24h ya
   * guardado en el hidden input — usado al cargar un plan existente. Los
   * minutos se redondean al múltiplo de 5 más cercano porque el <select>
   * solo ofrece esos pasos (un plan guardado antes de este selector podía
   * tener cualquier minuto).
   */
  function syncStartTimePickerFromValue() {
    const [h, m] = (els.startTime.value || '09:00').split(':').map(Number);
    const isPm = h >= 12;
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    const roundedMinute = Math.round((m || 0) / 5) * 5 % 60;
    els.startTimeHour.value = String(hour12);
    els.startTimeMinute.value = String(roundedMinute).padStart(2, '0');
    els.startTimeAm.classList.toggle('active', !isPm);
    els.startTimePm.classList.toggle('active', isPm);
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
     Sección "Recomendaciones generales" — lista fija, no editable, parte
     del "antes". Se muestra como viñetas y se incluye igual en el PDF y
     en el envío a la base de datos.
     --------------------------------------------------------------------- */
  const RECOMMENDATIONS_LIST = [
    'Conectarse mínimo 15 minutos antes de iniciar la clase.',
    'Probar cámara y audio (micrófono y parlantes).',
    'Revisar encuadre: buena iluminación y postura frente a la cámara.',
    'Verificar fondo virtual del Campus que se vea correctamente.',
    'Tener listos y abiertos los recursos (diapositivas, links, Padlet, etc.).',
    'Verificar conexión a internet estable.',
  ];

  function initRecommendationsSection() {
    els.recommendationsList.innerHTML = RECOMMENDATIONS_LIST
      .map((item) => `<li>${Utils.escapeHtml(item)}</li>`)
      .join('');
  }

  function getRecommendationsData() {
    return { notes: RECOMMENDATIONS_LIST.join('\n') };
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
    selectCourse(null, { silent: true });
    selectGroup(null, { silent: true });
    els.startTime.value = '09:00';
    syncStartTimePickerFromValue();
    BlocksManager.loadBlocks(defaultBlocks());
    loadFeedbackData(null);
  }

  function loadOrCreate() {
    const plan = Storage.getActivePlan();
    if (plan) {
      planId = plan.id;
      planCreatedAt = plan.createdAt || null;
      selectCourse(plan.courseLabel || null, { silent: true });
      selectGroup(plan.groupCode || null, { silent: true });
      els.startTime.value = plan.startTime || '09:00';
      syncStartTimePickerFromValue();

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
      loadFeedbackData(plan.feedback);
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
      courseLabel: selectedGroup ? selectedGroup.course : '',
      groupCode: selectedGroup ? selectedGroup.group : '',
      schedule: selectedGroup ? selectedGroup.schedule : '',
      startTime: els.startTime.value,
      blocks,
      recommendations,
      feedback,
      progress: calculateProgress(flatSubBlocks, recommendations, feedback),
    };
  }

  /** Calcula el % de diligenciamiento combinando las 3 secciones (uso interno, no se muestra en la UI). */
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

  function getCurrentPlanObject() {
    return buildPlanObject();
  }

  /**
   * Un solo botón hace las dos cosas: descarga el PDF del Minuto a Minuto
   * (siempre funciona, es local) y lo envía a la base de datos central
   * (Supabase) para que el panel admin lo vea. Pide nombre + rol justo
   * antes de enviar (no bloquea la app al cargar la página) — el grupo ya
   * se eligió antes, en el selector de curso/grupo/horario. Cada clic
   * crea un registro nuevo — no sobrescribe envíos anteriores, así que el
   * profesor puede reenviar tantas veces como quiera (por ejemplo, tras
   * corregir algo) y el admin ve el historial completo. Si el envío a la
   * base de datos falla (sin red, etc.) el PDF ya se descargó igual — no
   * se pierde nada, solo no queda registrado hasta reintentar.
   */
  /** Lleva el foco al campo que falta completar del selector de curso/grupo. */
  function focusMissingGroupField() {
    Toast.warning('Selecciona tu curso, grupo y horario antes de enviar.');
    (selectedCourseName ? els.groupSearch : els.courseSearch).focus();
  }

  async function handleSubmitPlan() {
    if (!selectedGroup) {
      focusMissingGroupField();
      return;
    }

    const identity = await TeacherIdentity.askIdentity();
    if (!identity) return; // el profesor canceló el modal de identidad

    els.btnSubmitPlan.disabled = true;
    const originalLabel = els.btnSubmitPlan.innerHTML;
    els.btnSubmitPlan.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    save();
    const currentPlan = buildPlanObject();
    Exporters.exportPdf(currentPlan); // el PDF sí lleva recomendaciones (se comparte con el equipo)

    // Al panel admin solo se envía el Minuto a Minuto (sin recomendaciones):
    // las recomendaciones son fijas y no aportan nada distinto por profesor.
    const { recommendations, ...planForAdmin } = currentPlan;

    try {
      await SubmissionsApi.submitPlan({
        teacherName: identity.name,
        teacherRole: identity.role,
        groupCode: selectedGroup.group,
        courseLabel: selectedGroup.course,
        schedule: selectedGroup.schedule,
        plan: planForAdmin,
      });
      Toast.success('PDF descargado y Minuto a Minuto enviado correctamente.');
    } catch (e) {
      console.error('No se pudo enviar el Minuto a Minuto.', e);
      Toast.warning('Se descargó el PDF, pero no se pudo enviar (revisa tu conexión). Tu planeación sigue guardada en este navegador; puedes intentar de nuevo.');
    } finally {
      els.btnSubmitPlan.innerHTML = originalLabel;
      els.btnSubmitPlan.disabled = false;
    }
  }

  /**
   * Envío de la retroalimentación ("después de la clase"), como registro
   * separado del Minuto a Minuto — se diligencia en otro momento, por eso
   * vuelve a pedir identidad. El panel admin los combina como un solo
   * informe cuando comparten profesor + grupo (ver adminPanel.js).
   */
  async function handleSubmitFeedback() {
    if (!selectedGroup) {
      focusMissingGroupField();
      return;
    }

    const feedbackData = getFeedbackData();
    const hasAnyAnswer = FEEDBACK_QUESTIONS.some((q) => feedbackData.answers[q].value);
    if (!hasAnyAnswer) {
      Toast.warning('Responde al menos una pregunta antes de enviar la retroalimentación.');
      return;
    }

    const identity = await TeacherIdentity.askIdentity();
    if (!identity) return; // el profesor canceló el modal de identidad

    els.btnSubmitFeedback.disabled = true;
    const originalLabel = els.btnSubmitFeedback.innerHTML;
    els.btnSubmitFeedback.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    save();
    const currentPlan = buildPlanObject();

    try {
      await SubmissionsApi.submitFeedback({
        teacherName: identity.name,
        teacherRole: identity.role,
        groupCode: selectedGroup.group,
        courseLabel: selectedGroup.course,
        schedule: selectedGroup.schedule,
        plan: {
          id: currentPlan.id,
          createdAt: currentPlan.createdAt,
          courseLabel: currentPlan.courseLabel,
          startTime: currentPlan.startTime,
          feedback: currentPlan.feedback,
        },
      });
      Toast.success('Retroalimentación enviada correctamente.');
    } catch (e) {
      console.error('No se pudo enviar la retroalimentación.', e);
      Toast.warning('No se pudo enviar (revisa tu conexión). Tu retroalimentación sigue guardada en este navegador; puedes intentar de nuevo.');
    } finally {
      els.btnSubmitFeedback.innerHTML = originalLabel;
      els.btnSubmitFeedback.disabled = false;
    }
  }

  return {
    init,
    save,
    getCurrentPlanObject,
  };
})();

window.PlanForm = PlanForm;
