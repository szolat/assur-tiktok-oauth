// OAuth 2.0 redirect endpoint for TikTok Login Kit / Content Posting API.
// TikTok redirects the user's browser here after they approve the app,
// with a `code` query param. We exchange it server-side for an access
// token (keeps TIKTOK_CLIENT_SECRET out of the browser), read the connected
// account's display name and avatar (scope user.info.basic) and keep the token
// in an encrypted HttpOnly session cookie for the upload step (scope video.upload).
import { esc, fetchUserInfo, page, readCookie, setSession, cookieHeader } from './_lib.js';

function message(title, text, ok) {
  return page(
    title,
    `<div style="width:48px;height:48px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;background:${ok ? '#e6f3ee' : '#fbeaf1'};color:${ok ? '#437A22' : '#A12C7B'};">${ok ? '✓' : '!'}</div>
     <h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="link" href="/">Volver al inicio</a></p>`
  );
}

async function storeTokens(record) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return; // Optional persistence: the session cookie is enough for the upload flow.
  await fetch(`${url}/set/tiktok:tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
}

export default async function handler(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (error) {
    res.status(400).send(message('Autorización cancelada', `TikTok reportó: ${errorDescription || error}. Puedes intentar de nuevo.`, false));
    return;
  }
  if (!code) {
    res.status(400).send(message('Falta el código', 'No se recibió un código de autorización de TikTok.', false));
    return;
  }
  const expectedState = readCookie(req, 'tt_state');
  if (!expectedState || expectedState !== state) {
    res.status(400).send(message('Sesión no válida', 'El parámetro state no coincide. Vuelve a iniciar la conexión desde la página principal.', false));
    return;
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;
    if (!clientKey || !clientSecret || !redirectUri) {
      throw new Error('Faltan variables de entorno en el servidor (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET o TIKTOK_REDIRECT_URI).');
    }

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || `TikTok respondió con estado ${tokenRes.status}.`);
    }

    // Scope user.info.basic: show who is connected so the team can confirm the right account.
    let user = {};
    try {
      user = await fetchUserInfo(tokenData.access_token);
    } catch (e) {
      console.warn('user/info failed:', e.message);
    }

    await storeTokens({ ...tokenData, obtained_at: new Date().toISOString() }).catch((e) => console.warn('KV:', e.message));

    setSession(res, {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      open_id: tokenData.open_id || user.open_id,
      scope: tokenData.scope,
      display_name: user.display_name || '',
      avatar_url: user.avatar_url || '',
    });
    res.appendHeader?.('Set-Cookie', cookieHeader('tt_state', '', 0));

    const avatar = user.avatar_url ? `<img src="${esc(user.avatar_url)}" alt="Foto de perfil de ${esc(user.display_name)}" />` : '';
    res.status(200).send(
      page(
        'Cuenta conectada',
        `<h1>Cuenta conectada</h1>
         <div class="user">${avatar}<strong>${esc(user.display_name || 'Cuenta de TikTok')}</strong></div>
         <p>ASSUR MX puede enviar videos a la bandeja de borradores de esta cuenta. Permisos concedidos: ${esc(tokenData.scope || '')}.</p>
         <a class="btn" href="/api/upload">Subir un video a TikTok</a>`
      )
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send(message('Error al autorizar', err.message || 'Ocurrió un error inesperado.', false));
  }
}
