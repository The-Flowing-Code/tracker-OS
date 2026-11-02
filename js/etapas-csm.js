/* ── Tareas del CSM por etapa (Angie, 27 y 28/10/2026) ─────────────────────
   «Que Santi pueda ver y tildar, en la ficha de cada cliente, las tareas que le
   tocan en cada etapa.» Así lo que se hace con el cliente no se pisa con lo que
   se dice por WhatsApp, y cualquiera ve en qué tarea quedó, qué lo bloquea y
   para cuándo se destraba.

   Por qué es una lista aparte y no la plantilla de etapas (`c.etapasTareas`):
   - la plantilla se COPIA a cada cliente y solo la tienen los que la cargaron
     (12 de 69 al 28/10); sumarle tareas obligaba a recargarla, y recargar
     pierde lo tildado. Estas son las mismas para todos los clientes, son del
     rol y no del cliente, así que viven en el código y valen para todos desde
     hoy, tengan o no la plantilla cargada;
   - lo tildado sí es del cliente: va en `c.csmTareas[id] = {ok, at, por}`,
     adentro de `clientes.datos`, igual que las tareas de la plantilla. La
     policy `agencia_clientes` (cartera_alcanza) deja que el CSM escriba los
     clientes de su cartera; no hace falta tocar la base.
   - el bloqueante de cada etapa va en `c.etapaTraba[k] = {t, quien, para, at,
     por}`: qué lo frena, quién lo destraba y para cuándo.

   Las tareas viejas de la plantilla (las de Onboarding, «Enviar Looms»…) siguen
   donde estaban, abajo, sin cambios: esto no las toca ni las migra.

   Solo declaraciones: todo lo de la app (_p360Etapa, esc, save, SB…) se usa
   recién al correr (lo controla tests/modulos.test.js). */

/* `re` reconoce la etapa por el nombre de la columna del tablero y por la
   clave de `c.citas`, que son los labels de la ruta («Pago / onboarding»,
   «Sistemas y Montado del Embudo»…): la ruta se edita, así que se compara por
   palabra y no por el texto exacto.
   `llamada` es la reunión de la etapa: la tarea con `agenda` se tilda sola
   cuando hay una cita de verdad de esa etapa. `cada` es para las que se repiten:
   tildada vale por ese día o esa semana, no para siempre.
   `msg` (Angie, 29/10/2026) es el mensaje que va con la tarea: un botón a la
   derecha lo copia para pegarlo en el WhatsApp del cliente (`_cmMensaje` y
   `cliMenuCopiar`, en index.html). Antes vivían en el menú ⋮ de la tarjeta. */
/* El roadmap del cliente (Angie, 01/11/2026): una sola lista por etapa con
   TODO lo que tiene que pasar, no solo lo del CSM. Antes había dos listas que
   decían cosas parecidas y no se hablaban (esta y la plantilla de etapas, que
   se copiaba a cada cliente y la tenían 12 de 69); la plantilla dejó de verse
   en la ficha y sus tareas pasaron acá. `quien` dice de quién depende:
   'csm' (Santi), 'delivery' (Angie y el equipo), 'claude' (lo arranca Claude solo) o 'cliente'. Los ids no se
   cambian nunca: lo tildado de cada cliente cuelga de ellos. */
var CSM_ETAPAS=[
  /* Onboarding sin llamada de bienvenida (Angie, 01/11/2026): se le manda al
     cliente un link con una landing que tiene el video de bienvenida, el
     formulario personalizado y, al final, el calendario para agendar la
     llamada de estrategia. La agenda la tilda la cita (est-agendar). */
  {k:'onboarding', n:'Onboarding', re:/onboard|bienvenida|alta|pago/i, llamada:'',
   tareas:[
    {id:'onb-redes', t:'Cargar web, Instagram, página de Facebook y Biblioteca en la ficha', quien:'claude',
     ayuda:'Arranca solo con el alta: desde la web del cliente y la Biblioteca de anuncios. Lo que no aparezca va como pregunta en el formulario.'},
    {id:'onb-llamadas', t:'Llamadas de venta cargadas en la ficha', quien:'claude',
     ayuda:'Arranca solo con el alta: busca en Fathom las llamadas de venta con el cliente y las ata a su ficha.'},
    {id:'onb-factura', t:'Verificar los datos de la factura', quien:'csm'},
    {id:'onb-crm', t:'Crear la subcuenta del CRM y mandarle la invitación al cliente', quien:'claude',
     ayuda:'Al alta: subcuenta en GoHighLevel con el nombre del cliente, su usuario invitado y el link en la ficha.'},
    {id:'onb-form-armado', t:'Armar el formulario personalizado con lo que dijo en la venta', quien:'claude',
     ayuda:'Arranca solo con el alta del cliente. Sin preguntar accesos: competencia, diferencial, qué resuelve, costos fijos y rentabilidad.'},
    {id:'onb-pagina', t:'Armar la página de bienvenida (video, formulario y calendario)', quien:'claude',
     ayuda:'Con su marca; el calendario es el de Strategy Call. Deja el mensaje con el link listo para que Santi lo copie.'},
    {id:'onb-link', t:'Pasarle a Santi el mensaje con el link de bienvenida', quien:'claude', msg:'bienvenida',
     ayuda:'Claude se lo manda a Santi por WhatsApp y Santi lo reenvía al grupo del cliente. Si no se pudo mandar, igual le queda de recordatorio en su escritorio («Mensajes para mandar hoy») y acá, listo para copiar.'},
    {id:'onb-form-ok', t:'Completó el formulario', quien:'cliente',
     ayuda:'Si a los 2 días no lo completó o no agendó, escribirle.'},
    {id:'onb-agendo', t:'Agendó la llamada de estrategia desde el link', quien:'cliente'},
    {id:'onb-accesos', t:'Cargar accesos y demos en la ficha', quien:'csm'},
    {id:'onb-cafecito', t:'Sumarlo a la invitación del cafecito mensual', quien:'csm', msg:'cafecito',
     ayuda:'Último viernes de cada mes, 16 h. La invitación sale de Google Calendar.'}]},
  /* Proceso comercial ya no es una etapa aparte (Angie, 02/11/2026): se arma con
     la primera parte del dataset, así que sus tareas viven en Estrategia. Los
     instructivos del CRM (videos del calendario y el pipeline) van dentro de la
     página del resultado final. */
  {k:'estrategia', n:'Estrategia', re:/estrateg|strategy|dataset|comercial/i, llamada:'Llamada de estrategia',
   tareas:[
    {id:'est-agendar', t:'Chequear que agendó la llamada de estrategia', quien:'csm', agenda:true,
     ayuda:'La agenda el cliente desde el link de bienvenida; Santi chequea que esté en el calendario. La lidera Santi: presenta, Angie explica la estrategia y Santi cierra con los próximos pasos.'},
    {id:'est-dataset-armado', t:'Dataset completo antes de la llamada', quien:'claude',
     ayuda:'Arranca solo cuando el cliente completa el formulario, con la skill dataset-casa. El mercado va adentro: si ya pautó, su cuenta es la primera fuente; se parte de un cliente parecido con resultados.'},
    {id:'pc-recorridos', t:'Proceso comercial y recorridos del lead', quien:'claude',
     ayuda:'En la primera parte del dataset: mensaje 1 automático, mensaje 2 en audio si no agendó, recordatorios sin opción de mover.'},
    {id:'pc-documento', t:'Documento de proceso comercial', quien:'claude'},
    {id:'est-oferta', t:'Estado de la oferta actualizado en el tablero', quien:'claude', ayuda:'Al cerrar cada parte del dataset.'},
    {id:'est-comercial-rev', t:'Revisión del proceso comercial', quien:'delivery',
     ayuda:'Va en el mismo WhatsApp que el dataset: Claude le manda los dos links a Angie.'},
    {id:'est-dataset-rev', t:'Revisión del dataset', quien:'delivery', ayuda:'Claude le manda el link a Angie por WhatsApp cuando está listo; ella lo revisa antes de que Santi lo mande.'},
    {id:'est-dataset', t:'Mandar el link del dataset', quien:'csm', ayuda:'Cuando Angie lo revisó.'},
    {id:'est-instructivos', t:'Mandar los instructivos de accesos (CRM y Meta)', quien:'csm', msg:'instructivos'},
    {id:'est-material', t:'Mandó el material (logo, capturas del producto, casos o testimonios)', quien:'cliente'},
    {id:'est-llamada-angie', t:'Presentar el dataset en la llamada de estrategia', quien:'delivery',
     ayuda:'Angie explica la estrategia y el dataset.'},
    {id:'est-llamada-santi', t:'Llamada de estrategia: presentar y cerrar con los próximos pasos', quien:'csm',
     ayuda:'Santi abre la llamada y la cierra con lo que sigue.'},
    {id:'est-asistio', t:'Asistió a la llamada de estrategia', quien:'cliente'},
    {id:'est-dataset-ok', t:'Dataset aprobado por el cliente', quien:'cliente'},
    {id:'est-guiones', t:'Guiones escritos', quien:'claude', ayuda:'Arrancan solos con el dataset aprobado. Para la segunda tanda: no frenan el paso a Sistemas.'},
    {id:'est-guiones-rev', t:'Revisión de los guiones', quien:'delivery', ayuda:'Angie los revisa antes de mandarlos.'},
    {id:'est-guiones-ok', t:'Guiones aprobados por el cliente', quien:'cliente', ayuda:'No frena el paso a Sistemas.'}]},
  {k:'sistemas', n:'Sistemas y montado del embudo', re:/sistema|montado|sprint/i, llamada:'',
   tareas:[
    {id:'sis-accesos-cli', t:'Dio los accesos al CRM y a Meta', quien:'cliente', ayuda:'Con los instructivos que le mandó Santi en Estrategia.'},
    {id:'sis-whatsapp', t:'Conectó su WhatsApp al CRM', quien:'cliente', ayuda:'Sin esto no sale el mensaje 1.'},
    {id:'sis-pago-meta', t:'Medio de pago de Meta al día', quien:'cliente', ayuda:'Con un pago pendiente Meta no entrega ni deja editar anuncios.'},
    {id:'sis-aceptar', t:'Aceptar las invitaciones al portfolio de Meta y al CRM', quien:'claude',
     ayuda:'Apenas el cliente las manda: desde la cuenta de Angie, y avisa en la ficha qué quedó aceptado.'},
    {id:'sis-accesos', t:'Chequear que dieron los accesos (CRM y Meta)', quien:'csm', ayuda:'Los da el cliente con los instructivos que se mandaron en Estrategia.'},
    {id:'sis-estaticos', t:'Estáticos creados y auditados', quien:'delivery',
     ayuda:'4 o 5 por conjunto, persona fija, el avatar nombrado y la promesa arriba, fotos que parezcan reales.'},
    {id:'sis-estaticos-ok', t:'Estáticos aprobados por el cliente', quien:'cliente'},
    {id:'sis-embudo', t:'Landing y embudo montados', quien:'delivery', ayuda:'Con la skill lanzar-embudo: marca del cliente, gracias con 5 s a WhatsApp y evento Lead, un solo pipeline si es de agenda.'},
    {id:'sis-landing-ok', t:'Landing aprobada por el cliente', quien:'cliente'},
    {id:'sis-mensaje1', t:'Mensaje 1 automático y mail de nueva oportunidad al cliente', quien:'delivery'},
    {id:'sis-medicion', t:'CRM y medición conectados (píxel, CAPI y eventos)', quien:'delivery'},
    {id:'sis-campana', t:'Campaña montada en pausa', quien:'delivery',
     ayuda:'Con la nomenclatura. Cuenta nueva: un solo anuncio a USD 5 por día los primeros 3 o 4 días.'},
    {id:'sis-videos', t:'Grabó los videos de los guiones aprobados', quien:'cliente', ayuda:'Para la segunda tanda: no frena el lanzamiento.'},
    {id:'sis-prueba', t:'Probar el embudo con el número de prueba', quien:'delivery',
     ayuda:'«Prueba Test» y el 11 3305-5322: verificar en WhatsApp Web el mensaje 1 y de qué número sale.'},
    {id:'sis-resultado-armado', t:'Armar la página del resultado final', quien:'claude',
     ayuda:'Estáticos, landing y los videos del calendario y el pipeline (instructivos del CRM), para que Santi la mande.'},
    {id:'sis-resultado', t:'Mandar el mensaje con el link del resultado final', quien:'csm',
     ayuda:'Al cliente y a quien atiende los leads.'}]},
  {k:'lanzamiento', n:'Lanzamiento', re:/^(?!.*sprint).*(lanzam|launch)/i, llamada:'',
   tareas:[
    {id:'lan-prueba', t:'Probar el embudo entero como lead', quien:'csm',
     ayuda:'Con el número de prueba y «Prueba Test»: anuncio, agenda o registro, WhatsApp y CRM.'},
    {id:'lan-prendidas', t:'Campañas prendidas', quien:'delivery',
     ayuda:'Cuenta nueva: un solo anuncio a USD 5 por día los primeros 3 o 4 días, después el resto.'},
    {id:'lan-72h', t:'72 h de monitoreo', quien:'delivery', ayuda:'Menos de 7 días es aprendizaje: no se alarma por costo.'},
    {id:'lan-videos', t:'Segunda tanda: videos editados y auditados', quien:'delivery',
     ayuda:'Con lo que grabó el cliente; auditoría de cortes en 0 antes de mostrarlos.'},
    {id:'lan-reporte', t:'Link del reporte de campañas cargado y enviado', quien:'delivery'},
    {id:'lan-audio', t:'Audio explicando los mensajes diarios y pidiendo feedback', quien:'csm',
     ayuda:'Antes del primer mensaje diario.'},
    {id:'lan-prueba-cli', t:'Probó cómo le llega un lead (mensaje 1 y mail)', quien:'cliente'},
    {id:'lan-instructivos-cli', t:'Recibió y vio los instructivos del CRM', quien:'cliente', ayuda:'Están en la página del resultado final.'},
    {id:'lan-grupal', t:'Sumarlo a las capacitaciones grupales de los viernes', quien:'csm', msg:'capacitacion'}]},
  {k:'recurrente', n:'Recurrente', re:/recurrent|gesti[oó]n mensual/i, llamada:'',
   tareas:[
    {id:'rec-diario', t:'Mensaje diario', quien:'csm', cada:'dia',
     ayuda:'De lunes a viernes: presupuesto, qué trajo, pipeline, qué vemos y qué hacemos.'},
    {id:'rec-grupal', t:'Conectarse a la grupal de los viernes', quien:'csm', cada:'semana'},
    {id:'rec-revision', t:'Revisar los reportes con Angie antes de la grupal', quien:'csm', cada:'semana', ayuda:'Cerca del viernes, para llevarle a Martín qué recomendamos con cada cliente.'},
    {id:'rec-viernes', t:'Reporte de los viernes para Martín', quien:'delivery', cada:'semana',
     ayuda:'Datos duros, contexto del equipo y feedback del cliente (3 pilares).'},
    {id:'rec-pipeline', t:'Movió las oportunidades en el pipeline', quien:'cliente', cada:'semana',
     ayuda:'Así el reporte muestra agendas, asistencias y ventas reales.'},
    {id:'rec-feedback', t:'Dio feedback de la calidad de los leads', quien:'cliente', cada:'semana'},
    {id:'rec-grupal-cli', t:'Se conectó a la grupal de los viernes', quien:'cliente', cada:'semana'},
    {id:'rec-cambios', t:'Aplicar los cambios de campañas acordados', quien:'delivery', cada:'semana',
     ayuda:'Los del reporte del viernes, con el OK de Angie.'},
    {id:'rec-creativos', t:'Nuevos creativos al aire', quien:'delivery', cada:'mes'}]}
];
var CSM_QUIEN={csm:'CSM', delivery:'Delivery', claude:'Claude', cliente:'Cliente'};

function csmEtapaDef(k){
  return CSM_ETAPAS.filter(function(e){ return e.k===k; })[0]||null;
}
/* De un label de la ruta o del tablero a la etapa del CSM. Lanzamiento va antes
   que sistemas a propósito: un «Lanzamiento del embudo» es lanzamiento. El
   «Sprint de lanzamiento» es el montaje, así que es de sistemas (su `re` lo
   saca de lanzamiento). «Alta Cliente» y «Pago / onboarding» son onboarding,
   y «Documento dataset», estrategia. */
function csmEtapaDeLabel(label){
  var l=String(label||'');
  if(!l) return null;
  var orden=['onboarding','estrategia','lanzamiento','sistemas','recurrente'];
  for(var i=0;i<orden.length;i++){
    var e=csmEtapaDef(orden[i]);
    if(e.re.test(l)) return e;
  }
  return null;
}
// La etapa en la que está parado, la misma columna del tablero: dos ideas de
// «en qué etapa está» terminan contradiciéndose.
function csmEtapaActual(c){
  try{
    var e=(typeof _p360Etapa==='function')?_p360Etapa(c):null;
    return e ? csmEtapaDeLabel(e.l) : null;
  }catch(err){ return null; }
}

/* La llamada de la etapa: si ya se hizo, si está agendada y para cuándo.
   ⚠️  UNA CITA ADIVINADA NO CUENTA (CLAUDE.md: agendada ≠ hecha, y una adivinada
       menos). La ata la app sola por el título y se equivoca, así que se
       muestra como «a confirmar» y no tilda nada. Valen la grabación o el
       tildado a mano de la ruta (hecha) y las citas de GHL o cargadas a mano
       (agendada). Una cancelada se dice, porque es lo que hay que reagendar. */
function csmCita(c, def){
  if(!c || !def || !def.llamada) return null;
  var hecha=null;
  try{
    var r=(typeof _ruta==='function')?(_ruta(c)||[]):[];
    /* Una etapa que quedó «hecha» porque se arrastró la tarjeta más adelante
       (p360Mover, `c.rutaMovida`) no es una llamada que se hizo: el 29/10 eso
       tildó solas las de agendar de Apc, Automia, Savia y Atentamente. */
    var mov=(c.rutaMovida && typeof c.rutaMovida==='object')?c.rutaMovida:{};
    var h=r.filter(function(x){ return !x.manual && !(mov[x.l] && x.aMano) && def.re.test(String(x.l||'')) && x.estado==='hecho'; })[0];
    if(h) hecha={estado:'hecha', cuando:h.fecha||null};
  }catch(err){}
  var citas=(c.citas && typeof c.citas==='object')?c.citas:{};
  var real=null, adiv=null, canc=null;
  Object.keys(citas).forEach(function(k){
    var x=citas[k];
    if(!x || !x.inicio || !def.re.test(k)) return;
    var d=new Date(x.inicio); if(isNaN(d)) return;
    if(String(x.estado||'')==='cancelled'){ if(!canc||d>canc) canc=d; return; }
    if(!x.como || x.como==='adivinada'){ if(!adiv||d>adiv) adiv=d; return; }
    if(!real||d>real) real=d;
  });
  /* Una cita que viene le gana a la grabación: en Estrategia hay dos llamadas,
     y con la primera hecha y la segunda puesta lo que importa es la que viene. */
  if(real && real>new Date()) return {estado:'agendada', cuando:real};
  if(hecha) return hecha;
  if(real) return {estado:'agendada', cuando:real};
  if(adiv) return {estado:'adivinada', cuando:adiv};
  if(canc) return {estado:'cancelada', cuando:canc};
  return {estado:'sin', cuando:null};
}

// El lunes de la semana de una fecha, a las 0: «esta semana» de las que se repiten.
function _csmLunes(d){
  var x=new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dia=(x.getDay()+6)%7;
  x.setDate(x.getDate()-dia);
  return x;
}
/* Si una tarea está hecha, y por qué. `auto` = la tildó la cita, no una persona:
   no se destilda a mano (volvería a tildarse sola en el próximo render). */
function csmTareaEstado(c, t, def, ahora){
  ahora=ahora||new Date();
  var m=((c && c.csmTareas)||{})[t.id]||null;
  var ok=!!(m && m.ok);
  if(ok && t.cada && m.at){
    var at=new Date(m.at);
    if(isNaN(at)) ok=false;
    else if(t.cada==='dia') ok=(at.toDateString()===ahora.toDateString());
    else if(t.cada==='semana') ok=(at>=_csmLunes(ahora));
    else if(t.cada==='mes') ok=(at.getFullYear()===ahora.getFullYear() && at.getMonth()===ahora.getMonth());
  }
  /* Las de una etapa que el cliente ya pasó se dan por hechas (Angie,
     02/11/2026), igual que «Mover acá» en la ruta da por hechas las
     anteriores. Solo si nadie la tocó: destildada a mano queda {ok:false} y
     manda eso. */
  // La de agendar no: una llamada no se da por hecha porque movieron la tarjeta
  // (CLAUDE.md, agendada ≠ hecha). Esa la tilda la agenda o una persona.
  if(!m && def && !t.agenda && typeof csmEtapaActual==='function'){
    var _act=csmEtapaActual(c), _ia=_act?CSM_ETAPAS.indexOf(_act):-1, _it=CSM_ETAPAS.indexOf(def);
    if(_ia>0 && _it>=0 && _it<_ia) return {ok:true, auto:true, porEtapa:true, cita:null, at:'', por:''};
  }
  if(!ok && t.agenda){
    var ci=csmCita(c, def);
    if(ci && (ci.estado==='agendada' || ci.estado==='hecha'))
      return {ok:true, auto:true, cita:ci, at:'', por:''};
  }
  return {ok:ok, auto:false, cita:null, at:(ok&&m)?(m.at||''):'', por:(ok&&m)?(m.por||''):'',
    evidencia:(ok&&m)?String(m.evidencia||''):''};
}

function _csmCliente(id){
  return ((typeof DB==='object' && DB && DB.clients)||[]).filter(function(x){ return x && x.id===id; })[0]||null;
}
function _csmYo(){ return String((typeof SB==='object' && SB && SB.email)||''); }

// Quién y cuándo, como en las tareas de la plantilla: una tarea tildada sin
// rastro no se puede auditar, y es lo que se pregunta cuando algo no se hizo.
/* El tilde se guarda con _cliEditarEnNube: se aplica sobre la copia de la nube
   si otra sesión guardó ese cliente en el medio. Con save() a secas, dos
   personas con el tracker abierto se pisaban y el tilde de una desaparecía. */
function _csmEditar(clientId, fn){
  var c=_csmCliente(clientId); if(!c) return;
  // Se ve al instante en esta copia; el cambio es idempotente, así que
  // aplicarlo de nuevo sobre la de la nube no lo duplica.
  fn(c);
  if(typeof _cliEditarEnNube==='function'){
    var ap={}; ap[String(clientId)]=fn;
    var pr=_cliEditarEnNube(ap);
    if(pr && typeof pr.then==='function')
      pr.then(function(){ if(typeof p360Repintar==='function') p360Repintar(); });
  }else save();
  if(typeof p360Repintar==='function') p360Repintar();
}
function _csmEtapaPasada(c, tareaId){
  var x=_csmTareaDeId(String(tareaId)), act=(typeof csmEtapaActual==='function')?csmEtapaActual(c):null;
  return !!(x && act && CSM_ETAPAS.indexOf(x.def)<CSM_ETAPAS.indexOf(act));
}
function csmTildar(clientId, tareaId, val){
  var yo=_csmYo(), at=new Date().toISOString();
  // Se calcula una vez sobre la tarjeta: la copia de la nube no trae la ruta.
  var pasada=_csmEtapaPasada(_csmCliente(clientId), tareaId);
  _csmEditar(clientId, function(d){
    d.csmTareas=(d.csmTareas && typeof d.csmTareas==='object')?d.csmTareas:{};
    if(val) d.csmTareas[tareaId]={ok:true, at:at, por:yo};
    // Una de una etapa pasada se daría por hecha sola: destildarla se guarda.
    else if(pasada) d.csmTareas[tareaId]={ok:false, at:at, por:yo};
    else delete d.csmTareas[tareaId];
  });
}

/* Lo que hace Claude o una rutina también tilda la tarea del CSM (Angie,
   28/10/2026). Las rutinas no pueden escribir `datos` (lo pisaría la app
   abierta de cualquiera), así que mandan el hecho a `maquina.hechos` con
   rpc/agregar_hechos (migración 051) y un campo `csmTarea` con el id de
   CSM_ETAPAS; la app, que sí escribe `datos`, lo pasa a `c.csmTareas`.
   - Lo manual manda: si la tarea ya estaba tildada a mano, no se toca.
   - Se aplica una sola vez por hecho, y el registro va aparte
     (`c.csmHechosAplicados`) y no adentro de `c.csmTareas[id]`: destildar a
     mano borra esa entrada, y con ella se perdería que el hecho ya se usó y
     se volvería a tildar sola en el próximo ciclo, contra lo que decidió la
     persona. Tampoco se comparte `c.hechosAplicados`: ese lo marca
     hechosAplicar() al cerrar el ticket, y si corre antes, esto se saltearía.
   - La fecha es la del hecho, a las 12 locales: «2026-10-28» solo se lee como
     medianoche UTC, que en Argentina es el 27 a la noche, y una de las que se
     repiten («mensaje diario») quedaría tildada para el día anterior. */
function _csmTareaDeId(id){
  for(var i=0;i<CSM_ETAPAS.length;i++){
    var t=CSM_ETAPAS[i].tareas.filter(function(x){ return x.id===id; })[0];
    if(t) return {def:CSM_ETAPAS[i], t:t};
  }
  return null;
}
/* Notas de una tarea de etapa (Angie, 02/11/2026): las tareas son las mismas
   para todos los clientes y lo particular de cada uno («nicho seguridad
   privada», «la línea nueva puede tardar») va como nota en la tarea, no como
   un ticket aparte. Viven en datos.csmNotas[id] = [{t, at, de, hecho|cambio}]. */
function csmNotaSumar(c, id, n){
  if(!c || !id || !n || !String(n.t||'').trim()) return false;
  c.csmNotas=(c.csmNotas && typeof c.csmNotas==='object')?c.csmNotas:{};
  var L=Array.isArray(c.csmNotas[id])?c.csmNotas[id]:[];
  var clave=n.hecho||n.cambio;
  if(clave && L.some(function(x){ return x && (x.hecho===clave || x.cambio===clave); })) return false;
  L.push({t:String(n.t).replace(/\s+/g,' ').trim().slice(0,300), at:n.at||new Date().toISOString().slice(0,10),
    de:n.de||'', hecho:n.hecho||undefined, cambio:n.cambio||undefined});
  c.csmNotas[id]=L.slice(-8);
  return true;
}
function _csmNotasHtml(c, id){
  var L=((c && c.csmNotas)||{})[id];
  if(!Array.isArray(L) || !L.length) return '';
  return '<div class="csm-notas">'+L.slice(-3).map(function(n){
    return '<div>'+esc(n.t)+'</div>'; }).join('')+'</div>';
}
function csmHechosCliente(c, ahora){
  var r={tildadas:0, vistos:0};
  if(!c) return r;
  var L=((c.hechos||{}).items)||[];
  if(!Array.isArray(L) || !L.length) return r;
  ahora=ahora||new Date();
  L.forEach(function(h){
    /* `notaTarea` es la nota sin tildar con otro nombre: una versión vieja de
       la app abierta en otra pestaña no lo conoce y no tilda nada por error. */
    var _id=h && (h.csmTarea||h.notaTarea);
    if(!h || !h.id || !_id) return;
    c.csmHechosAplicados=(c.csmHechosAplicados && typeof c.csmHechosAplicados==='object')?c.csmHechosAplicados:{};
    if(c.csmHechosAplicados[h.id]) return;
    // Un id que no existe (mal escrito, o una tarea que todavía no está en la
    // lista) no tilda nada y tampoco se da por usado: si después se suma la
    // tarea, el hecho la tilda.
    var x=_csmTareaDeId(String(_id));
    if(!x) return;
    c.csmHechosAplicados[h.id]=ahora.toISOString(); r.vistos++;
    /* `soloNota` (02/11/2026): el ticket repetía una tarea de la etapa. Su
       detalle pasa como nota a esa tarea y la tarea NO se tilda: que exista el
       ticket no quiere decir que la tarea esté hecha. */
    if(h.notaTarea && !h.csmTarea) h=Object.assign({}, h, {soloNota:true});
    if(h.soloNota || h.nota){
      csmNotaSumar(c, x.t.id, {t:String(h.nota||h.texto||''), at:String(h.fecha||''), de:String(h.ticket||''), hecho:String(h.id)});
      if(h.soloNota) return;
    }
    // Con csmTareaEstado y no con «hay entrada»: un «mensaje diario» de ayer
    // ya no cuenta como tildado hoy. La agenda no cuenta como mano (auto).
    var st=csmTareaEstado(c, x.t, x.def, ahora);
    if(st.ok && !st.auto) return;
    var f=/^\d{4}-\d{2}-\d{2}$/.test(String(h.fecha||'')) ? new Date(h.fecha+'T12:00:00') : ahora;
    c.csmTareas=(c.csmTareas && typeof c.csmTareas==='object')?c.csmTareas:{};
    c.csmTareas[x.t.id]={ok:true, at:(isNaN(f)?ahora:f).toISOString(), por:'claude',
      evidencia:String(h.evidencia||'').slice(0,300), hecho:String(h.id)};
    r.tildadas++;
  });
  return r;
}
/* Igual que hechosAplicar: solo con la nube ya bajada, para no guardar encima
   de datos viejos ni tildar con una máquina que todavía no llegó. Se guarda
   también cuando solo se marcó un hecho como visto (la tarea ya estaba tildada
   a mano): si no, al destildarla después el hecho la volvería a tildar. */
function csmHechosAplicar(){
  if(typeof SB!=='object' || !SB || !SB.listo) return 0;
  var n=0, vistos=0, ahora=new Date();
  ((typeof DB==='object' && DB && DB.clients)||[]).forEach(function(c){
    var r=csmHechosCliente(c, ahora); n+=r.tildadas; vistos+=r.vistos;
  });
  if(vistos){
    save();
    if(n && typeof p360Repintar==='function') p360Repintar();
  }
  return n;
}

// Ver otra etapa que no es la de ahora (la columna puede estar corrida, o se
// quiere repasar lo que quedó atrás). Es de la pantalla, no se guarda.
function csmVerEtapa(clientId, k){
  S.csmEtapaVer=S.csmEtapaVer||{};
  S.csmEtapaVer[clientId]=k;
  if(typeof p360Repintar==='function') p360Repintar();
}

/* El bloqueante de la etapa. Texto libre, quién lo destraba (una persona del
   equipo o el cliente) y para cuándo. Cada campo guarda al salir, sin botón
   que se pueda olvidar, igual que la plantilla. */
function csmTrabaSet(clientId, k, campo, valor){
  if(!csmEtapaDef(k) || ['t','quien','para'].indexOf(campo)<0) return;
  var yo=_csmYo(), at=new Date().toISOString(), v=String(valor||'').trim();
  _csmEditar(clientId, function(d){
    d.etapaTraba=(d.etapaTraba && typeof d.etapaTraba==='object')?d.etapaTraba:{};
    var tr=d.etapaTraba[k]||{t:'', quien:'', para:''};
    tr[campo]=v; tr.at=at; tr.por=yo;
    if(!tr.t && !tr.quien && !tr.para) delete d.etapaTraba[k];
    else d.etapaTraba[k]=tr;
  });
}
function csmTrabaQuitar(clientId, k){
  _csmEditar(clientId, function(d){ if(d.etapaTraba) delete d.etapaTraba[k]; });
}
function csmTrabaEditar(clientId, k){
  S.csmTrabaAbierta=clientId+':'+k;
  if(typeof p360Repintar==='function') p360Repintar();
}

function _csmFecha(d, conHora){
  if(!d) return '';
  var x=(d instanceof Date)?d:new Date(d);
  if(isNaN(x)) return '';
  var s=x.toLocaleDateString('es-AR', {weekday:'short', day:'numeric', month:'numeric'});
  if(conHora && (x.getHours()||x.getMinutes()))
    s+=' '+('0'+x.getHours()).slice(-2)+':'+('0'+x.getMinutes()).slice(-2);
  return s;
}
function _csmNom(mail){
  if(!mail) return '';
  if(mail==='cliente') return 'el cliente';
  // La tildó un hecho de maquina.hechos (rutina o Claude), no una persona.
  if(mail==='claude') return 'Claude';
  return (typeof _petNom==='function')?_petNom(mail):mail;
}

/* La línea de abajo: la llamada de la etapa y el bloqueante. Es lo que se mira
   sin entrar a las tareas: si está agendada (con fecha) y qué la frena. */
function _csmEstadoHtml(c, def){
  var out='';
  var ci=csmCita(c, def);
  if(ci){
    var tx, col='var(--text2)';
    if(ci.estado==='hecha'){ tx='se hizo'+(ci.cuando?(' el '+_csmFecha(ci.cuando)):''); col='var(--accent)'; }
    else if(ci.estado==='agendada'){ tx='agendada para el '+_csmFecha(ci.cuando, true); col='var(--accent)'; }
    else if(ci.estado==='adivinada') { tx='hay una cita del '+_csmFecha(ci.cuando, true)
      +' que la app ató sola: confirmala en la agenda antes de darla por agendada'; col='var(--amberx)'; }
    else if(ci.estado==='cancelada'){ tx='la del '+_csmFecha(ci.cuando)+' se canceló: hay que reagendarla'; col='var(--amberx)'; }
    else { tx='sin agendar'; col='var(--amberx)'; }
    // nowrap explícito: en el celular la hoja general le pone wrap a los flex
    // del popup y el 📅 quedaba solo, en un renglón arriba del texto.
    out+='<div style="display:flex;flex-wrap:nowrap;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.45;color:'+col+'">'
      +'<span aria-hidden="true" style="flex:none">📅</span>'
      +'<span style="flex:1;min-width:0">'+esc(def.llamada)+': '+esc(tx)+'</span></div>';
  }
  var tr=((c.etapaTraba||{})[def.k])||null;
  var abierto=(typeof S==='object' && S && S.csmTrabaAbierta===c.id+':'+def.k);
  var lock=(typeof _petLockSvg==='function')?_petLockSvg():'';
  if(abierto){
    var campo='box-sizing:border-box;font-family:var(--font);font-size:13px;padding:8px 10px;'
      +'border-radius:var(--radius);border:1px solid var(--border2);background:var(--bg2);color:var(--text)';
    var arg=c.id+',\''+def.k+'\'';
    var ps=(typeof personas==='function')?personas():[];
    var q=String((tr&&tr.quien)||'').toLowerCase();
    var opts='<option value=""'+(q?'':' selected')+'>quién lo destraba</option>'
      +'<option value="cliente"'+(q==='cliente'?' selected':'')+'>El cliente</option>'
      +ps.map(function(p){
        var m=String(p.email||'');
        return '<option value="'+esc(m)+'"'+(q===m.toLowerCase()?' selected':'')+'>'+esc(p.nombre||m)+'</option>';
      }).join('');
    out+='<div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">'
      +'<label style="font-size:11px;color:var(--text3)">Qué la bloquea'
        +'<input type="text" autocomplete="off" value="'+esc((tr&&tr.t)||'')+'" '
        +'placeholder="Ej.: falta que nos den el acceso a Meta" style="'+campo+';width:100%;margin-top:3px" '
        +'onchange="csmTrabaSet('+arg+',\'t\',this.value)"></label>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
        +'<select aria-label="Quién lo destraba" style="'+campo+';flex:1 1 150px" '
          +'onchange="csmTrabaSet('+arg+',\'quien\',this.value)">'+opts+'</select>'
        +'<input type="date" aria-label="Para cuándo" value="'+esc((tr&&tr.para)||'')+'" '
          +'style="'+campo+';flex:1 1 130px" onchange="csmTrabaSet('+arg+',\'para\',this.value)">'
      +'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
        +'<button class="btn btn-sm" onclick="S.csmTrabaAbierta=null;p360Repintar()">Listo</button>'
        +(tr?('<button class="btn btn-sm" title="Ya no frena: se borra el bloqueante" '
          +'onclick="S.csmTrabaAbierta=null;csmTrabaQuitar('+arg+')">Se destrabó</button>'):'')
      +'</div></div>';
  }else if(tr && tr.t){
    // Mismo dibujo que el freno de arriba de la ficha (candado en ámbar): es
    // la misma idea, lo que no deja avanzar la etapa.
    var para=tr.para?new Date(tr.para+'T12:00:00'):null;
    var vencido=!!(para && !isNaN(para) && para<new Date(new Date().toDateString()));
    out+='<div class="p3fi-frena" style="cursor:pointer" role="button" tabindex="0" '
      +'title="Tocar para editarlo" onclick="csmTrabaEditar('+c.id+',\''+def.k+'\')">'+lock
      +'<span>'+esc(tr.t)
        +'<span style="color:var(--text2)">'
        +(tr.quien?(' · lo destraba '+esc(_csmNom(tr.quien))):'')
        +(para&&!isNaN(para)?(' · para el '+esc(_csmFecha(para))):'')
        +'</span>'
        +(vencido?' <span style="color:var(--redx)">· vencido</span>':'')
      +'</span></div>';
  }
  /* «Sin bloqueante · cargar uno» ya no ocupa un renglón (02/11/2026): va
     chico a la derecha de las pestañas (_csmEtapaHtml). */
  return out?('<div class="csm-est">'+out+'</div>'):'';
}

/* El bloque de la ficha (diseño elegido por Angie el 02/11/2026, «secciones con
   contador»). Antes eran 16 renglones de todos mezclados y abrumaba: ahora una
   línea de resumen, la etapa en pestañas de texto y cuatro secciones con su
   número. Solo «Tuyo» viene abierta; el resto del equipo, lo que espera del
   cliente y lo hecho se abren con un toque. «Tuyo» es lo del CSM si mira el
   CSM, y lo de delivery si mira cualquier otro del equipo. */
function csmSeccion(clientId, k, sec){
  S.csmSecc=S.csmSecc||{};
  var key=clientId+':'+k+':'+sec;
  S.csmSecc[key]=!_csmSeccAbierta(clientId, k, sec);
  if(typeof p360Repintar==='function') p360Repintar();
}
function _csmSeccAbierta(clientId, k, sec){
  var v=((typeof S==='object' && S && S.csmSecc)||{})[clientId+':'+k+':'+sec];
  if(v!==undefined) return !!v;
  // En pantalla ancha hay lugar: el resto del equipo y lo del partner vienen
  // abiertos en la columna de la derecha. En el celular, solo «Tuyo».
  var ancho=false;
  try{ ancho=!!(window.matchMedia && window.matchMedia('(min-width:1000px)').matches); }catch(e){}
  return sec==='tuyo' || (ancho && (sec==='equipo' || sec==='partner'));
}
function _csmEtapaHtml(c){
  if(!c) return '';
  if(typeof esProspecto==='function' && esProspecto(c)) return '';
  var act=csmEtapaActual(c);
  var ver=(typeof S==='object' && S && S.csmEtapaVer && S.csmEtapaVer[c.id])
    ? csmEtapaDef(S.csmEtapaVer[c.id]) : null;
  var def=ver||act;
  var csm=(typeof _csmMail==='function')?_csmMail():'';
  var yo=(typeof _soyCsm==='function' && _soyCsm())?'csm':'delivery';
  var ahora=new Date();
  // Las etapas como pestañas de texto. La de ahora lleva un punto lima.
  var tabs='<div class="csm-tabs">'
    +CSM_ETAPAS.map(function(e){
      var on=!!(def && def.k===e.k), esAhora=!!(act && act.k===e.k);
      return '<button class="'+(esAhora?'ahora':'')+'" aria-pressed="'+on+'" '
        +'onclick="csmVerEtapa('+c.id+',\''+e.k+'\')"'
        +(esAhora?' title="La etapa en la que está"':'')+'>'
        +esc(e.n.split(' ')[0])+'</button>';
    }).join('')+'</div>';
  if(!def){
    return '<div class="csm-blq">'+tabs
      +'<div style="font-size:12.5px;color:var(--text2);padding:10px 0 2px">'
      +'La etapa de ahora no tiene tareas. Tocá una etapa para ver las suyas.</div></div>';
  }
  function quienNom(q){ return q==='csm'?(csm?_csmNom(csm):CSM_QUIEN.csm):(q==='cliente'?'Partner':CSM_QUIEN[q]); }
  function fila(t, st, o){
    var meta=[];
    if(o.quien) meta.push('<span>'+esc(quienNom(t.quien))+'</span>');
    if(o.ayuda && t.ayuda) meta.push('<span>'+esc(t.ayuda)+'</span>');
    if(st.porEtapa){
      meta.push('<span>dada por hecha: el cliente ya pasó esta etapa</span>');
    }else if(st.auto){
      meta.push('<span style="color:var(--accent)">'
        +(st.cita.estado==='hecha'?'ya se hizo':('agendada para el '+esc(_csmFecha(st.cita.cuando, true))))
        +' · la tildó la agenda</span>');
    }else if(st.ok){
      /* La evidencia del hecho en el title, y al tocar sale en un aviso: en
         el celular no hay mouse, y sin ver la evidencia un tildado de Claude
         no se puede auditar. */
      var ev=st.evidencia
        ? (' title="'+esc(st.evidencia)+'" style="cursor:help;border-bottom:1px dotted var(--border2)" '
          +'onclick="if(typeof toast===\'function\')toast(this.title)"') : '';
      meta.push('<span'+ev+'>hecha'+(st.at?(' el '+esc(new Date(st.at).toLocaleDateString('es-AR'))):'')
        +(st.por?(' por '+esc(_csmNom(st.por))):'')+'</span>');
    }
    if(t.cada && !st.ok) meta.push('<span class="amb">'+(t.cada==='dia'?'falta hoy':(t.cada==='mes'?'falta este mes':'falta esta semana'))+'</span>');
    /* El 📅 en verde al lado de la tarea de agendar, una vez tildada (pedido
       de Angie): se ve de un vistazo que la llamada está puesta. */
    var cal=(t.agenda && st.ok)
      ? ' <span title="Agendada" style="display:inline-flex;align-items:center;justify-content:center;'
        +'width:20px;height:20px;border-radius:6px;background:rgba(200,255,71,.14);'
        +'vertical-align:-3px;font-size:12px">📅</span>' : '';
    var click=(st.auto && !st.porEtapa)
      ? ' disabled title="La tilda la cita de la agenda. Si no corresponde, sacá la cita."'
      : (' title="'+(st.ok?'Destildar':'Marcar como hecha')+'" '
        +'onclick="csmTildar('+c.id+',\''+t.id+'\','+(st.ok?'false':'true')+')"');
    return '<div class="pet-fila'+(st.ok?' hecha':'')+'">'
      +'<button class="pet-chk'+(st.ok?' ok':'')+'"'+click+'>✓</button>'
      +'<div class="pet-cuerpo">'
        /* La última palabra va pegada al 📅: en el celular el ícono bajaba solo
           a un renglón aparte y dejaba de leerse como parte de la tarea. */
        +'<div class="pet-txt">'+(cal
          ? (esc(t.t.replace(/\s*\S+$/,''))+' <span style="white-space:nowrap">'
             +esc((t.t.match(/\S+$/)||[''])[0])+cal+'</span>')
          : esc(t.t))+'</div>'
        +(meta.length?('<div class="pet-meta">'+meta.join('<span class="pt">·</span>')+'</div>'):'')
        +_csmNotasHtml(c, t.id)
      +'</div>'
      +(function(){
        if(!t.msg || typeof _cmMensaje!=='function') return '';
        var m=_cmMensaje(c, t.msg)||{};
        return '<button class="pet-msg'+(m.falta?' falta':'')+'" '
          +'title="'+esc(m.falta||'Copia el mensaje para pegarlo en el WhatsApp del cliente')+'" '
          +'onclick="event.stopPropagation();cliMenuCopiar('+c.id+',\''+t.msg+'\')">'
          +(m.falta?'Falta el link':'Copiar mensaje')+'</button>';
      })()
      +'</div>';
  }
  var sec={tuyo:[], equipo:[], partner:[], hechas:[]}, hechas=0;
  def.tareas.forEach(function(t){
    var st=csmTareaEstado(c, t, def, ahora), x={t:t, st:st};
    if(st.ok){ hechas++; sec.hechas.push(x); }
    else if(t.quien==='cliente') sec.partner.push(x);
    else if(t.quien===yo) sec.tuyo.push(x);
    else sec.equipo.push(x);
  });
  var SECC=[
    ['tuyo','Tuyo',{ayuda:true}],
    ['equipo','Resto del equipo',{quien:true}],
    ['partner','Esperando al partner',{}],
    ['hechas','Hechas',{quien:true}]
  ];
  var bloques=SECC.map(function(s){
    var xs=sec[s[0]], abierta=_csmSeccAbierta(c.id, def.k, s[0]);
    return '<button class="csm-sec'+(abierta?' on':'')+'" aria-expanded="'+abierta+'" '
        +'onclick="csmSeccion('+c.id+',\''+def.k+'\',\''+s[0]+'\')">'
        +'<span>'+s[1]+'</span><span class="n">'+xs.length+'</span></button>'
      +(abierta
        ? ('<div class="csm-secb">'+(xs.length
            ? xs.map(function(x){ return fila(x.t, x.st, s[2]); }).join('')
            : '<div class="csm-vacio">'+(s[0]==='tuyo'?'Nada tuyo pendiente en esta etapa.':'Nada.')+'</div>')
          +'</div>')
        : '');
  });
  /* Dos columnas en pantalla ancha (02/11/2026): lo tuyo a la izquierda, lo
     de los demás a la derecha. Antes la derecha quedaba vacía sin tickets. */
  var cuerpo='<div class="csm-grid"><div class="csm-col">'+bloques[0]+'</div>'
    +'<div class="csm-col">'+bloques.slice(1).join('')+'</div></div>';
  /* Sin la línea «Sistemas y montado del embudo · 1 de 16»: el nombre ya está
     en el encabezado de la ficha y en la pestaña marcada (Angie, 02/11/2026).
     El conteo y el bloqueante van chicos a la derecha de las pestañas. */
  var tr=((c.etapaTraba||{})[def.k])||null;
  var lado='<div class="csm-lado"><span>'+hechas+' de '+def.tareas.length+'</span>'
    +((tr&&tr.t)?'':('<button onclick="csmTrabaEditar('+c.id+',\''+def.k+'\')" title="Cargar qué la bloquea">'
      +((typeof _petLockSvg==='function')?_petLockSvg():'')+'Sin bloqueante</button>'))
    +'</div>';
  return '<div class="csm-blq">'
    +_csmEstadoHtml(c, def)
    +'<div class="csm-fila">'+tabs+lado+'</div>'
    +cuerpo
  +'</div>';
}
