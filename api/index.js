// Public landing page. Shows a "Connect with TikTok" button that starts the
// Login Kit OAuth flow. client_key is not secret — it is always sent to the
// browser as part of the authorize URL, unlike client_secret.
// A random `state` is stored in an HttpOnly cookie and checked in /api/callback (CSRF protection).
import crypto from 'node:crypto';
import { cookieHeader, getSession, page, esc } from './_lib.js';

export default function handler(req, res) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || '';
  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'user.info.basic,video.upload';

  const authorizeUrl =
    `https://www.tiktok.com/v2/auth/authorize/` +
    `?client_key=${encodeURIComponent(clientKey)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  const configured = clientKey && redirectUri;
  const session = getSession(req);

  res.setHeader('Set-Cookie', cookieHeader('tt_state', state, 600));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const connected = session
    ? `<p>Cuenta conectada: <strong>${esc(session.display_name || 'TikTok')}</strong></p>
       <p><a class="btn" href="/api/upload">Subir un video a TikTok</a></p>
       <p><a class="link" href="${authorizeUrl}">Conectar otra cuenta</a></p>`
    : configured
      ? `<a class="btn" href="${authorizeUrl}">Conectar con TikTok</a>`
      : `<button class="btn" disabled>Configuración pendiente</button>`;

  res.status(200).send(
    page(
      'Conectar con TikTok',
      `<h1>ASSUR MX</h1>
       <p>Conecta la cuenta de TikTok de ASSUR para enviar videos educativos sobre drenaje pluvial y gestión del agua a la bandeja de borradores de TikTok. La publicación final siempre se hace desde la app de TikTok.</p>
       ${connected}`
    )
  );
}
