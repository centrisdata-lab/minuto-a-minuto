/**
 * utils.js
 * Funciones auxiliares reutilizables en toda la aplicación.
 */

const Utils = {
  /** Ejecuta `fn` solo después de que pase `delay` ms sin nuevas llamadas. */
  debounce(fn, delay = 500) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /** "HH:MM" -> minutos totales. Devuelve 0 si el formato es inválido. */
  timeToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  },

  /** minutos totales -> "HH:MM" (formato 24h, con wrap si pasa de 24h). */
  minutesToTime(totalMinutes) {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  /**
   * Minutos totales -> texto legible, ej. 5 -> "5 min", 90 -> "1 h 30 min".
   * `emptyIfZero` controla qué devolver en 0 (o negativo): `'0 min'` por
   * defecto, o `''` si se pasa `true` (usado donde un campo vacío se
   * prefiere sobre "0 min" — ej. totales que aún no tienen datos).
   * Única fuente de este formato — no duplicar esta lógica en otros
   * archivos (antes existían 3 copias casi idénticas: aquí, en
   * BlocksManager.formatTotalDuration y en Exporters.totalDurationLabel).
   */
  minutesToDurationLabel(totalMinutes, { emptyIfZero = false } = {}) {
    if (totalMinutes <= 0) return emptyIfZero ? '' : '0 min';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  },

  /** Duración "HH:MM" -> texto legible, ej. "0:05" -> "5 min". */
  durationLabel(hhmm) {
    return this.minutesToDurationLabel(this.timeToMinutes(hhmm));
  },

  /** ISO date -> "dd/mm/aaaa" para mostrar al usuario. */
  formatDate(isoDate) {
    if (!isoDate) return 'Sin fecha';
    const [y, m, d] = isoDate.split('-');
    if (!y || !m || !d) return isoDate;
    return `${d}/${m}/${y}`;
  },

  /** Devuelve un texto relativo tipo "hace 5 min", "hace 2 h", "hace 3 días". */
  timeAgo(isoString) {
    if (!isoString) return '';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'ayer';
    return `hace ${diffD} días`;
  },

  /** Escapa texto para insertarlo de forma segura como contenido HTML. */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  },

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Atrapa el foco de teclado dentro de `overlayEl` mientras está abierto:
   * Tab/Shift+Tab ciclan solo entre los elementos focusables visibles de
   * adentro, sin salir hacia la página de fondo. Devuelve una función
   * `release()` que hay que llamar al cerrar el modal para quitar el
   * listener. Uso típico:
   *   const releaseTrap = Utils.trapFocus(overlayEl);
   *   // ...al cerrar:
   *   releaseTrap();
   */
  trapFocus(overlayEl) {
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeydown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = [...overlayEl.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    overlayEl.addEventListener('keydown', onKeydown);
    return () => overlayEl.removeEventListener('keydown', onKeydown);
  },
};

window.Utils = Utils;
