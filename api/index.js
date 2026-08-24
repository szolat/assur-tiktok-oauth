// Public landing page. Shows a "Connect with TikTok" button that starts the
// Login Kit OAuth flow. client_key is not secret — it is always sent to the
// browser as part of the authorize URL, unlike client_secret.
export default function handler(req, res) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || '';
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const scope = 'user.info.basic,video.upload';

  const authorizeUrl =
    `https://www.tiktok.com/v2/auth/authorize/` +
    `?client_key=${encodeURIComponent(clientKey)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  const configured = clientKey && redirectUri;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ASSUR MX · Conectar con TikTok</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F7F6F2;color:#28251D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#fff;border:1px solid #D4D1CA;border-radius:14px;padding:40px 36px;max-width:440px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.06);}
  h1{font-size:21px;margin:0 0 10px;color:#171614;}
  p{font-size:15px;line-height:1.55;color:#5c5a54;margin:0 0 24px;}
  a.btn{display:inline-block;background:#01696F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;}
  a.btn[aria-disabled="true"]{background:#BAB9B4;pointer-events:none;}
  .foot{margin-top:22px;font-size:12px;color:#a4a29c;}
</style>
</head>
<body>
  <div class="card">
    <h1>ASSUR MX</h1>
    <p>Conecta la cuenta de TikTok de ASSUR para publicar contenido educativo sobre drenaje pluvial y gestión del agua directamente desde nuestro flujo de trabajo.</p>
    ${
      configured
        ? `<a class="btn" href="${authorizeUrl}">Conectar con TikTok</a>`
        : `<a class="btn" aria-disabled="true" href="#">Configuración pendiente</a>`
    }
    <div class="foot">assur.mx</div>
  </div>
</body>
</html>`);
}
