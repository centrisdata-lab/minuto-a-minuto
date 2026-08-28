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

  /** Registra un envío del Minuto a Minuto completo. `plan` es el objeto completo que ya guarda planForm.js (bloques, recomendaciones, feedback). */
  async function submitPlan({ teacherName, groupCode, courseLabel, schedule, plan }) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        teacher_name: teacherName,
        group_code: groupCode || null,
        course_label: courseLabel || null,
        schedule: schedule || null,
        course_name: plan.courseName || null,
        start_time: plan.startTime || null,
        plan,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase respondió ${res.status} al enviar. ${text}`);
    }
  }

  /** Lee todos los envíos registrados (usado por el panel admin), del más reciente al más antiguo. */
  async function fetchAllSubmissions() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?select=*&order=created_at.desc`, {
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

  return { submitPlan, fetchAllSubmissions };
})();

window.SubmissionsApi = SubmissionsApi;
