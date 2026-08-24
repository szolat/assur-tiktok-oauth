export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'assur-tiktok-oauth',
    time: new Date().toISOString(),
    configured: {
      client_key: Boolean(process.env.TIKTOK_CLIENT_KEY),
      client_secret: Boolean(process.env.TIKTOK_CLIENT_SECRET),
      redirect_uri: Boolean(process.env.TIKTOK_REDIRECT_URI),
      kv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    },
  });
}
