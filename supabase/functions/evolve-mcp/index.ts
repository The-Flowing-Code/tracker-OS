// ============================================================
//  Evolve OS · consulta — servidor MCP de SOLO LECTURA (17/10/2026)
//
//  Para que el Claude de cada persona del equipo (empezando por Santi) tenga
//  el mismo contexto que el de Angie: las llamadas de todos, con su
//  transcripcion, y en que anda cada cliente. Sin la clave maestra.
//
//  20/10/2026: dos escrituras mas, solo para claves con alcance.tareas='escribir'
//  (Santi, el CSM): crear_tarea y cambiar_estado_tarea. Suman a una lista; no
//  borran ni pisan nada (migracion 045).
//
//  03/11/2026 (v1.2.0): dos lecturas para el feedback comercial con el SOP
//  «Anti-Fugazi B2B»: sop_comercial (el texto vigente) y leer_conversaciones
//  (los chats de WhatsApp/SMS de los leads del embudo de un cliente, leidos de
//  su GHL con su token DEL LADO DEL SERVIDOR; solo con alcance.conversaciones='leer').
//
//  03/11/2026 (v1.3.0): las rutinas de mensajes pasan a la Mac de Santi y
//  corren con su conector, sin la clave maestra. Con alcance.mensajes='escribir':
//  guardar_mensajes_dia, guardar_parte (borradores; nada se le manda a nadie) y
//  leer_mensajes_estado. Con alcance.campanas='leer': estado_anuncios (Meta con
//  el token del cliente DEL LADO DEL SERVIDOR, como leer_conversaciones).
//
//  10/11/2026 (v1.4.0): con alcance.tareas='escribir', cargar_dataset: carga o
//  corrige el link del dataset de la ficha (set_oferta_estado), sin pisar el resto.
//
//  ⚠️  NADA DE ACA CAMBIA LA APP NI LOS CLIENTES (salvo lo de arriba). Es a proposito, y es lo que
//  lo hace seguro: aunque a ese Claude le pidan "borra tal cosa", aca no
//  existe con que. La UNICA escritura es `pedir_cambio_app` (17/10/2026): deja
//  un pedido en la cola de agente_pedidos, igual que "Nueva tarea -> Evolve
//  OS" en el tracker. Ese pedido no hace nada solo: lo revisa la rutina
//  cambios-sistema y se hace recien si Angie lo aprueba.
//
//  ⚠️  DE UN CLIENTE SALE SOLO UNA LISTA CERRADA DE CAMPOS. `datos` guarda
//  tokens de Meta, GHL y Google: se arma la respuesta campo por campo en vez
//  de sacar los peligrosos, para que un campo nuevo no salga solo.
//
//  Entrada: la clave de cada persona va en el link del conector
//    https://<proyecto>.supabase.co/functions/v1/evolve-mcp/<clave>
//  (claude.ai no deja agregar encabezados a un conector propio). Tambien
//  acepta "Authorization: Bearer <clave>" para Claude Code. Se compara el
//  sha256 contra `mcp_claves` (migracion 040) y se anota cada consulta en
//  `mcp_registro`.
//
//  Se despliega con "Verify JWT" APAGADO: quien llama es claude.ai, no una
//  sesion del tracker. La puerta es la clave.
// ============================================================

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const JSONH = { "Content-Type": "application/json" };
const responder = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: JSONH });

async function sb(ruta: string, init: RequestInit = {}) {
  const r = await fetch(SB_URL + "/rest/v1/" + ruta, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { /* sin cuerpo */ }
  if (!r.ok) throw new Error("base " + r.status + ": " + t.slice(0, 200));
  return d;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Lo que se escribe en un filtro de PostgREST no puede traer los caracteres de
// su sintaxis: con una coma o un parentesis se podria armar otro filtro.
const limpio = (s: unknown) =>
  String(s ?? "").replace(/[^\p{L}\p{N} @._\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const fecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "";

type Clave = { id: number; persona: string; alcance: any };

async function quienEs(req: Request): Promise<Clave | null> {
  const u = new URL(req.url);
  const seg = u.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("evolve-mcp");
  let k = i >= 0 ? (seg[i + 1] || "") : "";
  if (!k) k = u.searchParams.get("k") || "";
  if (!k) k = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(k)) return null;
  const h = await sha256(k);
  const f = await sb("mcp_claves?select=id,persona,alcance&activa=eq.true&hash=eq." + h);
  return Array.isArray(f) && f[0] ? f[0] : null;
}

/* ── Clientes ─────────────────────────────────────────────────────────── */
async function filasClientes(campos: string, filtro = "") {
  return (await sb("clientes?select=id," + campos + "&order=id" + filtro)) || [];
}
// Los de la cartera de esa persona, si su alcance lo pide. null = todos.
async function idsCartera(c: Clave): Promise<Set<string> | null> {
  const a = c.alcance || {};
  if (a.clientes !== "cartera" && a.llamadas !== "cartera") return null;
  const mail = String(a.email || "").toLowerCase();
  const f = await filasClientes("o:datos->>owner");
  return new Set(f.filter((x: any) => String(x.o || "").toLowerCase() === mail).map((x: any) => String(x.id)));
}

function proximaCita(citas: any) {
  const ahora = Date.now();
  let mejor: any = null;
  for (const [etapa, x] of Object.entries(citas || {})) {
    const v: any = x;
    const t = Date.parse(v?.inicio || "");
    if (!isNaN(t) && t > ahora && (!mejor || t < mejor.t)) mejor = { t, etapa, inicio: v.inicio, con: v.deNuestroLado || "" };
  }
  return mejor ? { etapa: mejor.etapa, inicio: mejor.inicio, con: mejor.con } : null;
}

// La lista cerrada. Lo que no esta aca no sale, aunque exista en `datos`.
function fichaSegura(id: string, d: any, m: any) {
  d = d || {}; m = m || {};
  const citas: any[] = [];
  for (const [etapa, x] of Object.entries(d.citas || {})) {
    const v: any = x;
    citas.push({ etapa, inicio: v?.inicio || "", titulo: v?.titulo || "", con: v?.deNuestroLado || "", estado: v?.estado || "" });
  }
  const tareas = (Array.isArray(d.tasks) ? d.tasks : [])
    .filter((t: any) => t && !t.deleted && !t.archivada)
    .slice(0, 40)
    .map((t: any) => ({ texto: String(t.text || "").slice(0, 300), estado: t.estado || (t.done ? "finalizada" : "abierta"),
                         responsable: t.responsible || "", vence: t.due || "", ticket: t.ticket || "" }));
  const equipo = (Array.isArray(d.equipo) ? d.equipo : []).map((p: any) =>
    typeof p === "string" ? { nombre: p } : { nombre: p?.nombre || "", mail: p?.email || p?.mail || "" });
  const llamadas = (Array.isArray(d.fathomCalls) ? d.fathomCalls : []).slice(-15)
    .map((l: any) => ({ titulo: l?.title || "", fecha: l?.date || "", url: l?.url || "" }));
  const oferta = m.oferta || d.oferta;
  const rep = m.reporteCampana || d.reporteCampana;
  const cambios = ((m.cambiosPropuestos || {}).items || []).slice(0, 20)
    .map((x: any) => ({ texto: x?.texto || "", porque: x?.porque || "" }));
  return {
    id, nombre: d.name || "", responsable: d.owner || "", producto: d.producto || "",
    contacto: d.contacto || "", mail: d.email || "", telefono: d.phone || "",
    rubro: d.industry || "", web: d.web || "", alta: d.altaAt || "",
    archivado: !!d.archived, prospecto: !!d.prospecto,
    que_hace: d.queHace || d.que_hace || "", acordado: d.acordado || "",
    equipo, reuniones: citas, proxima_reunion: proximaCita(d.citas),
    etapas_agendadas: d.rutaAgenda || {}, etapas_hechas: d.rutaHechas || {},
    tareas, llamadas_cargadas: llamadas,
    oferta: oferta ? { estado: oferta.estado || "", texto: oferta.texto || "", link: oferta.url || "" } : null,
    reporte_campana: rep && rep.url ? rep.url : "",
    cambios_propuestos: cambios,
  };
}

async function listarClientes(c: Clave, a: any) {
  const cart = (c.alcance || {}).clientes === "cartera" ? await idsCartera(c) : null;
  const f = await filasClientes("n:datos->>name,o:datos->>owner,p:datos->>producto,ar:datos->>archived,pr:datos->>prospecto,al:datos->>altaAt,ci:datos->citas");
  const prod = limpio(a?.producto).toLowerCase();
  return f.filter((x: any) => {
    if (cart && !cart.has(String(x.id))) return false;
    if (!a?.incluir_archivados && x.ar === "true" && x.pr !== "true") return false;
    if (!a?.incluir_prospectos && x.pr === "true") return false;
    if (prod && String(x.p || "").toLowerCase().indexOf(prod) < 0) return false;
    return !!x.n;
  }).map((x: any) => ({ id: String(x.id), nombre: x.n, responsable: x.o || "", producto: x.p || "",
    prospecto: x.pr === "true", archivado: x.ar === "true", alta: x.al || "", proxima_reunion: proximaCita(x.ci) }));
}

// Sin tildes, sin mayusculas y sin letras dobles: una llamada titulada con el
// nombre mal escrito tiene que encontrar al cliente igual.
const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/(.)\1+/g, "$1").replace(/\s+/g, " ").trim();

async function buscarClienteIds(c: Clave, nombre: string) {
  const n = limpio(nombre);
  if (!n) return [];
  const cart = (c.alcance || {}).clientes === "cartera" ? await idsCartera(c) : null;
  const f = await filasClientes("n:datos->>name,ct:datos->>contacto");
  const q = norm(n);
  return f.filter((x: any) => {
    if (cart && !cart.has(String(x.id))) return false;
    if (String(x.id) === n) return true;
    const k = norm(x.n);
    return !!k && (k.includes(q) || q.includes(k));
  }).map((x: any) => ({ id: String(x.id), nombre: x.n, contacto: x.ct || "" }));
}

async function verCliente(c: Clave, a: any) {
  const ids = await buscarClienteIds(c, a?.cliente);
  if (!ids.length) return { error: "No encontré ningún cliente que se llame así (o no está en tu alcance)." };
  if (ids.length > 1 && !ids.some((x) => x.nombre.toLowerCase() === limpio(a?.cliente).toLowerCase()))
    return { varios: ids.slice(0, 15), nota: "Hay varios: pedí uno por su nombre completo o su id." };
  const elegido = ids.find((x) => x.nombre.toLowerCase() === limpio(a?.cliente).toLowerCase()) || ids[0];
  const f = await sb("clientes?select=id,datos,maquina&id=eq." + elegido.id);
  return f && f[0] ? fichaSegura(String(f[0].id), f[0].datos, f[0].maquina) : { error: "No pude leer ese cliente." };
}

/* ── Llamadas ─────────────────────────────────────────────────────────── */
async function nombresDe(ids: string[]) {
  const u = Array.from(new Set(ids.filter((x) => /^\d+$/.test(x))));
  if (!u.length) return {} as Record<string, string>;
  const f = await filasClientes("n:datos->>name", "&id=in.(" + u.join(",") + ")");
  const m: Record<string, string> = {};
  f.forEach((x: any) => { m[String(x.id)] = x.n || ""; });
  return m;
}

async function buscarLlamadas(c: Clave, a: any) {
  const lim = Math.max(1, Math.min(50, parseInt(a?.limite, 10) || 15));
  const COLS = "recording_id,titulo,fecha,duracion,grabo_nombre,url,resumen,cliente_id";
  // Filtros que valen para cualquier consulta. Cada grupo "o esto o aquello" va
  // dentro de un and=(), porque dos or= en la misma consulta se pisan.
  const grupos: string[] = [];
  const resto: string[] = [];
  if (a?.persona) { const p = limpio(a.persona); if (p) grupos.push("or(grabo_nombre.ilike.*" + p + "*,grabo_mail.ilike.*" + p + "*,transcripcion.ilike.*" + p + "*)"); }
  if (a?.texto) { const t = limpio(a.texto); if (t) grupos.push("or(titulo.ilike.*" + t + "*,resumen.ilike.*" + t + "*,transcripcion.ilike.*" + t + "*)"); }
  const d0 = fecha(a?.desde), d1 = fecha(a?.hasta);
  if (d0) resto.push("fecha=gte." + d0);
  if (d1) resto.push("fecha=lte." + d1 + "T23:59:59");
  const consulta = (extra: string[], limite: number) => {
    const g = grupos.concat(extra);
    let q = "llamadas_fathom?select=" + COLS + "&order=fecha.desc&limit=" + limite;
    if (g.length) q += "&and=" + encodeURIComponent("(" + g.join(",") + ")");
    if (resto.length) q += "&" + resto.join("&");
    return sb(q);
  };
  let f: any[] = [];
  if (a?.cliente) {
    const cl = await buscarClienteIds(c, a.cliente);
    // Por cliente asociado, y por titulo: muchas llamadas no quedaron asociadas
    // y el titulo puede estar mal escrito. Se trae ancho por un pedazo de la
    // palabra mas larga y se filtra aca con `norm`.
    const nombres = cl.length ? cl.map((x) => x.nombre) : [limpio(a.cliente)];
    const contactos = cl.map((x) => String(x.contacto || "").split(" ")[0]).filter((x) => x.length >= 4);
    const claves = nombres.map((n) => norm(n).split(" ").sort((p, q) => q.length - p.length)[0]).filter((x) => x && x.length >= 3);
    const porId = cl.length ? await consulta(["cliente_id.in.(" + cl.map((x) => x.id).join(",") + ")"], lim) : [];
    const anchos: any[] = [];
    for (const k of claves.concat(contactos.map(norm))) {
      const r = await consulta(["titulo.ilike.*" + limpio(k.slice(0, 3)) + "*"], 200);
      (r || []).forEach((x: any) => { if (norm(x.titulo).includes(k)) anchos.push(x); });
    }
    const vistos = new Set<string>();
    f = (porId || []).concat(anchos).filter((x: any) => {
      const id = String(x.recording_id); if (vistos.has(id)) return false; vistos.add(id); return true;
    }).sort((x: any, y: any) => String(y.fecha).localeCompare(String(x.fecha))).slice(0, lim);
  } else {
    f = (await consulta([], lim)) || [];
  }
  if ((c.alcance || {}).llamadas === "cartera") {
    const cart = await idsCartera(c);
    f = f.filter((x: any) => cart && cart.has(String(x.cliente_id)));
  }
  const nom = await nombresDe(f.map((x: any) => String(x.cliente_id || "")));
  return {
    llamadas: f.map((x: any) => ({
      id: String(x.recording_id), fecha: x.fecha, titulo: x.titulo, grabo: x.grabo_nombre || "",
      cliente: nom[String(x.cliente_id)] || "", duracion: x.duracion || "", link: x.url || "",
      resumen: String(x.resumen || "").slice(0, 400),
    })),
    nota: f.length ? "Para la transcripción completa usá leer_llamada con el id." : "No encontré llamadas con eso.",
  };
}

async function leerLlamada(c: Clave, a: any) {
  const id = String(a?.id || "").replace(/[^0-9A-Za-z_-]/g, "");
  if (!id) return { error: "Falta el id de la llamada (sale de buscar_llamadas)." };
  const f = await sb("llamadas_fathom?select=recording_id,titulo,fecha,duracion,grabo_nombre,url,resumen,transcripcion,action_items,participantes,cliente_id&recording_id=eq." + encodeURIComponent(id));
  const x = f && f[0];
  if (!x) return { error: "No existe esa llamada." };
  if ((c.alcance || {}).llamadas === "cartera") {
    const cart = await idsCartera(c);
    if (!cart || !cart.has(String(x.cliente_id))) return { error: "Esa llamada no está en tu alcance." };
  }
  const nom = await nombresDe([String(x.cliente_id || "")]);
  const tr = String(x.transcripcion || "");
  const desde = Math.max(0, parseInt(a?.desde, 10) || 0);
  const largo = Math.max(2000, Math.min(60000, parseInt(a?.largo, 10) || 40000));
  const trozo = tr.slice(desde, desde + largo);
  // Solo los nombres de los participantes, sin mails: para el contexto alcanzan.
  const pj = x.participantes;
  const part = Array.isArray(pj) ? pj.map((p: any) => String(p?.name || "")).filter(Boolean)
    : Array.from(String(pj || "").matchAll(/'name':\s*'([^']*)'/g)).map((m) => m[1]);
  return {
    id: String(x.recording_id), fecha: x.fecha, titulo: x.titulo, grabo: x.grabo_nombre || "",
    cliente: nom[String(x.cliente_id)] || "", duracion: x.duracion || "", link: x.url || "",
    participantes: part, resumen: x.resumen || "",
    pendientes: String(x.action_items || "").slice(0, 4000),
    transcripcion: trozo,
    transcripcion_total: tr.length,
    sigue: desde + largo < tr.length ? ("Hay más: pedí leer_llamada con desde=" + (desde + largo)) : "",
  };
}

/* ── SOP comercial «Anti-Fugazi B2B» (03/11/2026) ─────────────────────────
   UNA SOLA FUENTE: el texto de los 7 criterios y el formato es CAP_SOP_DEFAULT
   de la app publicada (index.html en GitHub Pages), el mismo que corre
   «Analizar seleccionados» en Capacitacion. La skill criterios-oferta-casa §47
   ya obliga a cambiar la app cuando cambia el SOP (commit + push = publicado),
   asi que el conector lo toma solo, sin redesplegar. La copia de abajo es solo
   el respaldo por si Pages no contesta; si cambia el SOP, conviene refrescarla.
   Las reglas de chats y de auditoria de datasets NO estan en la app (alla solo
   se analizan llamadas): viven aca y se cambian junto con §47 y §31 de la skill. */
const APP_URL = "https://the-flowing-code.github.io/tracker-OS/";
const SOP_RESPALDO = `Sos un analista de procesos comerciales B2B. Analiza la(s) llamada(s) de venta a partir de la transcripcion, segun el framework "Anti-Fugazi B2B" de Martin Marquez. Criterios:
1. Diagnosticar para resolver, no para presentar (entender el problema de raiz; evitar el "modo catalogo").
2. Dividir bien el problema en capas/partes, no tratarlo como una sola cosa.
3. No dar precio antes de tiempo (recien con el diagnostico cerrado o si el prospecto lo pide, con transparencia).
4. Presentar SIEMPRE en vivo; nunca mandar la cotizacion suelta por mail/WhatsApp.
5. Cerrar el next step confirmado EN EL MOMENTO (pedir aceptar la invitacion ahi mismo, no solo prometer el link).
6. Ofrecer un paso de bajo riesgo (LRS) ante friccion de precio o liquidez (recorte de alcance, diagnostico pago, demo acotado).
7. Manejar confianza -> compromiso -> precio con criterio; buscar el bien comun, no el cierre a cualquier costo.

FORMATO DE SALIDA (respetalo):
- Breve linea de contexto (Estado y Rubro del prospecto si se puede inferir).
- "Que funciono bien": vinetas que arrancan con "✔ ", citando momentos puntuales de la llamada.
- "Que ajustar": vinetas que arrancan con "⚠ ", cada una atada a un criterio del framework y a un momento concreto.
- "Sugerencia concreta": 1 parrafo accionable al cierre.
- Si hay varias llamadas (R1, R2, R3, R4), desglosalo por cada una.

Tono: constructivo, especifico y honesto. No inventes datos que no esten en la transcripcion. Escribi en español rioplatense.`;
const SOP_EXTRA = {
  largo_y_varios_leads: "Conciso: 350 a 550 palabras por lead, 5 o 6 viñetas como máximo. Con varios leads, un bloque por lead y al final una «Síntesis transversal»: los patrones que se repiten, fortalezas y desvíos comunes, y 2 o 3 recomendaciones globales.",
  chats_de_whatsapp: "Cuando lo que hay son chats de WhatsApp/SMS y no llamadas: se aplican los criterios que corresponden (1, 3, 5, 6 y 7) y además el marco de mensajes de la casa. Mismo formato ✔ / ⚠, con el criterio (por número) o la regla de mensajes citada en cada ⚠. Reglas de mensajes: " +
    "(a) Mensaje 1 en los primeros 5 minutos: saludo, quién es, la promesa en su versión corta y cierra con «¿Es así?» (una pregunta que se contesta con un sí). " +
    "(b) Primero agendar, después calificar: nada de preguntas de filtrado antes de la llamada; se califica en el diagnóstico. " +
    "(c) Mensaje 2, si no agendó: corto, sin volver a presentarse; la llamada con su nombre, para qué sirve y dos horarios concretos. El estándar es un audio de 40 segundos como máximo con una línea escrita con los horarios. " +
    "(d) Los recordatorios no ofrecen mover la llamada; al agendar se avisa que llegan recordatorios; el del día lleva solo la hora y el link. " +
    "(e) Al que no contesta: 4 o 5 seguimientos cambiando el formato o el canal (audio corto con su nombre, llamada), no el mismo texto; el último retoma la promesa y le da permiso para decir que no («¿Seguís interesado en …? Si ya no es de tu interés, no hay problema»). Nunca se le pide un dato que todavía no dio. " +
    "(f) No prometer un entregable sin definir (si se promete algo por tomar la llamada, tiene nombre y contenido). " +
    "(g) No mandar el precio ni la cotización suelta por chat (criterio 4): se presenta en vivo.",
  auditar_dataset: "Para auditar el proceso comercial de un dataset: se leen el guion de la llamada 1 y 2, los mensajes y el paso de bajo riesgo como si fueran una llamada, y cada criterio que el proceso no garantiza es un ⚠ con la corrección: ¿la llamada 1 diagnostica antes de mostrar (1, 2)?, ¿el precio aparece recién con el diagnóstico cerrado (3)?, ¿la propuesta se presenta en vivo en la llamada 2 (4)?, ¿cada llamada cierra la siguiente agendada en el momento (5)?, ¿hay paso de bajo riesgo para el que frena por plata (6)?",
  no_inventar: "Cada ✔ y cada ⚠ se apoya en algo que está en la transcripción o en el chat (fecha y quién lo dijo). No se inventan citas ni momentos; si falta información para un criterio, se dice que no se puede evaluar.",
  devolucion_al_cliente: "Al cliente se le devuelve en mensajes cortos (uno por idea), sin nombrar a otros clientes, y si faltan llamadas grabadas se le pide que las grabe o las suba para el próximo feedback.",
};
let sopCache: { t: number; texto: string; fuente: string } | null = null;
async function sopComercial() {
  if (!sopCache || Date.now() - sopCache.t > 10 * 60 * 1000) {
    let texto = "", fuente = "";
    try {
      const r = await fetch(APP_URL + "?v=" + Date.now(), { signal: AbortSignal.timeout(8000) });
      const h = r.ok ? await r.text() : "";
      const m = h.match(/const CAP_SOP_DEFAULT=`([\s\S]*?)`;/);
      if (m && m[1].length > 300 && /Anti-Fugazi/.test(m[1])) { texto = m[1]; fuente = "app publicada (Capacitación)"; }
    } catch { /* se usa el respaldo */ }
    if (!texto) { texto = SOP_RESPALDO; fuente = "copia de respaldo del conector (la app no contestó)"; }
    sopCache = { t: Date.now(), texto, fuente };
  }
  return {
    nombre: "SOP de evaluación comercial «Anti-Fugazi B2B»",
    sop: sopCache.texto, fuente: sopCache.fuente,
    ...SOP_EXTRA,
    como_usar: "Para llamadas: buscar_llamadas + leer_llamada del cliente y analizar cada lead con este SOP. Para chats: leer_conversaciones del cliente y aplicar los criterios 1, 3, 5, 6 y 7 más las reglas de chats_de_whatsapp. Siempre el formato del SOP.",
  };
}

/* ── Conversaciones de GHL de un cliente (03/11/2026) ───────────────────────
   ⚠️  EL TOKEN DE GHL DEL CLIENTE NUNCA SALE DE ACA. Se lee de tokens_clientes
   (o de la ficha, de respaldo) y solo vuelven nombre + inicial, etapa y los
   mensajes. Sin telefonos ni mails: tampoco los que el lead escribio adentro
   de un mensaje (se tapan). Los leads son los de la sincronizacion del embudo
   (datos.ghl.opportunities, la que ya usa la app), asi no se pega al pipeline
   entero y se respeta la misma lista que ve el equipo. */
const GHL = "https://services.leadconnectorhq.com";
// Sin User-Agent de navegador, Cloudflare (delante de GHL) contesta 403 y
// parece un problema de permisos del token (ver la funcion whatsapp).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";
async function ghl(token: string, camino: string) {
  const r = await fetch(GHL + camino, { headers: { Authorization: "Bearer " + token, Version: "2021-04-15",
    Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  if (!r.ok) throw new Error(/cloudflare/i.test(t) ? "GHL " + r.status + " (Cloudflare)" : "GHL " + r.status);
  return JSON.parse(t);
}
// Las pruebas del equipo no son leads: fuera de todo feedback.
const esPrueba = (s: unknown) => /\b(prueba|test|tests|testing)\b|santiago capori|claude/.test(norm(s));
const tapar = (s: string) => s
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[mail]")
  .replace(/\+?\d[\d\s().-]{7,}\d/g, "[teléfono]");
const nombreCorto = (s: unknown) => {
  const p = String(s || "").trim().split(/\s+/).filter(Boolean);
  return p.length ? p[0] + (p[1] ? " " + p[1][0].toUpperCase() + "." : "") : "(sin nombre)";
};
// TYPE_CUSTOM_SMS: los que mandan por un proveedor de SMS propio (Sygemat).
// Sin él, sus leads parecían sin mensaje 1 aunque el SMS salía al segundo.
const TIPOS_CHAT = new Set(["TYPE_WHATSAPP", "TYPE_SMS", "TYPE_CUSTOM_SMS", "TYPE_CUSTOM_PROVIDER_SMS"]);
const TOPE_MENSAJES_TOTAL = 400;
// Por caracteres enteros: con .slice un emoji puede quedar partido al medio.
const cortar = (s: string, n: number) => Array.from(s).slice(0, n).join("");

// Los WhatsApp/SMS de un contacto, del más viejo al más nuevo.
async function chatsDe(token: string, loc: string, contactId: string) {
  const cs = await ghl(token, "/conversations/search?locationId=" + encodeURIComponent(loc) + "&contactId=" + encodeURIComponent(contactId) + "&limit=5");
  const msgs: any[] = [];
  for (const cv of (cs.conversations || []).slice(0, 2)) {
    const d = await ghl(token, "/conversations/" + encodeURIComponent(cv.id) + "/messages?limit=100");
    const ms = (d.messages && d.messages.messages) || d.messages || [];
    for (const m of ms) {
      if (!m || !TIPOS_CHAT.has(String(m.messageType || ""))) continue;
      let texto = String(m.body || "").trim();
      if (!texto && Array.isArray(m.attachments) && m.attachments.length) texto = "[adjunto: audio, imagen o archivo]";
      if (!texto) continue;
      msgs.push({ fecha: m.dateAdded || "", de: m.direction === "inbound" ? "lead" : "vendedor",
        canal: m.messageType === "TYPE_WHATSAPP" ? "WhatsApp" : "SMS",
        ...(m.source === "workflow" || m.source === "bulk_actions" ? { automatico: true } : {}),
        ...(m.status === "failed" || m.status === "undelivered" ? { no_llego: true } : {}),
        texto: cortar(tapar(texto), 1200) });
    }
  }
  msgs.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
  return msgs;
}

/* Leads nuevos y su mensaje 1 (03/11/2026). Para la rutina leads-sin-mensaje-1
   en la Mac de Santi: el modo normal descarta a los que nunca hablaron, y esos
   son justo los que hay que nombrar. Acá van TODOS los que entraron desde
   `desde` (por fecha de alta), hayan recibido algo o no, con cuánto tardó el
   primer mensaje nuestro y si llegó. Los leads salen de la sincronización del
   embudo: si es vieja, un lead recién entrado no está, y se avisa. */
async function leadsNuevos(nombre: string, token: string, loc: string, fila: any, a: any) {
  const d0 = fecha(a?.desde) || new Date(Date.now() - 27 * 3600 * 1000).toISOString().slice(0, 10);
  const ops: any[] = (Array.isArray(fila.op) ? fila.op : []).filter((o: any) => o && o.contactId
    && !esPrueba(o.contactName) && !esPrueba(o.name) && String(o.createdAt || "") >= d0)
    .sort((x: any, y: any) => String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  const TOPE = 40;
  // Varias oportunidades con la misma hora de alta (al minuto) no son gente
  // que se registró: es una carga o un pase de pipeline. Su «tarde» no es una
  // falla del mensaje 1 (Sygemat, 30/10: 8 juntas a las 12:43).
  const porMinuto: Record<string, number> = {};
  ops.forEach((o: any) => { const k = String(o.createdAt || "").slice(0, 16); porMinuto[k] = (porMinuto[k] || 0) + 1; });
  const leads: any[] = [];
  let errores = 0;
  for (let i = 0; i < Math.min(ops.length, TOPE); i += 5) {
    const res = await Promise.all(ops.slice(i, i + 5).map(async (o: any) => {
      try { return { o, msgs: await chatsDe(token, loc, o.contactId) }; } catch { return { o, msgs: null }; }
    }));
    for (const { o, msgs } of res) {
      if (msgs === null) { errores++; leads.push({ lead: nombreCorto(o.contactName || o.name), alta: o.createdAt || "", error: "GHL no contestó para este lead" }); continue; }
      // Un contacto que ya existía trae charla de antes: el mensaje 1 de ESTE
      // registro es el primero nuestro desde el alta (un minuto de margen).
      const alta = Date.parse(o.createdAt);
      const despues = msgs.filter((m) => Date.parse(m.fecha) >= alta - 60000);
      const nuestros = despues.filter((m) => m.de === "vendedor");
      const m1 = nuestros[0] || null;
      const llegados = nuestros.filter((m) => !m.no_llego);
      const min = m1 ? Math.round((Date.parse(m1.fecha) - alta) / 60000) : null;
      const lote = porMinuto[String(o.createdAt || "").slice(0, 16)] || 1;
      leads.push({ lead: nombreCorto(o.contactName || o.name), etapa: o.pipelineStage || "", alta: o.createdAt || "",
        ...(lote >= 3 ? { alta_en_lote: lote } : {}), ...(despues.length < msgs.length ? { ya_era_contacto: true } : {}),
        mensaje_1: m1 ? { fecha: m1.fecha, canal: m1.canal, ...(m1.automatico ? { automatico: true } : {}),
          minutos_desde_alta: min, ...(m1.no_llego ? { no_llego: true } : {}), texto: cortar(m1.texto, 300) } : null,
        estado: !m1 ? "sin_mensaje" : (!llegados.length ? "fallo" : ((min ?? 0) > 5 ? "tarde" : "ok")),
        mensajes_nuestros: nuestros.length, mensajes_del_lead: despues.length - nuestros.length,
        ultimo: msgs.length ? { fecha: msgs[msgs.length - 1].fecha, de: msgs[msgs.length - 1].de } : null });
    }
  }
  const ls = String(fila.ls || "");
  const horas = ls ? Math.round((Date.now() - Date.parse(ls)) / 3600000) : null;
  const cuenta: Record<string, number> = {};
  const enLote = leads.filter((x) => x.alta_en_lote).length;
  leads.forEach((x) => { if (x.alta_en_lote) return; const e = x.estado || "error"; cuenta[e] = (cuenta[e] || 0) + 1; });
  return { cliente: nombre, desde: d0, sincronizado: ls, leads_nuevos: ops.length, ...(ops.length > TOPE ? { recortado: "Van los " + TOPE + " más nuevos" } : {}),
    por_estado: cuenta, ...(enLote ? { en_lote: enLote } : {}), con_error: errores, leads,
    nota: "estado: sin_mensaje = no le escribimos nada; fallo = se mandó y no llegó; tarde = el mensaje 1 salió después de 5 minutos; ok. por_estado no cuenta los de alta_en_lote (3 o más con la misma hora de alta: una carga o un pase de pipeline, no un registro). ya_era_contacto = tenía charla de antes; el mensaje 1 se cuenta desde este alta. Pruebas del equipo excluidas; teléfonos y mails tapados."
      + (horas === null || horas > 6 ? " ⚠️ La sincronización del embudo es de hace " + (horas ?? "?") + " h: puede faltar algún lead recién entrado." : "") };
}

async function leerConversaciones(c: Clave, a: any) {
  if ((c.alcance || {}).conversaciones !== "leer")
    return { error: "Tu clave no tiene permiso para leer conversaciones de los clientes. Pedile a Angie que te lo active." };
  const cl = await buscarClienteIds(c, a?.cliente);
  if (!cl.length) return { error: "No encontré ese cliente (o no está en tu alcance)." };
  const exacto = cl.find((x) => norm(x.nombre) === norm(a?.cliente));
  if (cl.length > 1 && !exacto) return { varios: cl.slice(0, 15).map((x) => ({ id: x.id, nombre: x.nombre })), nota: "Hay varios: pedí uno por su nombre completo o su id." };
  const cli = exacto || cl[0];
  const f = await sb("clientes?select=loc:datos->ghl->>locationId,tf:datos->ghl->>token,op:datos->ghl->opportunities,ls:datos->ghl->>lastSync&id=eq." + cli.id);
  const fila = f && f[0];
  const tk = await sb("tokens_clientes?select=ghl_token&cliente_id=eq." + cli.id);
  const token = String((tk && tk[0] && tk[0].ghl_token) || (fila && fila.tf) || "");
  const loc = String((fila && fila.loc) || "");
  if (!token || !loc) return { cliente: cli.nombre, error: "Este cliente no tiene GHL conectado en el tracker." };

  const cantidad = Math.max(1, Math.min(25, parseInt(a?.cantidad, 10) || 10));
  const porLead = Math.max(5, Math.min(60, parseInt(a?.mensajes_por_lead, 10) || 30));
  const etapa = norm(limpio(a?.etapa));
  const d0 = fecha(a?.desde);
  let ops: any[] = (Array.isArray(fila.op) ? fila.op : []).filter((o: any) => o && o.contactId
    && !esPrueba(o.contactName) && !esPrueba(o.name));
  const etapas: Record<string, number> = {};
  ops.forEach((o: any) => { const e = String(o.pipelineStage || "(sin etapa)"); etapas[e] = (etapas[e] || 0) + 1; });
  if (etapa) ops = ops.filter((o: any) => norm(o.pipelineStage).includes(etapa));
  if (d0) ops = ops.filter((o: any) => String(o.updatedAt || o.createdAt || "") >= d0);
  ops.sort((x: any, y: any) => String(y.updatedAt || y.createdAt || "").localeCompare(String(x.updatedAt || x.createdAt || "")));

  if (a?.leads_nuevos) return await leadsNuevos(cli.nombre, token, loc, fila, a);

  const leads: any[] = [];
  let total = 0, revisados = 0, sinChat = 0, errores = 0;
  // Se revisan de a 5 y se corta al juntar `cantidad` leads con chat: los que
  // nunca hablaron no le sirven al feedback y no se gastan pedidos en ellos.
  const candidatos = ops.slice(0, cantidad * 3);
  for (let i = 0; i < candidatos.length && leads.length < cantidad && total < TOPE_MENSAJES_TOTAL; i += 5) {
    const lote = candidatos.slice(i, i + 5);
    const res = await Promise.all(lote.map(async (o: any) => {
      try { return { o, msgs: await chatsDe(token, loc, o.contactId) }; }
      catch { return { o, msgs: null }; }
    }));
    for (const { o, msgs } of res) {
      revisados++;
      if (msgs === null) { errores++; continue; }
      if (!msgs.length) { sinChat++; continue; }
      if (leads.length >= cantidad || total >= TOPE_MENSAJES_TOTAL) break;
      const ult = msgs.slice(-Math.min(porLead, TOPE_MENSAJES_TOTAL - total));
      total += ult.length;
      leads.push({ lead: nombreCorto(o.contactName || o.name), etapa: o.pipelineStage || "", estado: o.status || "",
        alta: String(o.createdAt || "").slice(0, 10), mensajes_en_total: msgs.length,
        ...(ult.length < msgs.length ? { recortado: "Van los últimos " + ult.length + " de " + msgs.length } : {}),
        mensajes: ult });
    }
  }
  return {
    cliente: cli.nombre, leads_del_embudo_sincronizados: (fila.op || []).length, sincronizado: fila.ls || "",
    etapas_disponibles: etapas, filtro_etapa: etapa ? a.etapa : "", revisados, sin_chat: sinChat, con_error: errores,
    leads,
    nota: (leads.length ? "Mensajes de WhatsApp y SMS, del más viejo al más nuevo. «vendedor» = lo que mandó el cliente o un automatismo (automatico: true). Pruebas del equipo excluidas; teléfonos y mails tapados." : "No encontré chats para esos leads.")
      + " Para el feedback, pedí sop_comercial y aplicá sus reglas de chats.",
  };
}

/* ── MCP ──────────────────────────────────────────────────────────────── */
const HERRAMIENTAS = [
  { name: "buscar_llamadas",
    description: "Busca llamadas grabadas con Fathom del equipo de The Flowing Code (Angie, Joe, Martín, Santi y el resto), de la más nueva a la más vieja. Filtra por cliente, por quién participó o grabó, por una palabra que aparezca en el título, el resumen o la transcripción, y por fechas. Devuelve id, fecha, título, cliente, link y un resumen corto.",
    inputSchema: { type: "object", properties: {
      cliente: { type: "string", description: "Nombre del cliente (o parte del nombre)" },
      persona: { type: "string", description: "Nombre o mail de alguien que estuvo en la llamada o la grabó" },
      texto: { type: "string", description: "Palabra o frase a buscar en título, resumen o transcripción" },
      desde: { type: "string", description: "AAAA-MM-DD" }, hasta: { type: "string", description: "AAAA-MM-DD" },
      limite: { type: "number", description: "Cuántas traer (1 a 50, 15 por defecto)" } } } },
  { name: "leer_llamada",
    description: "Trae una llamada completa por su id (el que devuelve buscar_llamadas): participantes, resumen, pendientes y la transcripción. Si la transcripción es larga viene en partes: usá «desde» para seguir.",
    inputSchema: { type: "object", required: ["id"], properties: {
      id: { type: "string" }, desde: { type: "number", description: "Desde qué carácter de la transcripción (0 por defecto)" },
      largo: { type: "number", description: "Cuántos caracteres (hasta 60000, 40000 por defecto)" } } } },
  { name: "listar_clientes",
    description: "Lista los clientes de Evolve OS (el tracker de la agencia): nombre, responsable, producto y su próxima reunión. Por defecto sin archivados ni prospectos.",
    inputSchema: { type: "object", properties: {
      producto: { type: "string" }, incluir_archivados: { type: "boolean" }, incluir_prospectos: { type: "boolean" } } } },
  { name: "pedir_cambio_app",
    description: "Deja un pedido de cambio o un error de Evolve OS (la app del tracker) en la cola de revisión, igual que «Nueva tarea → Evolve OS». No cambia nada por sí solo: la rutina de la mañana lo lee contra el código y Angie lo aprueba o lo cancela. Contalo como lo vio la persona: en qué pantalla, qué tocó, qué esperaba y qué pasó.",
    inputSchema: { type: "object", required: ["que"], properties: {
      que: { type: "string", description: "Qué cambiarías o qué no anda, en una o dos líneas" },
      detalle: { type: "string", description: "Pantalla, pasos, qué esperabas y qué pasó (opcional)" },
      links: { type: "array", items: { type: "string" }, description: "Links de capturas o videos (opcional)" } } } },
  { name: "crear_tarea",
    description: "Crea una tarea (ticket) para un cliente en Evolve OS. La app la convierte en ticket a nombre de quien indiques (o del responsable del cliente si no decís). Solo para quien tiene permiso de escribir tareas. Tope diario compartido con cambiar_estado_tarea. Se puede deshacer desde la app.",
    inputSchema: { type: "object", required: ["cliente", "texto"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" },
      texto: { type: "string", description: "Qué hay que hacer, una línea (hasta 200 caracteres)" },
      responsable: { type: "string", description: "Quién lo hace: primer nombre o mail de alguien del equipo (opcional)" },
      vence: { type: "string", description: "AAAA-MM-DD (opcional; si no, 3 días)" },
      detalle: { type: "string", description: "Por qué o contexto (opcional, hasta 300 caracteres)" } } } },
  { name: "cambiar_estado_tarea",
    description: "Marca un ticket como hecho o lo reabre, por su número (por ejemplo #123, el que se ve en la ficha del cliente y en Tickets). La app lo aplica la próxima vez que se abre. Solo para quien tiene permiso de escribir tareas. No borra nada.",
    inputSchema: { type: "object", required: ["ticket", "estado"], properties: {
      ticket: { type: "string", description: "Número del ticket, con o sin #" },
      estado: { type: "string", description: "hecha o abierta" },
      nota: { type: "string", description: "Por qué (opcional, hasta 200 caracteres)" } } } },
  { name: "sop_comercial",
    description: "Devuelve el SOP vigente de evaluación comercial de flowing code, «Anti-Fugazi B2B»: los 7 criterios, el formato de salida (✔ qué funcionó / ⚠ qué ajustar / sugerencia concreta / síntesis transversal), las reglas para evaluar chats de WhatsApp y para auditar el proceso comercial de un dataset. Usalo SIEMPRE antes de dar feedback comercial a un cliente o a su vendedor.",
    inputSchema: { type: "object", properties: {} } },
  { name: "leer_conversaciones",
    description: "Trae del GHL de un cliente las conversaciones de WhatsApp y SMS con los leads de su embudo: nombre del lead (nombre e inicial), etapa de la oportunidad y los mensajes con fecha, quién escribió (lead o vendedor) y texto. Sin teléfonos ni mails, sin pruebas del equipo. Por defecto los 10 leads con chat más recientes. Para el feedback comercial con sop_comercial. Solo para quien tiene permiso de leer conversaciones.",
    inputSchema: { type: "object", required: ["cliente"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" },
      etapa: { type: "string", description: "Etapa del pipeline (o parte del nombre), por ejemplo «llamada propuesta» (opcional)" },
      cantidad: { type: "number", description: "Cuántos leads con chat traer (1 a 25, 10 por defecto)" },
      mensajes_por_lead: { type: "number", description: "Últimos N mensajes de cada lead (5 a 60, 30 por defecto)" },
      desde: { type: "string", description: "Solo leads con movimiento desde AAAA-MM-DD (opcional). Con leads_nuevos: dados de alta desde ese día (por defecto, ayer)" },
      leads_nuevos: { type: "boolean", description: "Para el control del mensaje 1: TODOS los leads que entraron desde «desde», también los que nunca recibieron nada, con su mensaje 1 (cuánto tardó, si llegó) y un estado: sin_mensaje, fallo, tarde u ok. Hasta 40" } } } },
  { name: "guardar_mensajes_dia",
    description: "Deja los borradores de los mensajes del día de UN cliente en «Mensajes para mandar hoy» del tracker. No manda nada: los manda Santi a mano desde su WhatsApp. Pisa los de la corrida anterior de ese cliente y esa fuente. Solo para quien tiene permiso de mensajes. Tope diario compartido con guardar_parte.",
    inputSchema: { type: "object", required: ["cliente", "fuente", "fecha", "mensajes"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" },
      fuente: { type: "string", description: "whatsapp (parte de WhatsApp) o leads (leads sin mensaje 1)" },
      fecha: { type: "string", description: "AAAA-MM-DD: el día en que se mandan" },
      mensajes: { type: "array", description: "Hasta 50", items: { type: "object", required: ["cliente", "texto"], properties: {
        cliente: { type: "string", description: "Hasta 80" }, donde: { type: "string", description: "Grupo o chat, hasta 120" },
        quien: { type: "string", description: "Quién lo manda, hasta 40" }, motivo: { type: "string", description: "Por qué, hasta 250" },
        texto: { type: "string", description: "El mensaje, hasta 1500" } } } } } } },
  { name: "guardar_parte",
    description: "Deja el parte del día (lo que vigila la rutina) en el «buen día» o el «buenas noches» del tracker. Pisa el de la corrida anterior de esa fuente. Solo para quien tiene permiso de mensajes. Tope diario compartido con guardar_mensajes_dia.",
    inputSchema: { type: "object", required: ["fuente", "fecha", "momento"], properties: {
      fuente: { type: "string", description: "whatsapp o leads" },
      fecha: { type: "string", description: "AAAA-MM-DD" },
      momento: { type: "string", description: "manana o noche" },
      resumen: { type: "string", description: "Hasta 400" },
      items: { type: "array", description: "Hasta 30", items: { type: "object", required: ["texto", "tipo"], properties: {
        cliente: { type: "string", description: "Hasta 80" }, texto: { type: "string", description: "Hasta 300" },
        tipo: { type: "string", description: "sin_mensaje, fallo, tarde, espera, no_agendo, sin_seguimiento, prometido, riesgo u otro" } } } },
      recurrentes: { type: "array", description: "Hasta 10", items: { type: "object", required: ["problema"], properties: {
        problema: { type: "string", description: "Hasta 200" }, clientes: { type: "string", description: "Hasta 200" } } } } } } },
  { name: "leer_mensajes_estado",
    description: "Qué mensajes del día se marcaron como mandados («listo», con la hora) y cuáles editó quien los mandó (el texto final), de los clientes de tu alcance. Para el cierre del día. Solo para quien tiene permiso de mensajes.",
    inputSchema: { type: "object", properties: {
      fecha: { type: "string", description: "AAAA-MM-DD (hoy por defecto)" },
      cliente: { type: "string", description: "Solo este cliente (opcional)" } } } },
  { name: "estado_anuncios",
    description: "Por cliente, cada anuncio de su cuenta de Meta con su estado real (effective_status: ACTIVE, PAUSED, CAMPAIGN_PAUSED, DISAPPROVED…), su campaña y conjunto, y el gasto, impresiones y clics de los últimos días. Para no decir «están aprendiendo» de algo apagado. Solo para quien tiene permiso de campañas.",
    inputSchema: { type: "object", required: ["cliente"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" },
      dias: { type: "number", description: "Gasto de los últimos N días (1 a 30, 7 por defecto)" },
      solo_activos: { type: "boolean", description: "Solo los que están ACTIVE (por defecto, todos los que no están archivados ni borrados)" } } } },
  { name: "cargar_dataset",
    description: "Carga o corrige el link del dataset de oferta en la ficha de un cliente (el que se ve en Documentos y en la vista Lista), sin pisar lo demás: texto, estado y copias quedan como estaban. Para cuando el link de la ficha no abre o falta. Solo links de claude.ai/artifact. Solo para quien tiene permiso de escribir tareas; tope diario compartido con crear_tarea.",
    inputSchema: { type: "object", required: ["cliente"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" },
      link: { type: "string", description: "Link del dataset, vista del equipo: https://claude.ai/artifact/<id> (opcional si mandás link_cliente)" },
      link_cliente: { type: "string", description: "Link de la vista para el partner: https://claude.ai/artifact/<id> (opcional)" },
      completo: { type: "boolean", description: "true si el dataset está terminado (marca «Dataset listo» en la vista Lista). Si no lo mandás, queda el estado que tenía" } } } },
  { name: "ver_cliente",
    description: "La ficha de un cliente: contacto, equipo, reuniones agendadas, etapas, tareas abiertas, llamadas cargadas, estado de la oferta, link al reporte de campaña y cambios propuestos. No incluye credenciales ni montos.",
    inputSchema: { type: "object", required: ["cliente"], properties: {
      cliente: { type: "string", description: "Nombre (o parte) o id del cliente" } } } },
];

/* ── El unico que escribe: un pedido para la app ──────────────────────── */
// Tope por dia y por persona: un Claude en loop no puede llenar la cola.
const TOPE_PEDIDOS_DIA = 15;
async function pedirCambio(c: Clave, a: any) {
  const que = String(a?.que || "").trim();
  if (que.length < 8) return { error: "Contá qué cambiarías o qué no anda, en una o dos líneas." };
  const det = String(a?.detalle || "").trim();
  const links = (Array.isArray(a?.links) ? a.links : []).map((x: unknown) => String(x || "").trim())
    .filter((u: string) => /^https?:\/\/\S+$/.test(u)).slice(0, 5);
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  const hechos = await sb("mcp_registro?select=id&clave_id=eq." + c.id + "&herramienta=eq.pedir_cambio_app&at=gte." + hoy.toISOString());
  if (Array.isArray(hechos) && hechos.length >= TOPE_PEDIDOS_DIA)
    return { error: "Ya se cargaron " + TOPE_PEDIDOS_DIA + " pedidos hoy desde este conector. Seguí mañana o cargalo desde el tracker." };
  const ag = await sb("clientes?select=id&datos->>esAgencia=eq.true&limit=1");
  if (!ag || !ag[0]) return { error: "No encontré el cliente interno de la agencia." };
  // Mismo formato que sistemaPedir() del tracker: texto hasta 400, lo demas a
  // "porque" (hasta 800). cambio_id "sistema-..." es lo que lo manda a la
  // rutina cambios-sistema y no a la de Meta y GHL.
  const texto = que.slice(0, 400);
  const resto = [que.length > 400 ? "…" + que.slice(400) : "", det, links.length ? "Links: " + links.join(" ") : ""]
    .filter(Boolean).join("\n");
  const quien = String((c.alcance || {}).email || c.persona || "");
  const fila = await sb("agente_pedidos", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ cliente_id: Number(ag[0].id), cambio_id: "sistema-mcp-" + Date.now(), texto,
      porque: (resto + (resto ? "\n" : "") + "(cargado desde el Claude de " + c.persona + ")").slice(0, 800), pedido_por: quien }) });
  const id = fila && fila[0] && fila[0].id;
  return { ok: true, pedido: id, nota: "Quedó en Tickets → Pedidos al agente. La rutina de la mañana lo revisa contra el código y deja el plan; se hace recién cuando Angie lo aprueba." };
}

/* ── Tareas: las dos escrituras de Santi y el CSM (20/10/2026) ──────────────
   Solo con alcance.tareas = 'escribir'. Escriben por add_cambio_propuesto y
   add_accion_ticket (migracion 045): suman a una lista, no pisan nada. */
const TOPE_TAREAS_DIA = 30;
async function puedeEscribirTareas(c: Clave) {
  if ((c.alcance || {}).tareas !== "escribir") return "Tu clave no tiene permiso para escribir tareas. Pedile a Angie que te lo active.";
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  const hechos = await sb("mcp_registro?select=id&clave_id=eq." + c.id + "&herramienta=in.(crear_tarea,cambiar_estado_tarea,cargar_dataset)&at=gte." + hoy.toISOString());
  if (Array.isArray(hechos) && hechos.length >= TOPE_TAREAS_DIA)
    return "Ya se hicieron " + TOPE_TAREAS_DIA + " cambios de tareas hoy desde este conector. Seguí mañana o hacelo desde el tracker.";
  return "";
}
async function rpc(nombre: string, cuerpo: unknown) {
  return await sb("rpc/" + nombre, { method: "POST", body: JSON.stringify(cuerpo) });
}
async function crearTarea(c: Clave, a: any) {
  const veto = await puedeEscribirTareas(c); if (veto) return { error: veto };
  const texto = String(a?.texto || "").replace(/\s+/g, " ").trim();
  if (texto.length < 6) return { error: "Contá qué hay que hacer, en una línea." };
  if (texto.length > 200) return { error: "El texto pasa de 200 caracteres: acortalo y poné el resto en detalle." };
  const cl = await buscarClienteIds(c, a?.cliente);
  if (!cl.length) return { error: "No encontré ese cliente." };
  if (cl.length > 1) return { error: "Hay más de un cliente que coincide: " + cl.slice(0, 6).map((x: any) => x.nombre).join(", ") + ". Decime cuál." };
  const quien = String((c.alcance || {}).email || c.persona || "");
  const hoy = new Date().toISOString().slice(0, 10);
  const item: any = {
    id: ("mcp-" + String(c.persona || "x").toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + Date.now()).slice(0, 80),
    texto,
    porque: ((String(a?.detalle || "").trim() + (a?.detalle ? " " : "") + "(Cargada por " + c.persona + " desde su Claude, " + hoy + ")")).slice(0, 400),
    crear: "ticket",
  };
  const resp = limpio(a?.responsable); if (resp) item.responsable = resp;
  if (fecha(a?.vence)) item.vence = fecha(a?.vence);
  const ok = await rpc("add_cambio_propuesto", { p_id: Number(cl[0].id), p_item: item });
  if (ok !== true) return { error: "No se pudo cargar (la lista del cliente está llena o ya existe)." };
  return { ok: true, cliente: cl[0].nombre, tarea: texto, responsable: resp || "el responsable del cliente",
           nota: "Quedó cargada. La app la convierte en ticket cuando alguien la abre (en unos minutos). Se puede deshacer desde Tickets." };
}
/* ── El link del dataset (Santi y Ashtyn, llamada del 09/11/2026) ────────────
   El link de la ficha de Juan Argüello no abría y desde el conector no habia
   con que corregirlo. Usa set_oferta_estado (migracion 033), que rearma el
   renglon de cero: por eso se lee el que hay y se le pasa todo. */
const RE_ARTIFACT = /^https:\/\/claude\.ai\/artifact\/[A-Za-z0-9_-]{6,64}$/;
async function cargarDataset(c: Clave, a: any) {
  const veto = await puedeEscribirTareas(c); if (veto) return { error: veto };
  const link = String(a?.link || "").trim(), linkCli = String(a?.link_cliente || "").trim();
  if (!link && !linkCli) return { error: "Mandá el link del dataset (link) o el de la vista para el partner (link_cliente)." };
  if (link && !RE_ARTIFACT.test(link)) return { error: "El link tiene que ser https://claude.ai/artifact/<id>." };
  if (linkCli && !RE_ARTIFACT.test(linkCli)) return { error: "El link para el partner tiene que ser https://claude.ai/artifact/<id>." };
  const cl = await buscarClienteIds(c, a?.cliente);
  if (!cl.length) return { error: "No encontré ese cliente (o no está en tu alcance)." };
  if (cl.length > 1) return { error: "Hay más de un cliente que coincide: " + cl.slice(0, 6).map((x: any) => x.nombre).join(", ") + ". Decime cuál." };
  const f = await sb("clientes?select=id,of:maquina->oferta&id=eq." + cl[0].id);
  const ant: any = (f && f[0] && f[0].of) || {};
  const url = link || ant.url || null;
  let estado = ant.estado || (url ? "completa" : "curso");
  if (a?.completo === true) estado = "completa";
  if (a?.completo === false) estado = "curso";
  if (estado === "completa" && !url) return { error: "Para marcarlo completo hace falta el link de la vista del equipo (link)." };
  await rpc("set_oferta_estado", {
    p_id: Number(cl[0].id), p_estado: estado, p_texto: String(ant.texto || "Dataset de oferta").slice(0, 60),
    p_url: url, p_storage: link && link !== ant.url ? null : (ant.storage || null),
    p_avance: estado === "completa" ? 100 : (typeof ant.avance === "number" ? ant.avance : null),
    p_url_cliente: linkCli || ant.urlCliente || null,
    p_storage_cliente: linkCli && linkCli !== ant.urlCliente ? null : (ant.storageCliente || null),
  });
  return { ok: true, cliente: cl[0].nombre, link: url, link_cliente: linkCli || ant.urlCliente || null, estado,
           antes: { link: ant.url || null, link_cliente: ant.urlCliente || null, estado: ant.estado || null },
           nota: "Quedó cargado en la ficha. Para volver atrás, cargá de nuevo el link de «antes»." };
}
async function cambiarEstadoTarea(c: Clave, a: any) {
  const veto = await puedeEscribirTareas(c); if (veto) return { error: veto };
  const num = String(a?.ticket || "").replace(/[^0-9]/g, "");
  if (!num) return { error: "Falta el número del ticket (por ejemplo #123)." };
  const est = String(a?.estado || "").toLowerCase();
  const accion = /^(hech|cerr|final|listo|ok)/.test(est) ? "cerrar" : (/^(abier|reabr|pend)/.test(est) ? "reabrir" : "");
  if (!accion) return { error: "El estado tiene que ser «hecha» o «abierta»." };
  const filas = await sb("clientes?select=id,n:datos->>name,t:datos->tasks&order=id");
  let hallado: any = null, tarea: any = null;
  for (const f of (filas || [])) {
    const t = (Array.isArray(f.t) ? f.t : []).find((x: any) => x && String(x.ticket || "").replace(/[^0-9]/g, "") === num && !x.deleted);
    if (t) { hallado = f; tarea = t; break; }
  }
  if (!hallado) return { error: "No encontré el ticket #" + num + ". Revisá el número en Tickets." };
  const hoyAccion = { id: ("mcp-" + String(c.persona || "x").toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + Date.now()).slice(0, 80),
    accion, ticket: "#" + num, por: String(c.persona || "").slice(0, 80), nota: String(a?.nota || "").slice(0, 200), at: new Date().toISOString() };
  const ok = await rpc("add_accion_ticket", { p_id: Number(hallado.id), p_accion: hoyAccion });
  if (ok !== true) return { error: "No se pudo anotar la acción." };
  return { ok: true, cliente: hallado.n, ticket: "#" + num, tarea: String(tarea.text || "").slice(0, 120),
           pedido: accion === "cerrar" ? "marcar como hecho" : "reabrir",
           nota: "Quedó anotado. La app lo aplica la próxima vez que alguien la abre. Se puede revertir desde el ticket." };
}

/* ── Mensajes y parte del día: las rutinas de Santi (03/11/2026) ────────────
   Solo con alcance.mensajes = 'escribir'. Mismo patrón que las tareas: el
   cliente sale de buscarClienteIds (lo que no está en el alcance de la clave
   no existe), tope por día y todo queda en mcp_registro. Son BORRADORES: la
   app los muestra con un botón para copiar y Santi los manda a mano. Las
   validaciones repiten las de set_mensajes_dia (049/052) y set_vigilancia
   (048) para que el error le llegue claro a su Claude y no como un 400. */
const TOPE_MENSAJES_DIA = 60; // ~30 clientes, uno por cliente y por corrida
const INTERNO = 1787605845151; // el cliente de la agencia: ahí vive el parte
const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
async function puedeEscribirMensajes(c: Clave) {
  if ((c.alcance || {}).mensajes !== "escribir") return "Tu clave no tiene permiso para los mensajes del día. Pedile a Angie que te lo active.";
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  const hechos = await sb("mcp_registro?select=id&clave_id=eq." + c.id + "&herramienta=in.(guardar_mensajes_dia,guardar_parte)&at=gte." + hoy.toISOString());
  if (Array.isArray(hechos) && hechos.length >= TOPE_MENSAJES_DIA)
    return "Ya se guardaron " + TOPE_MENSAJES_DIA + " mensajes o partes hoy desde este conector. Seguí mañana.";
  return "";
}
const corto = (s: unknown, n: number) => String(s ?? "").trim().length <= n;
async function guardarMensajesDia(c: Clave, a: any) {
  const veto = await puedeEscribirMensajes(c); if (veto) return { error: veto };
  const fuente = String(a?.fuente || "");
  if (fuente !== "whatsapp" && fuente !== "leads") return { error: "fuente tiene que ser whatsapp o leads." };
  const dia = fecha(a?.fecha); if (!dia) return { error: "Falta fecha AAAA-MM-DD (el día en que se mandan)." };
  const ms = Array.isArray(a?.mensajes) ? a.mensajes : null;
  if (!ms || ms.length > 50) return { error: "mensajes es una lista de hasta 50." };
  const cl = await buscarClienteIds(c, a?.cliente);
  if (!cl.length) return { error: "No encontré ese cliente (o no está en tu alcance)." };
  const exacto = cl.find((x) => norm(x.nombre) === norm(a?.cliente) || x.id === limpio(a?.cliente));
  if (cl.length > 1 && !exacto) return { error: "Hay más de un cliente que coincide: " + cl.slice(0, 6).map((x: any) => x.nombre).join(", ") + ". Decime cuál." };
  const cli = exacto || cl[0];
  const mensajes: any[] = [];
  for (const m of ms) {
    const texto = String(m?.texto || "").trim();
    if (!texto || !corto(texto, 1500) || !corto(m?.donde, 120) || !corto(m?.motivo, 250) || !corto(m?.quien, 40))
      return { error: "Cada mensaje necesita texto (hasta 1500); donde hasta 120, motivo hasta 250, quien hasta 40." };
    // El cliente de cada mensaje es el de la fila: así no se cuela uno ajeno.
    const x: any = { cliente: String(cli.nombre).slice(0, 80), texto };
    for (const k of ["donde", "quien", "motivo"]) if (String(m?.[k] || "").trim()) x[k] = String(m[k]).trim();
    mensajes.push(x);
  }
  await rpc("set_mensajes_dia", { p_id: Number(cli.id), p_parte: { fuente, fecha: dia, mensajes } });
  return { ok: true, cliente: cli.nombre, fuente, fecha: dia, mensajes: mensajes.length,
           nota: "Quedaron como borradores en «Mensajes para mandar hoy» de la app. No se mandó nada: los manda Santi desde su WhatsApp." };
}
const TIPOS_PARTE = new Set(["sin_mensaje", "fallo", "tarde", "espera", "no_agendo", "sin_seguimiento", "prometido", "riesgo", "otro"]);
async function guardarParte(c: Clave, a: any) {
  const veto = await puedeEscribirMensajes(c); if (veto) return { error: veto };
  const fuente = String(a?.fuente || "");
  if (fuente !== "whatsapp" && fuente !== "leads") return { error: "fuente tiene que ser whatsapp o leads." };
  const dia = fecha(a?.fecha); if (!dia) return { error: "Falta fecha AAAA-MM-DD." };
  const momento = String(a?.momento || "");
  if (momento !== "manana" && momento !== "noche") return { error: "momento tiene que ser manana o noche." };
  const resumen = String(a?.resumen || "").trim();
  if (!corto(resumen, 400)) return { error: "El resumen es de hasta 400 caracteres." };
  const items = Array.isArray(a?.items) ? a.items : [];
  const recurrentes = Array.isArray(a?.recurrentes) ? a.recurrentes : [];
  if (items.length > 30 || recurrentes.length > 10) return { error: "items hasta 30 y recurrentes hasta 10." };
  for (const x of items)
    if (!String(x?.texto || "").trim() || !corto(x?.texto, 300) || !corto(x?.cliente, 80) || !TIPOS_PARTE.has(String(x?.tipo || "")))
      return { error: "Cada item necesita texto (hasta 300), cliente (hasta 80) y un tipo: " + Array.from(TIPOS_PARTE).join(", ") + "." };
  for (const x of recurrentes)
    if (!String(x?.problema || "").trim() || !corto(x?.problema, 200) || !corto(x?.clientes, 200))
      return { error: "Cada recurrente necesita problema (hasta 200) y clientes (hasta 200)." };
  const limpios = items.map((x: any) => ({ cliente: String(x.cliente || "").trim(), tipo: x.tipo, texto: String(x.texto).trim() }));
  const recs = recurrentes.map((x: any) => ({ problema: String(x.problema).trim(), clientes: String(x.clientes || "").trim() }));
  await rpc("set_vigilancia", { p_id: INTERNO, p_parte: { fuente, fecha: dia, momento, resumen, items: limpios, recurrentes: recs } });
  return { ok: true, fuente, fecha: dia, momento, items: limpios.length, recurrentes: recs.length,
           nota: "Quedó en el " + (momento === "manana" ? "«buen día»" : "«buenas noches»") + " de la app." };
}
async function leerMensajesEstado(c: Clave, a: any) {
  if ((c.alcance || {}).mensajes !== "escribir") return { error: "Tu clave no tiene permiso para los mensajes del día. Pedile a Angie que te lo active." };
  const dia = fecha(a?.fecha) || hoyAR();
  let ids: Set<string> | null = null;
  if (a?.cliente) {
    const cl = await buscarClienteIds(c, a.cliente);
    if (!cl.length) return { error: "No encontré ese cliente (o no está en tu alcance)." };
    ids = new Set(cl.map((x) => x.id));
  } else if ((c.alcance || {}).clientes === "cartera") ids = (await idsCartera(c)) || new Set();
  const filas = await filasClientes("n:datos->>name,md:maquina->mensajesDia");
  const nombres = new Set<string>();
  const L: any[] = [];
  const estado = (await rpc("get_mensajes_estado", {})) || {};
  for (const f of filas) {
    if (ids && !ids.has(String(f.id))) continue;
    if (f.n) nombres.add(String(f.n));
    const M = f.md && typeof f.md === "object" ? f.md : {};
    // Mismas claves que la app (_bv2MensHtml): día|fuente|cliente|n, contando por cliente.
    for (const fu of ["leads", "whatsapp", "onboarding"]) {
      const p = M[fu]; if (!p || p.fecha !== dia) continue;
      const cuenta: Record<string, number> = {};
      for (const x of (p.mensajes || [])) {
        const cl = String(x.cliente || f.n || ""); const n = cuenta[cl] = (cuenta[cl] || 0) + 1;
        const e = estado[dia + "|" + fu + "|" + cl + "|" + n] || {};
        L.push({ cliente: cl, fuente: fu, donde: tapar(String(x.donde || "")), borrador: tapar(String(x.texto || "")),
          ...(e.t != null ? { texto_mandado: tapar(String(e.t)), editado: true } : {}),
          mandado: !!e.listo, ...(e.listo ? { marcado_listo: String(e.listo) } : {}) });
      }
    }
  }
  return { fecha: dia, mensajes: L, mandados: L.filter((x) => x.mandado).length, sin_mandar: L.filter((x) => !x.mandado).length,
    nota: "«mandado» = alguien lo marcó Listo en la app. Si se mandó sin marcarlo, acá figura como sin mandar." };
}

/* ── Estado de los anuncios en Meta (03/11/2026) ──────────────────────────
   ⚠️  EL TOKEN DE META DEL CLIENTE NUNCA SALE DE ACA, como el de GHL en
   leer_conversaciones: se lee de tokens_clientes (o de la ficha, de respaldo)
   y solo vuelven nombres, estados y números. Solo con alcance.campanas='leer'. */
const META = "https://graph.facebook.com/v25.0";
const ESTADOS_VIVOS = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "PENDING_REVIEW", "DISAPPROVED",
  "PREAPPROVED", "PENDING_BILLING_INFO", "WITH_ISSUES", "IN_PROCESS"];
async function estadoAnuncios(c: Clave, a: any) {
  if ((c.alcance || {}).campanas !== "leer") return { error: "Tu clave no tiene permiso para ver campañas. Pedile a Angie que te lo active." };
  const cl = await buscarClienteIds(c, a?.cliente);
  if (!cl.length) return { error: "No encontré ese cliente (o no está en tu alcance)." };
  const exacto = cl.find((x) => norm(x.nombre) === norm(a?.cliente) || x.id === limpio(a?.cliente));
  if (cl.length > 1 && !exacto) return { varios: cl.slice(0, 15).map((x) => ({ id: x.id, nombre: x.nombre })), nota: "Hay varios: pedí uno por su nombre completo o su id." };
  const cli = exacto || cl[0];
  const f = await sb("clientes?select=acc:datos->>metaAccountId,tf:datos->>metaToken&id=eq." + cli.id);
  const tk = await sb("tokens_clientes?select=meta_token&cliente_id=eq." + cli.id);
  const token = String((tk && tk[0] && tk[0].meta_token) || (f && f[0] && f[0].tf) || "");
  const cuenta = String((f && f[0] && f[0].acc) || "").replace(/^act_/, "").replace(/[^0-9]/g, "");
  if (!token || !cuenta) return { cliente: cli.nombre, error: "Este cliente no tiene Meta conectado en el tracker." };
  const dias = Math.max(1, Math.min(30, parseInt(a?.dias, 10) || 7));
  const hasta = hoyAR();
  const desde = new Date(Date.parse(hasta + "T12:00:00Z") - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const estados = a?.solo_activos ? ["ACTIVE"] : ESTADOS_VIVOS;
  const campos = "id,name,effective_status,campaign{name},adset{name},insights.time_range({'since':'" + desde + "','until':'" + hasta + "'}){spend,impressions,clicks,account_currency}";
  let url: string | null = META + "/act_" + cuenta + "/ads?fields=" + encodeURIComponent(campos) + "&limit=200"
    + "&filtering=" + encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: estados }]))
    + "&access_token=" + encodeURIComponent(token);
  const ads: any[] = [];
  for (let pag = 0; url && pag < 5; pag++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const d = await r.json().catch(() => ({}));
    // Solo el mensaje de Meta, nunca la URL (lleva el token).
    if (!r.ok || d.error) return { cliente: cli.nombre, error: "Meta contestó: " + String(d?.error?.message || r.status).replace(/access_token=[^&\s]+/g, "access_token=…").slice(0, 200) };
    ads.push(...(d.data || []));
    url = d.paging && d.paging.next ? String(d.paging.next) : null;
  }
  let moneda = "";
  const anuncios = ads.map((x: any) => {
    const i = (x.insights && x.insights.data && x.insights.data[0]) || {};
    if (i.account_currency) moneda = i.account_currency;
    return { anuncio: x.name || "", estado: x.effective_status || "", campana: (x.campaign && x.campaign.name) || "",
      conjunto: (x.adset && x.adset.name) || "", gasto: Number(i.spend || 0), impresiones: Number(i.impressions || 0), clics: Number(i.clicks || 0) };
  }).sort((p, q) => q.gasto - p.gasto || p.anuncio.localeCompare(q.anuncio));
  const porEstado: Record<string, number> = {};
  anuncios.forEach((x) => { porEstado[x.estado] = (porEstado[x.estado] || 0) + 1; });
  return { cliente: cli.nombre, desde, hasta, moneda, por_estado: porEstado,
    gasto_total: Math.round(anuncios.reduce((s, x) => s + x.gasto, 0) * 100) / 100, anuncios,
    nota: "Solo ACTIVE está entregando. CAMPAIGN_PAUSED / ADSET_PAUSED = apagado más arriba; DISAPPROVED = rechazado. Leído de Meta ahora." };
}

async function correr(c: Clave, nombre: string, a: any) {
  if (nombre === "guardar_mensajes_dia") return await guardarMensajesDia(c, a);
  if (nombre === "guardar_parte") return await guardarParte(c, a);
  if (nombre === "leer_mensajes_estado") return await leerMensajesEstado(c, a);
  if (nombre === "estado_anuncios") return await estadoAnuncios(c, a);
  if (nombre === "pedir_cambio_app") return await pedirCambio(c, a);
  if (nombre === "crear_tarea") return await crearTarea(c, a);
  if (nombre === "cambiar_estado_tarea") return await cambiarEstadoTarea(c, a);
  if (nombre === "cargar_dataset") return await cargarDataset(c, a);
  if (nombre === "buscar_llamadas") return await buscarLlamadas(c, a);
  if (nombre === "leer_llamada") return await leerLlamada(c, a);
  if (nombre === "listar_clientes") return await listarClientes(c, a);
  if (nombre === "ver_cliente") return await verCliente(c, a);
  if (nombre === "sop_comercial") return await sopComercial();
  if (nombre === "leer_conversaciones") return await leerConversaciones(c, a);
  throw new Error("No existe la herramienta " + nombre);
}

async function anotar(c: Clave, herramienta: string, a: unknown) {
  try {
    await sb("mcp_registro", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ clave_id: c.id, persona: c.persona, herramienta, args: JSON.stringify(a || {}).slice(0, 1000) }) });
    await sb("mcp_claves?id=eq." + c.id, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ultima_at: new Date().toISOString() }) });
  } catch { /* el registro no frena la consulta */ }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Este conector solo atiende POST (MCP).", { status: 405, headers: { Allow: "POST" } });
  }
  const c = await quienEs(req).catch(() => null);
  if (!c) return responder({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Clave inválida o apagada." } }, 401);

  let m: any;
  try { m = await req.json(); } catch {
    return responder({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, 400);
  }
  if (Array.isArray(m)) {
    return responder({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Mandá un mensaje por vez." } }, 400);
  }
  const id = m.id ?? null;
  const ok = (result: unknown) => responder({ jsonrpc: "2.0", id, result });

  // Una notificacion no lleva respuesta.
  if (m.id === undefined || String(m.method || "").startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }
  if (m.method === "initialize") {
    return ok({
      protocolVersion: (m.params && m.params.protocolVersion) || "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evolve-os-consulta", version: "1.4.0" },
      instructions: "Consulta de Evolve OS, el tracker de The Flowing Code: llamadas grabadas del equipo con su transcripción, y la ficha de cada cliente. Para una llamada: primero buscar_llamadas, después leer_llamada con el id. Para feedback comercial de un cliente: sop_comercial (el SOP Anti-Fugazi B2B) y después leer_conversaciones (chats de sus leads) o buscar_llamadas + leer_llamada. Para las rutinas de mensajes: estado_anuncios antes de hablar de campañas, guardar_mensajes_dia (uno por cliente) y guardar_parte; al cierre, leer_mensajes_estado. Los mensajes son borradores: nada se le manda a nadie desde acá. Lo demás que se puede cargar es un pedido de cambio o error de la app (pedir_cambio_app), que queda para revisión.",
    });
  }
  if (m.method === "ping") return ok({});
  if (m.method === "tools/list") return ok({ tools: HERRAMIENTAS });
  if (m.method === "tools/call") {
    const nombre = String(m.params?.name || "");
    const a = m.params?.arguments || {};
    try {
      const r = await correr(c, nombre, a);
      await anotar(c, nombre, a);
      return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 1) }] });
    } catch (e) {
      return ok({ content: [{ type: "text", text: "No se pudo: " + String((e as Error)?.message || e) }], isError: true });
    }
  }
  return responder({ jsonrpc: "2.0", id, error: { code: -32601, message: "Método no soportado: " + m.method } });
});
