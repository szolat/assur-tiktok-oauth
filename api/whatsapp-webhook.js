// Webhook de WhatsApp Cloud API -> CRM ASSUR.
// GET: verificación de Meta (hub.mode / hub.verify_token / hub.challenge).
// POST: valida la firma (si META_APP_SECRET está configurado) y reenvía el
// payload al receptor de Apps Script, que lo registra en la hoja "CRM ASSUR".
// Variables: WA_VERIFY_TOKEN, CRM_INTAKE_URL, CRM_INTAKE_SECRET, META_APP_SECRET (opcional).
import crypto from 'node:crypto';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function validSignature(raw, header, secret) {
  if (!secret) return true;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const q = req.query || {};
    const ok = q['hub.mode'] === 'subscribe' && process.env.WA_VERIFY_TOKEN &&
      q['hub.verify_token'] === process.env.WA_VERIFY_TOKEN;
    if (ok) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(q['hub.challenge'] || ''));
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const raw = await readRaw(req);
  if (!validSignature(raw, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch { return res.status(400).send('Bad JSON'); }

  // Solo reenvía cambios con mensajes entrantes; los estados (sent/delivered/read) se ignoran.
  const hasMessages = (payload.entry || []).some((e) =>
    (e.changes || []).some((c) => c.field === 'messages' && (c.value?.messages || []).length));

  let forwarded = null;
  if (hasMessages && process.env.CRM_INTAKE_URL && process.env.CRM_INTAKE_SECRET) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(process.env.CRM_INTAKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: process.env.CRM_INTAKE_SECRET, payload }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      forwarded = r.status;
      console.log('crm-intake', r.status, (await r.text()).slice(0, 200));
    } catch (err) {
      console.error('crm-intake-error', String(err));
    }
  }
  // Meta reintenta si no recibe 200; siempre confirmamos recepción.
  return res.status(200).json({ ok: true, forwarded });
}
