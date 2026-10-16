// Content Posting API — "Upload" mode (scope video.upload).
// The video is sent to the connected account's TikTok inbox as a draft; the
// creator finishes caption/edits and publishes inside the TikTok app.
//   GET  /api/upload                       -> upload page (requires session)
//   POST /api/upload?action=init  {size}   -> init upload, returns publish_id + upload_url
//   PUT  /api/upload?action=put&url=...    -> server relay of the file bytes (files <= 4 MB)
//   POST /api/upload?action=status {publish_id} -> publish status
import { esc, getSession, page } from './_lib.js';

const API = 'https://open.tiktokapis.com/v2/post/publish';
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

async function tiktok(path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  const err = data.error && data.error.code && data.error.code !== 'ok' ? data.error : null;
  return { ok: r.ok && !err, status: r.status, data: data.data || {}, error: err };
}

function uploadPage(session) {
  const avatar = session.avatar_url ? `<img src="${esc(session.avatar_url)}" alt="Foto de perfil" />` : '';
  return page(
    'Subir video a TikTok',
    `<h1>Subir video a TikTok</h1>
     <div class="user">${avatar}<strong>${esc(session.display_name || 'Cuenta de TikTok')}</strong></div>
     <p>Elige un video MP4 o MOV terminado. Llegará a la bandeja de borradores de TikTok de esta cuenta para que agregues el texto y lo publiques desde la app.</p>
     <input id="file" type="file" accept="video/mp4,video/quicktime" />
     <button id="go" class="btn" disabled>Subir a TikTok</button>
     <div id="st" class="status" role="status" aria-live="polite"></div>
     <p style="margin-top:18px"><a class="link" href="/">Volver al inicio</a></p>
     <script>
     const f=document.getElementById('file'), b=document.getElementById('go'), st=document.getElementById('st');
     const say=(t,c)=>{st.textContent=t;st.className='status '+(c||'');};
     f.onchange=()=>{b.disabled=!f.files.length; if(f.files.length) say(f.files[0].name+' · '+(f.files[0].size/1048576).toFixed(1)+' MB');};
     async function poll(id){
       for(let i=0;i<20;i++){
         const r=await fetch('/api/upload?action=status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publish_id:id})}).then(r=>r.json());
         if(r.status==='SEND_TO_USER_INBOX'||r.status==='PUBLISH_COMPLETE'){say('Listo. El video ya está en tu bandeja de TikTok: abre la app, revisa la notificación y publícalo.','ok');return;}
         if(r.status==='FAILED'){say('TikTok rechazó el video: '+(r.fail_reason||'sin detalle'),'err');return;}
         say('Procesando en TikTok… ('+(r.status||'en espera')+')');
         await new Promise(s=>setTimeout(s,3000));
       }
       say('TikTok sigue procesando el video. Revisa la bandeja de la app en unos minutos.');
     }
     b.onclick=async()=>{
       const file=f.files[0]; if(!file) return; b.disabled=true;
       try{
         say('Preparando la subida…');
         const init=await fetch('/api/upload?action=init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:file.size})}).then(r=>r.json());
         if(!init.upload_url) throw new Error(init.error||'No se pudo iniciar la subida.');
         say('Subiendo video…');
         const headers={'Content-Type':file.type||'video/mp4','Content-Range':'bytes 0-'+(file.size-1)+'/'+file.size};
         let put;
         try{ put=await fetch(init.upload_url,{method:'PUT',headers,body:file}); }
         catch(e){
           if(file.size>4*1024*1024) throw new Error('El navegador no pudo enviar el archivo directo a TikTok. Prueba con un video de menos de 4 MB.');
           put=await fetch('/api/upload?action=put&url='+encodeURIComponent(init.upload_url),{method:'PUT',headers,body:file});
         }
         if(!put.ok) throw new Error('TikTok respondió '+put.status+' al recibir el archivo.');
         await poll(init.publish_id);
       }catch(e){ say(e.message,'err'); b.disabled=false; }
     };
     </script>`
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  const action = req.query.action;

  if (!action) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!session) {
      res.status(401).send(page('Conecta tu cuenta', `<h1>Primero conecta TikTok</h1><p>La sesión no existe o expiró.</p><a class="btn" href="/">Conectar con TikTok</a>`));
      return;
    }
    res.status(200).send(uploadPage(session));
    return;
  }

  if (!session) { res.status(401).json({ error: 'Sesión expirada. Vuelve a conectar TikTok.' }); return; }

  try {
    if (action === 'init' && req.method === 'POST') {
      const { size } = await readJson(req);
      const videoSize = Number(size);
      if (!videoSize || videoSize > MAX_SINGLE_CHUNK) {
        res.status(400).json({ error: 'El video debe pesar entre 1 byte y 64 MB.' });
        return;
      }
      const r = await tiktok('/inbox/video/init/', session.access_token, {
        source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: videoSize, total_chunk_count: 1 },
      });
      if (!r.ok) { res.status(502).json({ error: (r.error && r.error.message) || `TikTok respondió ${r.status}` }); return; }
      res.status(200).json({ publish_id: r.data.publish_id, upload_url: r.data.upload_url });
      return;
    }

    if (action === 'put' && req.method === 'PUT') {
      const target = new URL(String(req.query.url || ''));
      if (target.protocol !== 'https:' || !target.hostname.endsWith('.tiktokapis.com')) {
        res.status(400).json({ error: 'URL de subida no válida.' });
        return;
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const up = await fetch(target, {
        method: 'PUT',
        headers: {
          'Content-Type': req.headers['content-type'] || 'video/mp4',
          'Content-Length': String(body.length),
          'Content-Range': req.headers['content-range'] || `bytes 0-${body.length - 1}/${body.length}`,
        },
        body,
      });
      res.status(up.ok ? 200 : 502).json({ ok: up.ok, status: up.status });
      return;
    }

    if (action === 'status' && req.method === 'POST') {
      const { publish_id: publishId } = await readJson(req);
      const r = await tiktok('/status/fetch/', session.access_token, { publish_id: String(publishId || '') });
      res.status(r.ok ? 200 : 502).json({ status: r.data.status, fail_reason: r.data.fail_reason, error: r.error && r.error.message });
      return;
    }

    res.status(405).json({ error: 'Acción no permitida.' });
  } catch (err) {
    console.error('upload error:', err);
    res.status(500).json({ error: err.message || 'Error inesperado.' });
  }
}
