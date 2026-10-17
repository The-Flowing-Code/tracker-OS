// ============================================================
//  ghl-api — la app le pide algo a GoHighLevel SIN tener el token (17/10/2026)
//
//  Fase 3 del plan del 23/09, igual que la funcion `meta`: la app manda la
//  ruta de la API de GHL y el id del cliente; aca se busca el token en
//  `tokens_clientes` (041, tabla cerrada) y se hace el pedido.
//
//  A diferencia de Meta, la app SI escribe en GHL (actualiza contactos, crea
//  campos para el A/B), asi que se aceptan GET, POST, PUT y DELETE. Siempre y
//  solo contra services.leadconnectorhq.com, y solo para una sesion con rol
//  agencia o la clave de servicio: lo mismo que ya podia hacer quien tenia el
//  token en el navegador, sin que el token salga de aca.
//
//  No reemplaza a la funcion `GHL`, que usan tambien las landings de los
//  clientes para reservar turnos: esa queda como esta.
// ============================================================

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://services.leadconnectorhq.com";

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

// Mismo criterio que `meta`: una sincronizacion hace muchos pedidos seguidos,
// asi que la sesion verificada y el token se recuerdan unos minutos.
const SESIONES = new Map<string, number>();
const TOKENS = new Map<string, { t: string; at: number }>();

async function tokenDe(cid: string) {
  const c = TOKENS.get(cid);
  if (c && Date.now() - c.at < 60_000) return c.t;
  const f = await sb("tokens_clientes?select=ghl_token&cliente_id=eq." + cid);
  const t = Array.isArray(f) && f[0] && f[0].ghl_token ? String(f[0].ghl_token) : "";
  if (t) TOKENS.set(cid, { t, at: Date.now() });
  return t;
}

async function esAgencia(req: Request) {
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tk) return false;
  const vista = SESIONES.get(tk);
  if (vista && vista > Date.now()) return true;
  let ok = false;
  if (tk === SB_KEY) ok = true;
  else {
    // Otra clave de nivel servicio (la de los scripts): lee la tabla cerrada.
    const s = await fetch(SB_URL + "/rest/v1/tokens_clientes?select=cliente_id&limit=1",
      { headers: { apikey: tk, Authorization: "Bearer " + tk } }).catch(() => null);
    if (s && s.ok) ok = true;
    else {
      const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + tk } });
      if (u.ok) {
        const yo = await u.json();
        if (yo && yo.id) {
          const p = await sb("perfiles?select=rol&user_id=eq." + encodeURIComponent(yo.id));
          ok = Array.isArray(p) && p[0] && p[0].rol === "agencia";
        }
      }
    }
  }
  if (ok) SESIONES.set(tk, Date.now() + 5 * 60_000);
  return ok;
}

const METODOS = new Set(["GET", "POST", "PUT", "DELETE"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Solo POST." }, 405);

  let b: any;
  try { b = await req.json(); } catch { return responder({ error: "JSON invalido" }, 400); }
  const cid = String(b?.cliente_id || "").replace(/\D/g, "");
  const metodo = String(b?.metodo || "GET").toUpperCase();
  const ruta = String(b?.ruta || "");
  if (!cid) return responder({ error: "Falta el cliente." }, 400);
  if (!METODOS.has(metodo)) return responder({ error: "Metodo no permitido." }, 400);
  // Solo una ruta de la API: empieza con "/", sin saltar a otro host.
  if (!/^\/[A-Za-z0-9]/.test(ruta) || ruta.includes("//") || /^\/\\/.test(ruta)) return responder({ error: "Ruta invalida." }, 400);

  const [ok, token] = await Promise.all([esAgencia(req).catch(() => false), tokenDe(cid).catch(() => "")]);
  if (!ok) return responder({ error: "Sin permiso." }, 403);
  if (!token) return responder({ error: "Ese cliente no tiene token de GHL cargado." }, 404);

  const h: Record<string, string> = {
    Authorization: "Bearer " + token,
    Version: String(b?.version || "2021-07-28"),
    Accept: "application/json",
    // Sin esto GHL contesta 403 a pedidos que no parecen de un navegador.
    "User-Agent": "Mozilla/5.0",
  };
  const init: RequestInit = { method: metodo, headers: h };
  if (metodo !== "GET" && b?.cuerpo !== undefined && b?.cuerpo !== null) {
    h["Content-Type"] = "application/json";
    init.body = typeof b.cuerpo === "string" ? b.cuerpo : JSON.stringify(b.cuerpo);
  }
  const r = await fetch(API + ruta, init);
  let cuerpo = await r.text();
  cuerpo = cuerpo.split(token).join("cli:" + cid);
  return responder({ status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" }, body: cuerpo });
});
