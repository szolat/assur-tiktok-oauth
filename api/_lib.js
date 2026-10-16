// Shared helpers: encrypted session cookie, HTML layout and TikTok API calls.
// The access token never reaches the browser in clear text: it is stored in an
// HttpOnly cookie encrypted with AES-256-GCM using a key derived from ADMIN_SECRET.
import crypto from 'node:crypto';

const COOKIE = 'tt_session';

function key() {
  const secret = process.env.ADMIN_SECRET || process.env.TIKTOK_CLIENT_SECRET || '';
  if (!secret) throw new Error('Falta ADMIN_SECRET en el servidor.');
  return crypto.createHash('sha256').update(`assur-tiktok:${secret}`).digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function unseal(value) {
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const out = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch {
    return null;
  }
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookieHeader(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function setSession(res, record) {
  const ttl = Math.max(60, Math.min(Number(record.expires_in) || 86400, 86400));
  res.setHeader('Set-Cookie', cookieHeader(COOKIE, seal({ ...record, exp: Date.now() + ttl * 1000 }), ttl));
}

export function getSession(req) {
  const value = readCookie(req, COOKIE);
  if (!value) return null;
  const s = unseal(value);
  if (!s || !s.access_token || (s.exp && s.exp < Date.now())) return null;
  return s;
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', cookieHeader(COOKIE, '', 0));
}

export async function fetchUserInfo(accessToken) {
  const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.error && data.error.code && data.error.code !== 'ok')) {
    throw new Error((data.error && data.error.message) || `user/info respondió ${r.status}`);
  }
  return data.data && data.data.user ? data.data.user : {};
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function page(title, body) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — ASSUR MX</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F7F6F2;color:#28251D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#fff;border:1px solid #D4D1CA;border-radius:14px;padding:36px 32px;max-width:480px;width:100%;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.06);}
  h1{font-size:21px;margin:0 0 10px;color:#171614;}
  p{font-size:15px;line-height:1.55;color:#5c5a54;margin:0 0 18px;}
  .user{display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 0 22px;}
  .user img{width:56px;height:56px;border-radius:50%;border:1px solid #D4D1CA;object-fit:cover;}
  .user strong{font-size:17px;color:#171614;}
  a.btn,button.btn{display:inline-block;background:#01696F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;border:0;cursor:pointer;}
  button.btn[disabled]{background:#BAB9B4;cursor:not-allowed;}
  a.link{color:#01696F;font-size:14px;}
  input[type=file]{display:block;margin:0 auto 18px;font-size:14px;}
  .status{font-size:14px;color:#5c5a54;margin-top:16px;min-height:20px;white-space:pre-line;}
  .ok{color:#437A22;} .err{color:#A12C7B;}
  .foot{margin-top:22px;font-size:12px;color:#a4a29c;}
</style>
</head>
<body>
  <div class="card">${body}<div class="foot">ASSUR MX · <a class="link" href="/terminos">Términos</a> · <a class="link" href="/privacidad">Privacidad</a></div></div>
</body>
</html>`;
}
