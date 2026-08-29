/**
 * submissionsApi.js
 * Cliente REST directo (sin SDK) contra la tabla `submissions` de Supabase
 * — Postgres gratuito con API PostgREST expuesta automáticamente. Se usa
 * `fetch` puro porque el sitio no tiene build step ni npm install.
 *
 * La `anon public key` es segura de exponer en el navegador: el control de
 * acceso real lo hacen las políticas de Row Level Security configuradas en
 * el proyecto de Supabase (ver CLAUDE.md o el plan de implementación),
 * nunca el secreto de la clave en sí — es el mismo principio que una API
 * Key de Google restringida por dominio/API.
 */

const SubmissionsApi = (() => {
  const SUPABASE_URL = 'https://uctkoqtiuzoujinnvhco.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_PFXpLO2N5W3XIT9lbXou4A_4UHNFy7n';
  const REQUEST_TIMEOUT_MS = 15000;

  /**
   * `fetch` con límite de tiempo: si Supabase no responde en
   * REQUEST_TIMEOUT_MS, aborta la petición en vez de dejarla colgada para
   * siempre (sin esto, una red lenta deja el panel admin en "Cargando..."
   * indefinidamente, sin error ni forma de recuperarse).
   */
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('La conexión tardó demasiado. Verifica tu internet e intenta de nuevo.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Registra un envío del Minuto a Minuto (sin recomendaciones — ver planForm.js). `stage: 'plan'` lo distingue de un envío de retroalimentación. */
  async function submitPlan({ teacherName, teacherRole, groupCode, courseLabel, schedule, plan }) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        teacher_name: teacherName,
        teacher_role: teacherRole || null,
        group_code: groupCode || null,
        course_label: courseLabel || null,
        schedule: schedule || null,
        course_name: plan.courseLabel || null,
        start_time: plan.startTime || null,
        stage: 'plan',
        plan,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase respondió ${res.status} al enviar. ${text}`);
    }
  }

  /**
   * Registra un envío de Retroalimentación ("después de la clase"), como
   * registro separado del Minuto a Minuto — `stage: 'feedback'` permite que
   * el panel admin lo combine con el plan del mismo profesor+grupo. `plan`
   * aquí es un objeto reducido (solo id/fechas/curso/horario/feedback).
   */
  async function submitFeedback({ teacherName, teacherRole, groupCode, courseLabel, schedule, plan }) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        teacher_name: teacherName,
        teacher_role: teacherRole || null,
        group_code: groupCode || null,
        course_label: courseLabel || null,
        schedule: schedule || null,
        course_name: plan.courseLabel || null,
        start_time: plan.startTime || null,
        stage: 'feedback',
        plan,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase respondió ${res.status} al enviar la retroalimentación. ${text}`);
    }
  }

  /** Lee todos los envíos registrados (usado por el panel admin), del más reciente al más antiguo. */
  async function fetchAllSubmissions() {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/submissions?select=*&order=created_at.desc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase respondió ${res.status} al leer los envíos. ${text}`);
    }
    return res.json();
  }

  /** Elimina un envío por su id (usado por el panel admin — requiere la policy de DELETE en Supabase). */
  async function deleteSubmission(id) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase respondió ${res.status} al eliminar. ${text}`);
    }
  }

  return { submitPlan, submitFeedback, fetchAllSubmissions, deleteSubmission };
})();

window.SubmissionsApi = SubmissionsApi;
