/**
 * submit-minuto.js (Netlify Function)
 * Recibe el Excel + datos de identidad de un envío del profesor y lo sube a
 * Google Drive / registra en el Sheet central usando una CUENTA DE SERVICIO
 * (identidad técnica propia de la app), no la cuenta personal del profesor.
 * Así el navegador del profesor nunca ve una ventana de consentimiento de
 * Google — solo habla con este endpoint, que es quien conversa con Google.
 *
 * Requiere dos variables de entorno configuradas en Netlify (Site settings
 * → Environment variables), nunca en el repo:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   — el client_email del JSON de la cuenta de servicio
 *   GOOGLE_SERVICE_ACCOUNT_KEY     — el private_key del mismo JSON (con los \n literales)
 *
 * Sin dependencias npm: usa el módulo "crypto" nativo de Node para firmar el
 * JWT (RS256) del flujo "Service Account" de Google OAuth2, evitando
 * necesitar un paso de `npm install` que este sitio nunca ha tenido.
 */

const crypto = require('crypto');

const DRIVE_FOLDER_ID = '1_1d5udFinADGf3K5gsdC0keBByNlv09s';
const SHEET_ID = '1EUONe3tmwdc-cbYAUkFfByysm9GUgn0hRRkv-NSyZxU';
const SHEET_RANGE = 'Envios!A1:H1';
// "drive.file" (más restringido) solo da acceso a archivos que la propia
// cuenta de servicio creó — no a carpetas preexistentes de otra cuenta
// aunque se compartan como Editor. Como la carpeta de Drive ya existía
// antes de crear la cuenta de servicio, se necesita el scope completo
// "drive" para poder subir dentro de ella. El riesgo queda acotado porque
// esta es una cuenta de servicio dedicada solo a esta app, sin acceso a
// nada que no se le comparta explícitamente.
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Construye y firma el JWT de "Service Account" (RFC 7523) que Google intercambia por un access token. */
function buildSignedJwt(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${signingInput}.${signature}`;
}

/** Intercambia el JWT firmado por un access token de acceso a las APIs de Google. */
async function getServiceAccountToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('Faltan las variables de entorno GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY en Netlify.');
  }
  // El private_key del JSON trae saltos de línea escapados como "\n" literales al pegarlo en una variable de entorno de una sola línea.
  const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  const jwt = buildSignedJwt(clientEmail, privateKey);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google rechazó la autenticación de la cuenta de servicio (${res.status}). ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Sube el Excel (Buffer) a la carpeta de Drive configurada. Devuelve { id, webViewLink }. */
async function uploadExcelToDrive(token, buffer, fileName) {
  const metadata = {
    name: fileName,
    parents: [DRIVE_FOLDER_ID],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const boundary = 'mam_boundary_' + Date.now();
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metadataPart, 'utf8'),
    Buffer.from(filePart, 'utf8'),
    buffer,
    Buffer.from(closeDelim, 'utf8'),
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

/** Agrega una fila al Sheet central de envíos (mismo orden de columnas que usaba el flujo OAuth anterior). */
async function appendSubmissionRow(token, rowValues) {
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Método no permitido.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Cuerpo de la petición inválido.' }) };
  }

  const { excelBase64, fileName, type, teacher = {}, progress } = payload;
  if (!excelBase64 || !fileName) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Falta el archivo Excel o el nombre de archivo.' }) };
  }

  try {
    const token = await getServiceAccountToken();
    const buffer = Buffer.from(excelBase64, 'base64');

    const uploaded = await uploadExcelToDrive(token, buffer, fileName);
    const webViewLink = uploaded.webViewLink || '';

    await appendSubmissionRow(token, [
      new Date().toISOString(),
      type || '',
      teacher.name || '',
      teacher.group || '',
      teacher.courseLabel || '',
      teacher.schedule || '',
      webViewLink,
      `${progress || 0}%`,
    ]);

    return { statusCode: 200, body: JSON.stringify({ ok: true, webViewLink }) };
  } catch (e) {
    console.error('submit-minuto error:', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message || 'Error desconocido al sincronizar con Google.' }) };
  }
};
