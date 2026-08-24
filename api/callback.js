// OAuth 2.0 redirect endpoint for TikTok Login Kit / Content Posting API.
// TikTok redirects the user's browser here after they approve the app,
// with a `code` query param. We exchange it server-side for an access
// token + refresh token (this must happen server-side to keep
// TIKTOK_CLIENT_SECRET out of the browser) and store the result.

function renderPage(title, message, ok) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ASSUR MX</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F7F6F2;color:#28251D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#fff;border:1px solid #D4D1CA;border-radius:14px;padding:40px 36px;max-width:440px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.06);}
  .badge{width:48px;height:48px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;background:${ok ? '#e6f3ee' : '#fbeaf1'};color:${ok ? '#437A22' : '#A12C7B'};}
  h1{font-size:21px;margin:0 0 10px;color:#171614;}
  p{font-size:15px;line-height:1.55;color:#5c5a54;margin:0;}
  .foot{margin-top:22px;font-size:12px;color:#a4a29c;}
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? '✓' : '!'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="foot">ASSUR MX · assur.mx</div>
  </div>
</body>
</html>`;
}

async function storeTokens(record) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // No KV store linked yet — skip persistence but do not fail the flow.
    console.warn('KV not configured; skipping token persistence.');
    return;
  }
  await fetch(`${url}/set/tiktok:tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(record),
  });
}

export default async function handler(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    res.status(400).send(
      renderPage(
        'Autorización cancelada',
        `TikTok reportó: ${errorDescription || error}. Puedes cerrar esta ventana e intentar de nuevo.`,
        false
      )
    );
    return;
  }

  if (!code) {
    res.status(400).send(
      renderPage('Falta el código', 'No se recibió un código de autorización de TikTok.', false)
    );
    return;
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    if (!clientKey || !clientSecret || !redirectUri) {
      throw new Error(
        'Faltan variables de entorno en el servidor (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET o TIKTOK_REDIRECT_URI).'
      );
    }

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
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
      throw new Error(
        tokenData.error_description || tokenData.error || `TikTok respondió con estado ${tokenRes.status}.`
      );
    }

    await storeTokens({
      ...tokenData,
      obtained_at: new Date().toISOString(),
      state: state || null,
    });

    res
      .status(200)
      .send(
        renderPage(
          'Autorización completada',
          'ASSUR MX ya está autorizado para publicar en TikTok. Puedes cerrar esta ventana.',
          true
        )
      );
  } catch (err) {
    console.error('OAuth callback error:', err);
    res
      .status(500)
      .send(renderPage('Error al autorizar', err.message || 'Ocurrió un error inesperado.', false));
  }
}
