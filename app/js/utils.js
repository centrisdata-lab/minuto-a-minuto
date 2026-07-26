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

  /** Duración "HH:MM" -> texto legible, ej. "0:05" -> "5 min". */
  durationLabel(hhmm) {
    const mins = this.timeToMinutes(hhmm);
    if (mins <= 0) return '0 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
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
};

window.Utils = Utils;
