/**
 * driveSync.js
 * Sincronización real con Google Drive + Sheets, usando Google Identity
 * Services (GIS) — el flujo moderno de OAuth para SPAs, cargado por
 * <script src="https://accounts.google.com/gsi/client"> en index.html.
 *
 * Cada envío del profesor (ver planForm.js): sube el Excel generado a la
 * carpeta compartida de Drive, y agrega una fila al Google Sheet central
 * que lee el panel admin (ver adminPanel.js). Si el profesor rechaza el
 * permiso o falla la red, el envío local (localStorage) no se pierde —
 * planForm.js ya lo guarda antes de intentar esto.
 */

const DriveSync = (() => {
  const GOOGLE_CLIENT_ID = '247859853224-etgsj08fqmeaq6sdrkeg6uo8fcti8a5i.apps.googleusercontent.com';
  const DRIVE_FOLDER_ID = '1_1d5udFinADGf3K5gsdC0keBByNIv09s';
  const SHEET_ID = '1EUONe3tmwdc-cbYAUkFfByysm9GUgn0hRRkv-NSyZxU';
  const SHEET_RANGE = 'Envios!A1:H1';
  // Restringida en Google Cloud Console a solo Google Sheets API y solo
  // peticiones desde minuto-a-minuto-fimlm.netlify.app — usada solo para
  // LEER el Sheet (que es público-solo-lectura), nunca para escribir.
  const SHEETS_API_KEY = 'AIzaSyBnCVHTxOUzxRHYT9ubt2qXZvPZMQjc3_Y';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function isGisLoaded() {
    return typeof window.google !== 'undefined' && !!window.google.accounts?.oauth2;
  }

  /**
   * Pide (o reutiliza, si sigue vigente) un access token con los scopes de
   * Drive + Sheets. Devuelve una Promise<string> con el token.
   *
   * Si el profesor cierra la ventana de consentimiento de Google sin
   * decidir, el callback de Google Identity Services nunca se dispara y la
   * promesa quedaría pendiente para siempre (dejando el botón "Enviando..."
   * colgado indefinidamente) — por eso hay un timeout de seguridad que
   * rechaza a los 60s si Google no respondió nada.
   */
  function ensureAuthorized() {
    return new Promise((resolve, reject) => {
      if (!isGisLoaded()) {
        reject(new Error('No se pudo cargar el servicio de identidad de Google. Verifica tu conexión a internet.'));
        return;
      }
      if (accessToken && Date.now() < tokenExpiresAt) {
        resolve(accessToken);
        return;
      }
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: () => {}, // se sobrescribe por cada llamada, ver abajo
        });
      }

      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('No se recibió respuesta de Google a tiempo (¿se cerró la ventana de permiso?).'));
      }, 60000);

      tokenClient.callback = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (response.error) {
          reject(new Error('No se concedió el permiso de Google Drive: ' + response.error));
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 30000;
        resolve(accessToken);
      };
      tokenClient.error_callback = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('No se pudo abrir la ventana de permiso de Google: ' + (err?.message || err?.type || 'motivo desconocido')));
      };
      tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
  }

  /** Sube un Blob a la carpeta de Drive configurada. Devuelve { id, webViewLink }. */
  async function uploadExcelToDrive(blob, fileName) {
    const token = await ensureAuthorized();

    const metadata = {
      name: fileName,
      parents: [DRIVE_FOLDER_ID],
      mimeType: blob.type,
    };
    const boundary = 'mam_boundary_' + Date.now();
    const metadataPart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const fileBuffer = await blob.arrayBuffer();
    const body = new Blob([
      metadataPart,
      `--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`,
      fileBuffer,
      closeDelim,
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Drive respondió ${res.status} al subir el archivo. ${text}`);
    }
    return res.json();
  }

  /** Agrega una fila al Sheet central de envíos. `rowValues` debe seguir el orden de las columnas: Fecha, Tipo, Profesor, Grupo, Curso, Horario, Link Excel, Progreso. */
  async function appendSubmissionRow(rowValues) {
    const token = await ensureAuthorized();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [rowValues] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sheets respondió ${res.status} al agregar la fila. ${text}`);
    }
    return res.json();
  }

  /**
   * Lee todas las filas del Sheet central (usado por el panel admin), vía
   * API Key en vez de OAuth: el Sheet está configurado como "Cualquier
   * persona con el enlace puede ver" (solo lectura), así que no hace falta
   * pedirle autorización de Google al administrador — la contraseña simple
   * del panel es suficiente. La API Key está restringida (en Google Cloud
   * Console) a solo Google Sheets API y solo peticiones desde este sitio,
   * así que exponerla en el código del navegador no da acceso a nada más.
   * Devuelve un array de arrays (sin la fila de encabezado).
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

  return { ensureAuthorized, uploadExcelToDrive, appendSubmissionRow, fetchAllSubmissions };
})();

window.DriveSync = DriveSync;
