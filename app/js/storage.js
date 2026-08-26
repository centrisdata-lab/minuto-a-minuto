/**
 * storage.js
 * Capa de persistencia de la aplicación.
 *
 * Arquitectura pensada para escalar: toda la app habla con el objeto
 * `Storage` definido aquí (patrón repositorio). Hoy la implementación
 * guarda en localStorage; el día que exista backend, basta con reemplazar
 * los métodos de `Storage` por llamadas fetch() a una API REST — el resto
 * de la aplicación (planForm.js, etc.) no necesita cambiar porque solo
 * conoce esta interfaz.
 *
 * Modelo "sesión por navegador":
 * Cada navegador genera un `teacherId` (UUID) la primera vez que se usa la
 * app y lo guarda en localStorage. La planeación activa queda asociada a
 * ese id, simulando una sesión propia por profesor sin necesidad de login.
 * Cuando exista autenticación real, `getTeacherId()` puede reemplazarse por
 * el id de usuario devuelto por el backend sin tocar el resto del código.
 */

const STORAGE_KEYS = {
  TEACHER_ID: 'mam_teacher_id',
  TEACHER_IDENTITY: 'mam_teacher_identity', // { name, group, courseCode, courseLabel, schedule }
  ACTIVE_PLAN: 'mam_active_plan', // única planeación activa de este navegador
  THEME: 'mam_theme',
};

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Devuelve (y crea si no existe) el identificador de sesión del profesor.
 * Si localStorage no está disponible (cuota llena, modo privado, política
 * del navegador), degrada a un id en memoria en lugar de romper el arranque
 * de toda la aplicación.
 */
function getTeacherId() {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.TEACHER_ID);
    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEYS.TEACHER_ID, id);
    }
    return id;
  } catch (e) {
    console.warn('No se pudo acceder a localStorage para el id de sesión; se usará uno temporal.', e);
    return generateId();
  }
}

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    console.warn('No se pudo leer el dato guardado, se usará un valor por defecto.', e);
    return fallback;
  }
}

/** Valida que el objeto tenga la forma mínima esperada de una planeación. */
function isValidPlanShape(plan) {
  return !!plan && typeof plan === 'object' && Array.isArray(plan.blocks);
}

const Storage = {
  KEYS: STORAGE_KEYS,

  getTeacherId,

  /**
   * Obtiene la planeación activa de este navegador, o null si no existe o
   * su forma está corrupta (ej. editada manualmente fuera de la app).
   */
  getActivePlan() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_PLAN);
    } catch (e) {
      console.warn('No se pudo leer la planeación guardada.', e);
      return null;
    }
    const plan = safeParse(raw, null);
    if (plan !== null && !isValidPlanShape(plan)) {
      console.warn('La planeación guardada tiene un formato inválido; se ignora.');
      return null;
    }
    return plan;
  },

  /** Guarda (crea o actualiza) la planeación activa. Devuelve la planeación guardada, o null si falló. */
  savePlan(plan) {
    if (!plan.id) plan.id = generateId();
    plan.updatedAt = new Date().toISOString();
    if (!plan.createdAt) plan.createdAt = plan.updatedAt;

    localStorage.setItem(STORAGE_KEYS.ACTIVE_PLAN, JSON.stringify(plan));
    return plan;
  },

  clearActivePlan() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAN);
  },

  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.THEME) || null;
  },

  setTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  /** Identidad del profesor (nombre + grupo/curso elegido), o null si aún no se ha configurado en este navegador. */
  getTeacherIdentity() {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_IDENTITY);
    return safeParse(raw, null);
  },

  setTeacherIdentity(identity) {
    localStorage.setItem(STORAGE_KEYS.TEACHER_IDENTITY, JSON.stringify(identity));
  },
};

// Se expone en window para que el resto de módulos (cargados como <script> planos) lo usen.
window.Storage = Storage;
