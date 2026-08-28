/**
 * blocks.js
 * Maneja la jerarquía de dos niveles del Minuto a Minuto: "bloques"
 * contenedores colapsables (numerados "Bloque 1", "Bloque 2"...), cada uno
 * con una lista de "sub-bloques" (nombre, duración, actividad, recursos,
 * responsable). Crear, eliminar, duplicar y reordenar funcionan en ambos
 * niveles; la hora de inicio se calcula en cascada recorriendo todos los
 * sub-bloques de todos los bloques en orden de documento.
 */

const BlocksManager = (() => {
  let listEl = null;
  let onChangeCallback = () => {};
  let dragSrcContainerEl = null;
  let dragSrcSubEl = null;
  let nextBlockSeq = 0;

  function init(containerEl, onChange) {
    listEl = containerEl;
    onChangeCallback = onChange || (() => {});
    bindContainerDragOver();
  }

  /** Opciones fijas del select de responsable, leídas del propio <template> para no duplicar la lista a mano. */
  function getFixedResponsibleOptions() {
    const tpl = document.getElementById('sub-block-template');
    const select = tpl.content.querySelector('.js-block-responsible');
    return [...select.options].map((opt) => opt.value);
  }

  /** Encuentra el elemento después del cual debe insertarse el nodo arrastrado, según la posición Y del mouse. */
  function getDragAfterElement(container, y, selector) {
    const els = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  /* ---------------------------------------------------------------------
     Sub-bloques (fila con nombre, duración, actividad, recursos, responsable)
     --------------------------------------------------------------------- */

  function updateNameDisplay(nameDisplay, value) {
    nameDisplay.textContent = value.trim() || 'Sin nombre';
  }

  /** Muestra el input de nombre (oculta el texto fijo) y le da foco para editar. */
  function enterNameEditMode(subBlockNode) {
    const wrap = subBlockNode.querySelector('.js-name-display-wrap');
    wrap.classList.add('is-editing');
    const input = subBlockNode.querySelector('.js-block-name');
    input.hidden = false;
    input.focus();
    input.select();
  }

  /** Vuelve a mostrar el nombre como texto fijo, actualizado con lo escrito. */
  function exitNameEditMode(subBlockNode) {
    const wrap = subBlockNode.querySelector('.js-name-display-wrap');
    wrap.classList.remove('is-editing');
    const input = subBlockNode.querySelector('.js-block-name');
    const display = subBlockNode.querySelector('.js-name-display');
    input.hidden = true;
    updateNameDisplay(display, input.value);
  }

  function updateDurationDisplay(durationDisplay, minutes) {
    durationDisplay.textContent = `${minutes} min`;
  }

  /** Muestra el input de duración (oculta el texto fijo) y le da foco para editar. */
  function enterDurationEditMode(subBlockNode) {
    const wrap = subBlockNode.querySelector('.js-duration-display-wrap');
    wrap.classList.add('is-editing');
    const input = subBlockNode.querySelector('.js-block-duration-min');
    input.hidden = false;
    subBlockNode.querySelector('.duration-unit').hidden = false;
    input.focus();
    input.select();
  }

  /** Vuelve a mostrar la duración como texto fijo, actualizada con lo escrito. */
  function exitDurationEditMode(subBlockNode) {
    const wrap = subBlockNode.querySelector('.js-duration-display-wrap');
    wrap.classList.remove('is-editing');
    const input = subBlockNode.querySelector('.js-block-duration-min');
    const display = subBlockNode.querySelector('.js-duration-display');
    input.hidden = true;
    subBlockNode.querySelector('.duration-unit').hidden = true;
    updateDurationDisplay(display, input.value || 5);
  }

  function createSubBlockElement(data = {}) {
    const tpl = document.getElementById('sub-block-template');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.subBlockId = data.id || `sub-${Date.now()}-${nextBlockSeq++}`;

    // Nombre: se muestra como texto fijo (no editable a simple vista); un
    // botón de lápiz lo convierte en campo de texto temporalmente.
    const nameInput = node.querySelector('.js-block-name');
    const nameDisplay = node.querySelector('.js-name-display');
    const nameEditBtn = node.querySelector('.js-name-edit');
    nameInput.value = data.name || '';
    updateNameDisplay(nameDisplay, nameInput.value);
    nameEditBtn.addEventListener('click', () => enterNameEditMode(node));
    nameInput.addEventListener('blur', () => exitNameEditMode(node));
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
    });

    // Duración: se muestra como texto fijo ("N min"), igual que el nombre;
    // un botón de lápiz la convierte en campo numérico temporalmente. El
    // profesor solo escribe un número de minutos; internamente se sigue
    // guardando/calculando como "HH:MM" para no tocar el resto de la
    // lógica de horas ni el formato exportado.
    const durationMinInput = node.querySelector('.js-block-duration-min');
    const durationDisplay = node.querySelector('.js-duration-display');
    const durationEditBtn = node.querySelector('.js-duration-edit');
    const parsedDuration = data.duration ? Utils.timeToMinutes(data.duration) : null;
    durationMinInput.value = parsedDuration !== null && parsedDuration !== undefined ? parsedDuration : 5;
    updateDurationDisplay(durationDisplay, durationMinInput.value);
    durationEditBtn.addEventListener('click', () => enterDurationEditMode(node));
    durationMinInput.addEventListener('blur', () => exitDurationEditMode(node));
    durationMinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); durationMinInput.blur(); }
    });
    durationMinInput.addEventListener('input', () => {
      updateDurationDisplay(durationDisplay, durationMinInput.value || 0);
    });

    node.querySelector('.js-block-start').value = data.start || '';
    node.querySelector('.js-block-activity').value = data.activity || '';
    node.querySelector('.js-block-resources').value = data.resources || '';

    const responsibleSelect = node.querySelector('.js-block-responsible');
    const responsibleOther = node.querySelector('.js-block-responsible-other');
    const savedResponsible = data.responsible || '';
    if (savedResponsible && !getFixedResponsibleOptions().includes(savedResponsible)) {
      // El valor guardado es texto libre (se escribió un nombre propio en "Otro")
      responsibleSelect.value = 'Otro';
      responsibleOther.value = savedResponsible;
      responsibleOther.hidden = false;
    } else {
      responsibleSelect.value = savedResponsible;
      responsibleOther.hidden = savedResponsible !== 'Otro';
    }

    responsibleSelect.addEventListener('change', () => {
      responsibleOther.hidden = responsibleSelect.value !== 'Otro';
      if (responsibleOther.hidden) {
        responsibleOther.value = '';
      } else {
        responsibleOther.focus();
      }
    });

    // Eventos de edición -> notificar cambios; solo duración afecta el cálculo de horas.
    node.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('input', () => {
        onChangeCallback();
      });
    });
    durationMinInput.addEventListener('input', () => {
      recalculateStartTimes();
    });

    node.querySelector('.js-sub-block-delete').addEventListener('click', () => removeSubBlock(node));
    node.querySelector('.js-sub-block-duplicate').addEventListener('click', () => duplicateSubBlock(node));

    // Drag & drop, confinado a la lista de sub-bloques del contenedor padre.
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', (e) => {
      e.stopPropagation(); // no debe iniciar también el drag del bloque contenedor
      dragSrcSubEl = node;
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.dataset.subBlockId);
    });
    node.addEventListener('dragend', (e) => {
      e.stopPropagation();
      node.classList.remove('dragging');
      dragSrcSubEl = null;
      renumberBlocks();
      recalculateStartTimes();
      onChangeCallback();
    });
    node.addEventListener('dragover', (e) => {
      if (!dragSrcSubEl) return;
      const subList = node.closest('.js-sub-blocks-list');
      if (!subList || !subList.contains(dragSrcSubEl)) return; // nunca mezclar sub-bloques entre bloques distintos
      e.preventDefault();
      e.stopPropagation();
      const after = getDragAfterElement(subList, e.clientY, '.sub-block-card');
      if (after == null) subList.appendChild(dragSrcSubEl);
      else subList.insertBefore(dragSrcSubEl, after);
    });

    return node;
  }

  function addSubBlock(containerNode, data = {}, options = {}) {
    const subList = containerNode.querySelector('.js-sub-blocks-list');
    const node = createSubBlockElement(data);
    subList.appendChild(node);
    recalculateStartTimes();
    if (!options.silent) onChangeCallback();
    if (options.focus) {
      node.querySelector('.js-block-name').focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return node;
  }

  function removeSubBlock(node) {
    const subList = node.closest('.js-sub-blocks-list');
    if (subList.children.length <= 1) {
      Toast.warning('Debe haber al menos un sub-bloque en este bloque.');
      return;
    }
    if (dragSrcSubEl === node) dragSrcSubEl = null;
    node.remove();
    recalculateStartTimes();
    onChangeCallback();
  }

  function duplicateSubBlock(node) {
    const data = extractSubBlockData(node);
    data.id = null;
    const clone = createSubBlockElement(data);
    node.after(clone);
    recalculateStartTimes();
    onChangeCallback();
  }

  function extractSubBlockData(node) {
    const responsibleSelect = node.querySelector('.js-block-responsible').value;
    const responsibleOther = node.querySelector('.js-block-responsible-other').value.trim();
    const responsible = responsibleSelect === 'Otro' && responsibleOther ? responsibleOther : responsibleSelect;
    const minutes = Utils.clamp(parseInt(node.querySelector('.js-block-duration-min').value, 10) || 0, 0, 480);

    return {
      name: node.querySelector('.js-block-name').value,
      duration: Utils.minutesToTime(minutes),
      start: node.querySelector('.js-block-start').value,
      activity: node.querySelector('.js-block-activity').value,
      resources: node.querySelector('.js-block-resources').value,
      responsible,
    };
  }

  /* ---------------------------------------------------------------------
     Bloques contenedores (colapsables, agrupan sub-bloques)
     --------------------------------------------------------------------- */

  /** Muestra la nota del bloque como texto fijo, actualizada con lo escrito. */
  function updateNoteDisplay(noteDisplay, value) {
    noteDisplay.textContent = value.trim();
  }

  function enterNoteEditMode(containerNode) {
    const wrap = containerNode.querySelector('.js-block-note-wrap');
    wrap.classList.add('is-editing');
    const input = containerNode.querySelector('.js-block-note-input');
    input.hidden = false;
    input.focus();
  }

  function exitNoteEditMode(containerNode) {
    const wrap = containerNode.querySelector('.js-block-note-wrap');
    wrap.classList.remove('is-editing');
    const input = containerNode.querySelector('.js-block-note-input');
    const display = containerNode.querySelector('.js-block-note-display');
    input.hidden = true;
    updateNoteDisplay(display, input.value);
  }

  /** Configura el bloque de nota opcional de un contenedor (texto-fijo+lápiz, o botón "Agregar nota" si aún no tiene). */
  function setupBlockNote(node, data) {
    const noteSection = node.querySelector('.js-block-note-section');
    const noteWrap = node.querySelector('.js-block-note-wrap');
    const noteInput = node.querySelector('.js-block-note-input');
    const noteDisplay = node.querySelector('.js-block-note-display');
    const noteEditBtn = node.querySelector('.js-block-note-edit');
    const addNoteBtn = node.querySelector('.js-add-block-note');

    const hasNote = !!(data.note && data.note.trim());
    noteInput.value = data.note || '';
    updateNoteDisplay(noteDisplay, noteInput.value);
    noteSection.hidden = !hasNote;
    addNoteBtn.hidden = hasNote;

    noteEditBtn.addEventListener('click', () => enterNoteEditMode(node));
    noteInput.addEventListener('blur', () => exitNoteEditMode(node));
    noteInput.addEventListener('input', () => onChangeCallback());
    addNoteBtn.addEventListener('click', () => {
      addNoteBtn.hidden = true;
      noteSection.hidden = false;
      enterNoteEditMode(node);
    });
  }

  function createBlockContainer(data = {}) {
    const tpl = document.getElementById('block-template');
    const node = tpl.content.firstElementChild.cloneNode(true);
    const blockId = data.id || `block-${Date.now()}-${nextBlockSeq++}`;
    node.dataset.blockId = blockId;

    const subList = node.querySelector('.js-sub-blocks-list');
    subList.id = `sub-list-${blockId}`;
    const toggle = node.querySelector('.js-block-toggle');
    toggle.setAttribute('aria-controls', subList.id);

    const subBlocksData = (data.subBlocks && data.subBlocks.length) ? data.subBlocks : [{}];
    subBlocksData.forEach((sb) => subList.appendChild(createSubBlockElement(sb)));

    setupBlockNote(node, data);

    toggle.addEventListener('click', () => {
      const isOpen = subList.hidden;
      subList.hidden = !isOpen;
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    node.querySelector('.js-block-delete').addEventListener('click', () => removeBlock(node));
    node.querySelector('.js-block-duplicate').addEventListener('click', () => duplicateBlock(node));
    node.querySelector('.js-add-sub-block').addEventListener('click', () => addSubBlock(node, {}, { focus: true }));

    // Drag & drop de bloques completos: solo se activa arrastrando desde el
    // handle. En "dragstart" el navegador reporta como e.target el propio
    // elemento draggable (node), no el hijo bajo el cursor, así que hay que
    // rastrear el mousedown sobre el handle por separado.
    let dragStartedFromHandle = false;
    node.querySelector('.block-container-drag').addEventListener('mousedown', () => {
      dragStartedFromHandle = true;
    });
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', (e) => {
      if (!dragStartedFromHandle) {
        e.preventDefault();
        return;
      }
      dragSrcContainerEl = node;
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', blockId);
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      dragSrcContainerEl = null;
      dragStartedFromHandle = false;
      renumberBlocks();
      recalculateStartTimes();
      onChangeCallback();
    });

    return node;
  }

  // "dragover" de bloques contenedores se maneja por delegación en `listEl`
  // (una sola vez, en init) en vez de un listener por instancia: así el
  // evento se resuelve aunque el cursor pase sobre sub-bloques u otros
  // elementos anidados con su propio "draggable" en el camino, que de otro
  // modo pueden interceptar el evento antes de que llegue al contenedor.
  function bindContainerDragOver() {
    listEl.addEventListener('dragover', (e) => {
      if (!dragSrcContainerEl) return;
      e.preventDefault();
      const after = getDragAfterElement(listEl, e.clientY, '.block-container');
      if (after == null) listEl.appendChild(dragSrcContainerEl);
      else listEl.insertBefore(dragSrcContainerEl, after);
    });
  }

  function addBlock(data = {}, options = {}) {
    const node = createBlockContainer(data);
    listEl.appendChild(node);
    renumberBlocks();
    recalculateStartTimes();
    if (!options.silent) onChangeCallback();
    if (options.focus) {
      node.querySelector('.sub-block-card .js-block-name')?.focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return node;
  }

  function removeBlock(node) {
    if (listEl.children.length <= 1) {
      Toast.warning('Debe haber al menos un bloque en la planeación.');
      return;
    }
    if (dragSrcContainerEl === node) dragSrcContainerEl = null;
    if (dragSrcSubEl && node.contains(dragSrcSubEl)) dragSrcSubEl = null;
    node.remove();
    renumberBlocks();
    recalculateStartTimes();
    onChangeCallback();
  }

  function duplicateBlock(node) {
    const data = extractContainerData(node);
    data.id = null;
    data.subBlocks.forEach((sb) => { sb.id = null; });
    const clone = createBlockContainer(data);
    node.after(clone);
    renumberBlocks();
    recalculateStartTimes();
    onChangeCallback();
  }

  /** Nombres fijos de los 3 bloques prediseñados del Minuto a Minuto (ver defaultBlocks en planForm.js). */
  const BLOCK_TITLES = ['Introducción', 'Desarrollo del tema', 'Preguntas'];

  /**
   * Aclaración fija bajo el nombre del último sub-bloque del bloque 3
   * ("Preguntas e inquietudes") — se aplica por posición, no se guarda en
   * Storage, para que siga apareciendo aunque el plan ya esté guardado
   * (igual criterio que BLOCK_TITLES).
   */
  const LAST_SUB_BLOCK_HINT = { containerIndex: 2, text: 'Sobre la clase y sobre el Campus' };

  /** Numera cada bloque contenedor ("Bloque 1 - Introducción", "Bloque 2 - Desarrollo del tema"...) según su posición en el documento. */
  function renumberBlocks() {
    const containers = [...listEl.querySelectorAll('.block-container')];
    containers.forEach((node, i) => {
      node.querySelector('.block-number').textContent = String(i + 1);
      const title = BLOCK_TITLES[i] ? `Bloque ${i + 1} - ${BLOCK_TITLES[i]}` : `Bloque ${i + 1}`;
      node.querySelector('.block-container-title').textContent = title;
    });

    const hintContainer = containers[LAST_SUB_BLOCK_HINT.containerIndex];
    const hintSubBlock = hintContainer?.querySelectorAll('.sub-block-card')[0];
    const hintEl = hintSubBlock?.querySelector('.js-name-hint');
    if (hintEl) {
      hintEl.textContent = LAST_SUB_BLOCK_HINT.text;
      hintEl.hidden = false;
    }
  }

  /**
   * Recalcula la hora de inicio de cada sub-bloque en cascada: el cursor de
   * minutos avanza recorriendo todos los sub-bloques de todos los bloques
   * contenedores, en orden de documento (bloque 1 → sus sub-bloques → bloque
   * 2 → ...). También actualiza la duración calculada de cada contenedor y
   * el total general de la clase.
   */
  function recalculateStartTimes() {
    const startInput = document.getElementById('plan-start-time');
    const baseTime = startInput?.value || '08:00';
    let cursor = Utils.timeToMinutes(baseTime);
    let totalMinutes = 0;

    const containers = [...listEl.querySelectorAll('.block-container')];
    containers.forEach((container) => {
      const subNodes = [...container.querySelectorAll('.sub-block-card')];
      let containerMinutes = 0;

      subNodes.forEach((sub) => {
        sub.querySelector('.js-block-start').value = Utils.minutesToTime(cursor);
        const durMinutes = Utils.clamp(parseInt(sub.querySelector('.js-block-duration-min').value, 10) || 0, 0, 480);
        cursor += durMinutes;
        containerMinutes += durMinutes;
      });

      totalMinutes += containerMinutes;
      const durationLabel = container.querySelector('.js-block-container-duration');
      if (durationLabel) durationLabel.textContent = formatTotalDuration(containerMinutes) || '0 min';
    });

    const totalField = document.getElementById('plan-duration-total');
    if (totalField) totalField.value = formatTotalDuration(totalMinutes);
  }

  function formatTotalDuration(totalMinutes) {
    if (totalMinutes <= 0) return '';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

  function extractContainerData(node) {
    return {
      id: node.dataset.blockId,
      subBlocks: [...node.querySelectorAll('.sub-block-card')].map(extractSubBlockData),
      note: node.querySelector('.js-block-note-input')?.value || '',
    };
  }

  function getAllBlocksData() {
    return [...listEl.querySelectorAll('.block-container')].map(extractContainerData);
  }

  /** Lista aplanada de todos los sub-bloques de todos los bloques, en orden — para exportadores y cálculo de progreso. */
  function getFlatSubBlocksData() {
    return getAllBlocksData().flatMap((c) => c.subBlocks);
  }

  /** Vacía la lista. De uso interno (ver loadBlocks); no exportar sin repoblar de inmediato,
   *  ya que la app espera siempre al menos un bloque presente. */
  function clear() {
    dragSrcContainerEl = null;
    dragSrcSubEl = null;
    listEl.innerHTML = '';
  }

  function loadBlocks(blocksArray) {
    clear();
    if (!blocksArray || blocksArray.length === 0) {
      addBlock({}, { silent: true });
    } else {
      blocksArray.forEach((b) => addBlock(b, { silent: true }));
    }
    recalculateStartTimes();
  }

  /**
   * Bloquea o desbloquea la edición de todo el Minuto a Minuto (usado tras
   * enviar la planeación). Los campos y los botones de agregar/eliminar/
   * duplicar se desactivan, igual que el drag & drop; el botón de
   * expandir/colapsar cada bloque (`.js-block-toggle`) se deja siempre
   * activo para poder seguir consultando el contenido ya enviado.
   */
  function setLocked(locked) {
    listEl.querySelectorAll('input, textarea, select').forEach((el) => {
      el.disabled = locked;
    });
    listEl.querySelectorAll('button:not(.js-block-toggle)').forEach((el) => {
      el.disabled = locked;
    });
    listEl.querySelectorAll('.block-container, .sub-block-card').forEach((el) => {
      el.setAttribute('draggable', String(!locked));
    });
  }

  return {
    init,
    addBlock,
    loadBlocks,
    getAllBlocksData,
    getFlatSubBlocksData,
    recalculateStartTimes,
    setLocked,
  };
})();

window.BlocksManager = BlocksManager;
