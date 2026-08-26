/**
 * teacherIdentity.js
 * Identidad del profesor en este navegador: nombre + grupo/curso elegido de
 * GROUPS_DATA (ver groupsData.js). Se pide una sola vez mediante un overlay
 * bloqueante y queda guardada en Storage; los envíos (ver planForm.js /
 * driveSync.js) la usan para identificar de quién es cada Minuto a Minuto.
 */

const TeacherIdentity = (() => {
  let identity = null;
  let els = {};
  let filteredGroups = [];
  let selectedGroup = null;
  let onReadyCallback = () => {};

  function cacheEls() {
    els = {
      overlay: document.getElementById('identity-modal'),
      form: document.getElementById('identity-form'),
      nameInput: document.getElementById('identity-name'),
      searchInput: document.getElementById('identity-group-search'),
      resultsList: document.getElementById('identity-group-results'),
      selectedLabel: document.getElementById('identity-group-selected'),
      submitBtn: document.getElementById('identity-submit'),
      errorEl: document.getElementById('identity-error'),
      badge: document.getElementById('identity-badge'),
    };
  }

  function init(onReady) {
    cacheEls();
    onReadyCallback = onReady || (() => {});

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
      handleSubmit();
    });

    els.badge?.addEventListener('click', () => openOverlay());

    identity = Storage.getTeacherIdentity();
    if (identity) {
      updateBadge();
      onReadyCallback(identity);
    } else {
      openOverlay();
    }
  }

  function openOverlay() {
    els.nameInput.value = identity?.name || '';
    selectGroup(identity?.group || null, { silent: true });
    els.searchInput.value = '';
    els.errorEl.hidden = true;
    els.overlay.hidden = false;
    els.nameInput.focus();
  }

  function matchLabel(g) {
    return `${g.course} — ${g.group} — ${g.schedule}`;
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    filteredGroups = !q
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

  function handleSubmit() {
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
    identity = {
      name,
      group: selectedGroup.group,
      courseCode: selectedGroup.courseCode,
      courseLabel: selectedGroup.course,
      schedule: selectedGroup.schedule,
    };
    Storage.setTeacherIdentity(identity);
    updateBadge();
    els.overlay.hidden = true;
    onReadyCallback(identity);
  }

  function showError(msg) {
    els.errorEl.textContent = msg;
    els.errorEl.hidden = false;
  }

  function updateBadge() {
    if (!els.badge || !identity) return;
    els.badge.textContent = `${identity.name} · ${identity.group}`;
    els.badge.title = `Cambiar de profesor/grupo (${identity.courseLabel} — ${identity.schedule})`;
    els.badge.hidden = false;
  }

  function getIdentity() {
    return identity;
  }

  return { init, getIdentity, openOverlay };
})();

window.TeacherIdentity = TeacherIdentity;
