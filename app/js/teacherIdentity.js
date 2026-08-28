/**
 * teacherIdentity.js
 * Pide nombre + grupo (buscador sobre GROUPS_DATA, ver groupsData.js) solo
 * en el momento en que el profesor hace clic en "Enviar Minuto a Minuto" —
 * a diferencia de una versión anterior de este módulo, no bloquea la app al
 * cargar la página. `askIdentity()` devuelve una Promise que resuelve con
 * { name, group, courseCode, courseLabel, schedule } al confirmar, o null
 * si el profesor cancela.
 */

const TeacherIdentity = (() => {
  let els = {};
  let selectedGroup = null;
  let resolveCurrent = null;

  function cacheEls() {
    els = {
      overlay: document.getElementById('identity-modal'),
      form: document.getElementById('identity-form'),
      nameInput: document.getElementById('identity-name'),
      searchInput: document.getElementById('identity-group-search'),
      resultsList: document.getElementById('identity-group-results'),
      selectedLabel: document.getElementById('identity-group-selected'),
      errorEl: document.getElementById('identity-error'),
      cancelBtn: document.getElementById('identity-cancel'),
    };
  }

  function init() {
    cacheEls();

    els.searchInput.addEventListener('input', () => renderResults(els.searchInput.value));
    els.searchInput.addEventListener('focus', () => renderResults(els.searchInput.value));
    els.resultsList.addEventListener('click', (e) => {
      const item = e.target.closest('.identity-group-item');
      if (!item) return;
      selectGroup(item.dataset.group);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.identity-group-field')) els.resultsList.hidden = true;
    });

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
      els.searchInput.value = '';
      selectGroup(null, { silent: true });
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

  function matchLabel(g) {
    return `${g.course} — ${g.group} — ${g.schedule}`;
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    const filteredGroups = !q
      ? GROUPS_DATA
      : GROUPS_DATA.filter((g) => matchLabel(g).toLowerCase().includes(q));

    if (filteredGroups.length === 0) {
      els.resultsList.innerHTML = '<div class="identity-group-empty">Sin resultados. Intenta con otro nombre de curso.</div>';
    } else {
      els.resultsList.innerHTML = filteredGroups.slice(0, 40).map((g) => `
        <button type="button" class="identity-group-item" data-group="${g.group}">
          <span class="identity-group-course">${Utils.escapeHtml(g.course)}</span>
          <span class="identity-group-meta">${Utils.escapeHtml(g.group)} · ${Utils.escapeHtml(g.schedule)}</span>
        </button>
      `).join('');
    }
    els.resultsList.hidden = false;
  }

  function selectGroup(groupCode, { silent = false } = {}) {
    selectedGroup = GROUPS_DATA.find((g) => g.group === groupCode) || null;
    if (selectedGroup) {
      els.selectedLabel.textContent = matchLabel(selectedGroup);
      els.selectedLabel.hidden = false;
    } else {
      els.selectedLabel.hidden = true;
    }
    if (!silent) {
      els.searchInput.value = '';
      els.resultsList.hidden = true;
    }
  }

  function handleConfirm() {
    const name = els.nameInput.value.trim();
    if (!name) {
      showError('Escribe tu nombre.');
      els.nameInput.focus();
      return;
    }
    if (!selectedGroup) {
      showError('Selecciona tu grupo de la lista.');
      els.searchInput.focus();
      return;
    }
    finish({
      name,
      group: selectedGroup.group,
      courseCode: selectedGroup.courseCode,
      courseLabel: selectedGroup.course,
      schedule: selectedGroup.schedule,
    });
  }

  function showError(msg) {
    els.errorEl.textContent = msg;
    els.errorEl.hidden = false;
  }

  return { init, askIdentity };
})();

window.TeacherIdentity = TeacherIdentity;
