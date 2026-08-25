/**
 * blocks.js
 * Maneja la lista dinámica de "bloques" del Minuto a Minuto: crear, eliminar,
 * duplicar, reordenar (drag & drop) y recalcular las horas de inicio en cascada
 * a partir de la hora de inicio general y la duración de cada bloque.
 */

const BlocksManager = (() => {
  let listEl = null;
  let onChangeCallback = () => {};
  let dragSrcEl = null;
  let nextBlockSeq = 0;

  function init(containerEl, onChange) {
    listEl = containerEl;
    onChangeCallback = onChange || (() => {});
  }

  /** Opciones fijas del select de responsable, leídas del propio <template> para no duplicar la lista a mano. */
  function getFixedResponsibleOptions() {
    const tpl = document.getElementById('block-template');
    const select = tpl.content.querySelector('.js-block-responsible');
    return [...select.options].map((opt) => opt.value);
  }

  function createBlockElement(data = {}) {
    const tpl = document.getElementById('block-template');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.blockId = data.id || `block-${Date.now()}-${nextBlockSeq++}`;

    node.querySelector('.js-block-name').value = data.name || '';
    node.querySelector('.js-block-duration').value = data.duration || '00:05';
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

    // Eventos de edición -> notificar cambios; solo duración y hora de inicio
    // general afectan el cálculo de horas, así que solo esos recalculan.
    node.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('input', () => {
        onChangeCallback();
      });
    });
    node.querySelector('.js-block-duration').addEventListener('input', () => {
      recalculateStartTimes();
    });

    node.querySelector('.js-block-delete').addEventListener('click', () => removeBlock(node));
    node.querySelector('.js-block-duplicate').addEventListener('click', () => duplicateBlock(node));

    // Drag & drop para reordenar
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', (e) => {
      dragSrcEl = node;
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      dragSrcEl = null;
      renumberBlocks();
      recalculateStartTimes();
      onChangeCallback();
    });
    node.addEventListener('dragover', (e) => {
      if (!dragSrcEl) return;
      e.preventDefault();
      const after = getDragAfterElement(listEl, e.clientY);
      if (after == null) listEl.appendChild(dragSrcEl);
      else listEl.insertBefore(dragSrcEl, after);
    });

    return node;
  }

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.block-card:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  function addBlock(data = {}, options = {}) {
    const node = createBlockElement(data);
    listEl.appendChild(node);
    renumberBlocks();
    recalculateStartTimes();
    if (!options.silent) onChangeCallback();
    if (options.focus) {
      node.querySelector('.js-block-name').focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return node;
  }

  function removeBlock(node) {
    if (listEl.children.length <= 1) {
      Toast.warning('Debe haber al menos un bloque en la planeación.');
      return;
    }
    if (dragSrcEl === node) dragSrcEl = null;
    node.remove();
    renumberBlocks();
    recalculateStartTimes();
    onChangeCallback();
  }

  function duplicateBlock(node) {
    const data = extractBlockData(node);
    data.id = null;
    const clone = createBlockElement(data);
    node.after(clone);
    renumberBlocks();
    recalculateStartTimes();
    onChangeCallback();
  }

  function renumberBlocks() {
    [...listEl.querySelectorAll('.block-card')].forEach((node, i) => {
      node.querySelector('.block-number').textContent = String(i + 1);
    });
  }

  /** Recalcula la hora de inicio de cada bloque en cascada, sumando duraciones. */
  function recalculateStartTimes() {
    const startInput = document.getElementById('plan-start-time');
    const baseTime = startInput?.value || '08:00';
    let cursor = Utils.timeToMinutes(baseTime);

    const nodes = [...listEl.querySelectorAll('.block-card')];
    let totalMinutes = 0;

    nodes.forEach((node) => {
      const startField = node.querySelector('.js-block-start');
      startField.value = Utils.minutesToTime(cursor);
      const duration = node.querySelector('.js-block-duration').value || '00:00';
      const durMinutes = Utils.timeToMinutes(duration);
      cursor += durMinutes;
      totalMinutes += durMinutes;
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

  function extractBlockData(node) {
    const responsibleSelect = node.querySelector('.js-block-responsible').value;
    const responsibleOther = node.querySelector('.js-block-responsible-other').value.trim();
    const responsible = responsibleSelect === 'Otro' && responsibleOther ? responsibleOther : responsibleSelect;

    return {
      name: node.querySelector('.js-block-name').value,
      duration: node.querySelector('.js-block-duration').value,
      start: node.querySelector('.js-block-start').value,
      activity: node.querySelector('.js-block-activity').value,
      resources: node.querySelector('.js-block-resources').value,
      responsible,
    };
  }

  function getAllBlocksData() {
    return [...listEl.querySelectorAll('.block-card')].map(extractBlockData);
  }

  /** Vacía la lista. De uso interno (ver loadBlocks); no exportar sin repoblar de inmediato,
   *  ya que la app espera siempre al menos un bloque presente. */
  function clear() {
    dragSrcEl = null;
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

  return {
    init,
    addBlock,
    loadBlocks,
    getAllBlocksData,
    recalculateStartTimes,
  };
})();

window.BlocksManager = BlocksManager;
