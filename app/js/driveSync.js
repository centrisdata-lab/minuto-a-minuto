/**
 * driveSync.js
 * Sincronización con Google Drive + Sheets.
 *
 * - Escritura (cada envío del profesor): pasa por nuestra propia función
 *   serverless (netlify/functions/submit-minuto.js), que sube el Excel y
 *   registra la fila usando una cuenta de servicio de Google — así el
 *   navegador del profesor nunca ve una ventana de login de Google, solo
 *   habla con nuestro propio backend.
 * - Lectura (panel admin): vía API Key directa a la API de Sheets, porque
 *   el Sheet está configurado como público-solo-lectura; no requiere login.
 *
 * Si el envío falla (backend caído, sin red), el envío local (localStorage)
 * no se pierde — planForm.js ya lo guarda antes de intentar esto.
 */

const DriveSync = (() => {
  const SHEET_ID = '1EUONe3tmwdc-cbYAUkFfByysm9GUgn0hRRkv-NSyZxU';
  // Restringida en Google Cloud Console a solo Google Sheets API y solo
  // peticiones desde minuto-a-minuto-fimlm.netlify.app — usada solo para
  // LEER el Sheet (que es público-solo-lectura), nunca para escribir.
  const SHEETS_API_KEY = 'AIzaSyBnCVHTxOUzxRHYT9ubt2qXZvPZMQjc3_Y';
  const SUBMIT_ENDPOINT = '/.netlify/functions/submit-minuto';

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo Excel generado.'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Envía el Excel + datos del profesor a nuestro backend, que lo sube a
   * Drive y registra la fila en el Sheet. Devuelve { webViewLink }.
   * `type` es 'plan' o 'feedback'; `teacher` es la identidad del profesor
   * (ver teacherIdentity.js); `progress` es el % de diligenciamiento.
   */
  async function submitViaBackend({ blob, fileName, type, teacher, progress }) {
    const excelBase64 = await blobToBase64(blob);
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excelBase64, fileName, type, teacher, progress }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `El servidor respondió ${res.status} al sincronizar el envío.`);
    }
    return { webViewLink: data.webViewLink || '' };
  }

  /**
   * Lee todas las filas del Sheet central (usado por el panel admin), vía
   * API Key en vez de login: el Sheet está configurado como "Cualquier
   * persona con el enlace puede ver" (solo lectura), así que la contraseña
   * simple del panel es suficiente. La API Key está restringida (en Google
   * Cloud Console) a solo Google Sheets API y solo peticiones desde este
   * sitio, así que exponerla en el código del navegador no da acceso a
   * nada más. Devuelve un array de arrays (sin la fila de encabezado).
   */
  async function fetchAllSubmissions() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Envios!A2:H1000?key=${SHEETS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sheets respondió ${res.status} al leer los envíos. ${text}`);
    }
    const data = await res.json();
    return data.values || [];
  }

  return { submitViaBackend, fetchAllSubmissions };
})();

window.DriveSync = DriveSync;
