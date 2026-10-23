// formulario · el formulario de onboarding de cada cliente (migración 047)
//
// La página del portal (portal/formulario.html) habla SOLO con esta función.
// El cliente no tiene cuenta: trae un código en el link y acá se compara su
// sha256 contra `formularios_onboarding.token_sha256`. El código es de 40
// caracteres o, desde el 23/10/2026, corto: «savia-k7Qm2xPa», el nombre del
// cliente para que el link se lea y 8 al azar atrás, que son la llave (con
// el nombre solo, cualquiera que pruebe /savia entraría a sus respuestas). Con
// eso se lee y se escribe ÚNICAMENTE ese formulario, con la service key, que
// nunca sale de acá. Las tablas no tienen policies para `anon` a propósito.
//
// Acciones (POST JSON, siempre con `t` = el código):
//   leer       → el formulario (título, intro, bloques) y lo ya respondido
//   guardar    → el texto o la opción de una pregunta
//   subir      → una URL firmada para subir un audio o un archivo al bucket
//   confirmar  → anota el audio o archivo ya subido en su pregunta
//   quitar     → saca un audio o archivo de su pregunta (y lo borra)
//   enviar     → lo marca completo
//
// Desplegar sin verificación de JWT: la entrada es pública y el código es la
// llave.   supabase functions deploy formulario --no-verify-jwt

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'formularios';
const MAX_BYTES = 50 * 1024 * 1024;
const MIME_OK = /^(audio\/|image\/|video\/|application\/pdf|text\/|application\/vnd\.|application\/msword|application\/zip|application\/octet-stream)/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = (path: string, init: RequestInit = {}) =>
  fetch(SB_URL + path, {
    ...init,
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Las preguntas válidas salen del propio formulario: nadie puede escribir una
// respuesta a una pregunta que no está en su formulario.
function preguntas(bloques: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const b of bloques || []) for (const p of (b && b.preguntas) || []) if (p && p.id) out[String(p.id)] = p;
  return out;
}

const limpio = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo';

async function formularioDe(t: string) {
  const ok = /^[A-Za-z0-9]{40}$/.test(t || '') ||
    (/^[a-z0-9]+(-[a-z0-9]+)*-[A-Za-z0-9]{8}$/.test(t || '') && t.length <= 60);
  if (!ok) return null;
  const h = await sha256(t);
  const r = await admin('/rest/v1/formularios_onboarding?select=*&token_sha256=eq.' + h);
  const f = r.ok ? (await r.json())[0] : null;
  if (!f || f.estado === 'apagado') return null;
  return f;
}

async function respuestaDe(fid: string, pid: string) {
  const r = await admin('/rest/v1/formularios_respuestas?select=*&formulario_id=eq.' + fid + '&pregunta_id=eq.' + encodeURIComponent(pid));
  return r.ok ? (await r.json())[0] || null : null;
}

async function upsertRespuesta(fid: string, pid: string, campos: Record<string, unknown>) {
  const r = await admin('/rest/v1/formularios_respuestas?on_conflict=formulario_id,pregunta_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ formulario_id: fid, pregunta_id: pid, ...campos, actualizado_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('no pude guardar (' + r.status + '): ' + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}

async function tocar(f: any, extra: Record<string, unknown> = {}) {
  const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString(), ...extra };
  if (f.estado === 'enviado' || f.estado === 'borrador') { if (!('estado' in extra)) cambios.estado = f.estado === 'enviado' ? 'en_curso' : f.estado; }
  await admin('/rest/v1/formularios_onboarding?id=eq.' + f.id, { method: 'PATCH', body: JSON.stringify(cambios) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'usá POST' }, 405);
  let b: any = {};
  try { b = await req.json(); } catch (_e) { return json({ error: 'pedido mal armado' }, 400); }

  const f = await formularioDe(String(b.t || ''));
  // Un solo mensaje para «no existe» y «está apagado»: no le dice nada al que prueba códigos.
  if (!f) return json({ error: 'Este link no es válido o ya no está activo. Pedile uno nuevo a tu CSM.' }, 404);
  const ps = preguntas(f.bloques);
  const accion = String(b.accion || 'leer');

  try {
    if (accion === 'leer') {
      if (!f.abierto_at) await admin('/rest/v1/formularios_onboarding?id=eq.' + f.id, { method: 'PATCH', body: JSON.stringify({ abierto_at: new Date().toISOString() }) });
      const r = await admin('/rest/v1/formularios_respuestas?select=pregunta_id,texto,opcion,audios,archivos&formulario_id=eq.' + f.id);
      const filas = r.ok ? await r.json() : [];
      const resp: Record<string, unknown> = {};
      for (const x of filas) resp[x.pregunta_id] = { texto: x.texto, opcion: x.opcion, audios: x.audios, archivos: x.archivos };
      return json({ ok: true, titulo: f.titulo, intro: f.intro, bloques: f.bloques, estado: f.estado, completado_at: f.completado_at, respuestas: resp });
    }

    const pid = String(b.pregunta_id || '');
    if (accion !== 'enviar' && !ps[pid]) return json({ error: 'esa pregunta no está en este formulario' }, 400);

    if (accion === 'guardar') {
      const campos: Record<string, unknown> = {};
      if ('texto' in b) campos.texto = b.texto == null ? null : String(b.texto).slice(0, 8000);
      if ('opcion' in b) campos.opcion = b.opcion == null ? null : String(b.opcion).slice(0, 300);
      const x = await upsertRespuesta(f.id, pid, campos);
      await tocar(f);
      return json({ ok: true, actualizado_at: x.actualizado_at });
    }

    if (accion === 'subir') {
      const tipo = b.tipo === 'audio' ? 'audio' : 'archivo';
      const tam = Number(b.tam || 0), mime = String(b.mime || 'application/octet-stream');
      if (!(tam > 0) || tam > MAX_BYTES) return json({ error: 'El archivo pasa de 50 MB. Probá con uno más liviano.' }, 400);
      if (!MIME_OK.test(mime)) return json({ error: 'Ese tipo de archivo no se puede subir.' }, 400);
      const path = f.id + '/' + pid + '/' + Date.now() + '-' + (tipo === 'audio' ? 'audio' : limpio(String(b.nombre || '')));
      const r = await admin('/storage/v1/object/upload/sign/' + BUCKET + '/' + path, { method: 'POST', body: '{}' });
      if (!r.ok) return json({ error: 'no pude preparar la subida (' + r.status + ')' }, 502);
      const d = await r.json();
      return json({ ok: true, path, url: SB_URL + '/storage/v1' + d.url });
    }

    if (accion === 'confirmar') {
      const tipo = b.tipo === 'audio' ? 'audio' : 'archivo';
      const path = String(b.path || '');
      if (!path.startsWith(f.id + '/' + pid + '/')) return json({ error: 'ruta inválida' }, 400);
      // Se anota solo lo que de verdad llegó al bucket.
      const h = await admin('/storage/v1/object/info/' + BUCKET + '/' + path, { method: 'GET' });
      if (!h.ok) return json({ error: 'el archivo no terminó de subir; probá de nuevo' }, 409);
      const prev = (await respuestaDe(f.id, pid)) || {};
      const item: Record<string, unknown> = { path, at: new Date().toISOString(), tam: Number(b.tam || 0) || null };
      if (tipo === 'audio') item.seg = Number(b.seg || 0) || null; else item.nombre = String(b.nombre || '').slice(0, 120);
      const lista = [...((tipo === 'audio' ? prev.audios : prev.archivos) || []), item].slice(-20);
      const x = await upsertRespuesta(f.id, pid, tipo === 'audio' ? { audios: lista } : { archivos: lista });
      await tocar(f);
      return json({ ok: true, audios: x.audios, archivos: x.archivos });
    }

    if (accion === 'quitar') {
      const path = String(b.path || '');
      if (!path.startsWith(f.id + '/' + pid + '/')) return json({ error: 'ruta inválida' }, 400);
      const prev = (await respuestaDe(f.id, pid)) || {};
      const sacar = (l: any[]) => (l || []).filter((x) => x && x.path !== path);
      const x = await upsertRespuesta(f.id, pid, { audios: sacar(prev.audios), archivos: sacar(prev.archivos) });
      await admin('/storage/v1/object/' + BUCKET, { method: 'DELETE', body: JSON.stringify({ prefixes: [path] }) });
      return json({ ok: true, audios: x.audios, archivos: x.archivos });
    }

    if (accion === 'enviar') {
      await tocar(f, { estado: 'completo', completado_at: new Date().toISOString() });
      return json({ ok: true });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
