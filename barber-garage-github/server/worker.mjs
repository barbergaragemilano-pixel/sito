// Cloudflare Pages advanced-mode Worker. All admin routes fail closed.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src https://www.google.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
function secure(response, privatePage = false) {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries({
    'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'Strict-Transport-Security': 'max-age=31536000',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  })) result.headers.set(name, value);
  if (privatePage) { result.headers.set('Cache-Control', 'no-store'); result.headers.set('X-Robots-Tag', 'noindex, nofollow'); }
  return result;
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(401, 'Sessione non valida.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), char => char.charCodeAt(0));
}
let keyCache;
export async function authorize(request, env) {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || '') || !env.ACCESS_AUD || !env.ADMIN_EMAILS)
    fail(503, 'Accesso amministratore non ancora configurato.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16000) fail(401, 'Accedi tramite Cloudflare Access.');
  let parts, header, claims;
  try {
    parts = token.split('.'); if (parts.length !== 3) throw Error();
    header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  } catch { fail(401, 'Sessione non valida.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') fail(401, 'Sessione non valida.');
  if (!keyCache || keyCache.issuer !== env.ACCESS_ISSUER || keyCache.expires < Date.now()) {
    // Workers support only 'follow' and 'manual'; with 'manual' a redirect is not ok and is rejected.
    const response = await fetch(env.ACCESS_ISSUER + '/cdn-cgi/access/certs', { redirect: 'manual' });
    if (!response.ok) fail(503, 'Verifica accesso temporaneamente non disponibile.');
    const jwks = await response.json();
    keyCache = { issuer: env.ACCESS_ISSUER, keys: jwks.keys, expires: Date.now() + 300000 };
  }
  const jwk = keyCache.keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) { keyCache = null; fail(401, 'Sessione da rinnovare. Riprova.'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Date.now() / 1000;
  if (!verified || claims.iss !== env.ACCESS_ISSUER || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
    !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30 ||
    (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30)) || typeof claims.sub !== 'string')
    fail(401, 'Sessione scaduta o non valida.');
  const allowed = env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (typeof claims.email !== 'string' || !allowed.includes(claims.email.toLowerCase())) fail(403, 'Account non autorizzato.');
  return claims.email;
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Testo mancante o troppo lungo.');
  return value.trim();
}
export function validateCatalog(data) {
  if (data?.version !== 1) fail(400, 'Formato catalogo non valido.');
  const result = { version: 1, updatedAt: new Date().toISOString() };
  for (const type of ['services', 'products']) {
    if (!Array.isArray(data[type]) || data[type].length > 300) fail(400, 'Massimo 300 voci per catalogo.');
    const ids = new Set();
    result[type] = data[type].map(item => {
      if (!item || typeof item !== 'object') fail(400, 'Voce non valida.');
      const id = text(item.id, 80, true);
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail(400, 'Identificativo non valido o duplicato.');
      ids.add(id);
      if (!Number.isFinite(item.price) || item.price < 0 || item.price > 999999 || Math.abs(item.price * 100 - Math.round(item.price * 100)) > 0.00001) fail(400, 'Prezzo non valido.');
      const photo = text(item.photo, 100);
      if (photo && (type !== 'products' || !/^\/media\/[a-f0-9-]{36}\.jpg$/.test(photo))) fail(400, 'Foto non valida.');
      return { id, name: text(item.name, 100, true), description: text(item.description, 500), section: text(item.section, 60, true), price: item.price, photo };
    });
  }
  return result;
}
export function validateHours(week) {
  if (!Array.isArray(week) || week.length !== 7) fail(400, 'Servono sette giorni.');
  return week.map(day => {
    if (!day || typeof day.closed !== 'boolean' || !Array.isArray(day.slots) || day.slots.length > 2) fail(400, 'Orari non validi.');
    if (day.closed) return { closed: true, slots: [] };
    if (!day.slots.length) fail(400, 'Inserisci una fascia oraria.');
    let end = '';
    const slots = day.slots.map(slot => {
      if (!slot || typeof slot.start !== 'string' || typeof slot.end !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.start >= slot.end || (end && slot.start <= end)) fail(400, 'Fasce orarie non valide o sovrapposte.');
      end = slot.end; return { start: slot.start, end: slot.end };
    });
    return { closed: false, slots };
  });
}
async function limitedBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) fail(413, 'File o richiesta troppo grande.');
  if (!request.body) fail(400, 'Contenuto mancante.');
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length; if (length > limit) { await reader.cancel(); fail(413, 'File o richiesta troppo grande.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  // Public file names are ASCII; reject encoded aliases of protected paths.
  if (path.includes('%')) fail(400, 'Percorso non valido.');
  const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
  if (admin) await authorize(request, env);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (!admin) fail(405, 'Metodo non consentito.');
    if (request.headers.get('Origin') !== url.origin || request.headers.get('X-Garage-Admin') !== '1') fail(403, 'Richiesta non consentita.');
  }
  if (path === '/api/admin/session' && request.method === 'GET') return json({ authenticated: true });
  const match = path.match(/^\/api\/(?:admin\/)?(catalog|hours)$/);
  if (match) {
    if (!env.DB) fail(503, 'Database non configurato.');
    const name = match[1];
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT body, revision FROM documents WHERE name = ?').bind(name).first();
      if (!row) fail(503, 'Dati non ancora inizializzati.');
      return json({ data: JSON.parse(row.body), revision: row.revision });
    }
    if (request.method !== 'PUT') fail(405, 'Metodo non consentito.');
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) fail(415, 'Formato non supportato.');
    let payload; try { payload = JSON.parse(new TextDecoder().decode(await limitedBody(request, 750000))); } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'JSON non valido.'); }
    if (!Number.isSafeInteger(payload?.revision) || payload.revision < 0) fail(400, 'Versione dati non valida.');
    const data = name === 'catalog' ? validateCatalog(payload.data) : validateHours(payload.data);
    if (name === 'catalog') {
      if (!env.PHOTOS) fail(503, 'Archivio foto non configurato.');
      for (const photo of new Set(data.products.map(item => item.photo).filter(Boolean))) {
        if (!await env.PHOTOS.head(photo.slice(7))) fail(400, 'Foto non trovata. Caricala nuovamente.');
      }
    }
    let result;
    if (payload.revision === 0) result = await env.DB.prepare('INSERT OR IGNORE INTO documents(name,body,revision) VALUES(?,?,1)').bind(name, JSON.stringify(data)).run();
    else result = await env.DB.prepare("UPDATE documents SET body=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE name=? AND revision=?").bind(JSON.stringify(data), name, payload.revision).run();
    if (result.meta.changes !== 1) fail(409, 'Dati modificati altrove. Ricarica prima di salvare.');
    return json({ data, revision: payload.revision + 1 });
  }
  if (path === '/api/admin/photos' && request.method === 'POST') {
    if (!env.PHOTOS) fail(503, 'Archivio foto non configurato.');
    if (request.headers.get('Content-Type') !== 'image/jpeg') fail(415, 'È richiesta una foto JPEG.');
    const bytes = await limitedBody(request, 2 * 1024 * 1024);
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) fail(400, 'Foto JPEG non valida.');
    const name = crypto.randomUUID() + '.jpg';
    await env.PHOTOS.put(name, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    return json({ url: '/media/' + name }, 201);
  }
  if (path.startsWith('/media/')) {
    if (!/^\/media\/[a-f0-9-]{36}\.jpg$/.test(path) || !env.PHOTOS) fail(404, 'Foto non trovata.');
    const object = await env.PHOTOS.get(path.slice(7)); if (!object) fail(404, 'Foto non trovata.');
    return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'ETag': object.httpEtag } });
  }
  if (path.startsWith('/api/')) fail(404, 'Risorsa non trovata.');
  if (request.method !== 'GET' && request.method !== 'HEAD') fail(405, 'Metodo non consentito.');
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
    try { return secure(await route(request, env), admin); }
    catch (error) {
      if (!(error instanceof HttpError)) console.error('Request failed:', error.name, error.message);
      return secure(json({ error: error instanceof HttpError ? error.message : 'Servizio temporaneamente non disponibile.' }, error.status || 503), admin);
    }
  }
};
