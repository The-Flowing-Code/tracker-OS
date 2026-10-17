// ============================================================
//  meta — la app le pide algo a Meta Ads SIN tener el token (17/10/2026)
//
//  Fase 3 del plan del 23/09: los tokens de los clientes salen del
//  navegador. La app manda la URL de la Graph API sin token y el id del
//  cliente; aca se busca el token en `tokens_clientes` (041, tabla cerrada),
//  se llama a Meta y se devuelve la respuesta tal cual: estado, cuerpo y los
//  encabezados de uso, que la app lee para frenar antes del limite.
//
//  ⚠️  SOLO LECTURA. Solo GET a graph.facebook.com. La app no escribe en Meta
//  (medido el 17/10: las 13 llamadas son GET), y si algun dia hace falta, se
//  agrega aparte y a proposito.
//
//  ⚠️  EL TOKEN NUNCA VUELVE AL NAVEGADOR. Meta devuelve los links de
//  "pagina siguiente" con el token adentro: se reemplaza por `cli:<id>` antes
//  de responder. La app reconoce esa marca y vuelve a pasar por aca.
//
//  Quien llama: una sesion del tracker con rol agencia (Verify JWT prendido
//  y se mira `perfiles`), o la service key (scripts y pruebas).
// ============================================================

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sb(ruta: string) {
  const r = await fetch(SB_URL + "/rest/v1/" + ruta, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
  if (!r.ok) throw new Error("base " + r.status);
  return await r.json();
}

// Rol agencia, mirado del lado del servidor: el JWT dice quien es, `perfiles`
// dice que puede.
async function esAgencia(req: Request) {
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tk) return false;
  if (tk === SB_KEY) return true;
  // Otra clave de nivel servicio (los scripts usan la del Llavero, que puede
  // tener otro formato que la de este entorno): si con ella se lee la tabla
  // cerrada, es del servicio. Ninguna sesion de persona puede leerla.
  if (!tk.startsWith("eyJ") || tk.split(".").length !== 3 || !tk.includes("service_role")) {
    const s = await fetch(SB_URL + "/rest/v1/tokens_clientes?select=cliente_id&limit=1",
      { headers: { apikey: tk, Authorization: "Bearer " + tk } });
    if (s.ok) return true;
  }
  const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + tk } });
  if (!u.ok) return false;
  const yo = await u.json();
  if (!yo || !yo.id) return false;
  const p = await sb("perfiles?select=rol&user_id=eq." + encodeURIComponent(yo.id));
  return Array.isArray(p) && p[0] && p[0].rol === "agencia";
}

// Los encabezados de uso que la app anota (ver _metaUsoDeCabeceras).
const USO = ["x-business-use-case-usage", "x-app-usage", "x-ad-account-usage", "content-type"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Solo POST." }, 405);
  if (!(await esAgencia(req).catch(() => false))) return responder({ error: "Sin permiso." }, 403);

  let b: any;
  try { b = await req.json(); } catch { return responder({ error: "JSON invalido" }, 400); }
  const cid = String(b?.cliente_id || "").replace(/\D/g, "");
  let url: URL;
  try { url = new URL(String(b?.url || "")); } catch { return responder({ error: "URL invalida" }, 400); }
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com" || !/^\/v\d+\.\d+\//.test(url.pathname)) {
    return responder({ error: "Solo la Graph API de Meta." }, 400);
  }
  if (!cid) return responder({ error: "Falta el cliente." }, 400);

  const f = await sb("tokens_clientes?select=meta_token&cliente_id=eq." + cid);
  const token = Array.isArray(f) && f[0] && f[0].meta_token;
  if (!token) return responder({ error: "Ese cliente no tiene token de Meta cargado." }, 404);

  url.searchParams.delete("access_token");
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), { method: "GET" });
  let cuerpo = await r.text();
  // El token no vuelve: los links de paginacion salen con la marca del cliente.
  cuerpo = cuerpo.split(token).join("cli:" + cid).split(encodeURIComponent(token)).join("cli:" + cid);
  const enc: Record<string, string> = {};
  USO.forEach((h) => { const v = r.headers.get(h); if (v) enc[h] = v; });
  return responder({ status: r.status, headers: enc, body: cuerpo });
});
