// Admin-only endpoint to retrieve the last stored TikTok token record.
// Protected by a shared secret so the raw tokens never appear in the
// browser or in TikTok's own UI. Call with header: x-admin-secret: <ADMIN_SECRET>
export default async function handler(req, res) {
  const provided = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    res.status(200).json({ configured: false, record: null });
    return;
  }

  const kvRes = await fetch(`${url}/get/tiktok:tokens`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await kvRes.json();
  res.status(200).json({ configured: true, record: data.result ? JSON.parse(data.result) : null });
}
