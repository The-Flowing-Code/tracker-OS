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
var CSM_ETAPAS=[
  {k:'onboarding', n:'Onboarding', re:/onboard|bienvenida/i, llamada:'Llamada de bienvenida',
   tareas:[
    {id:'onb-agendar', t:'Agendar la llamada de bienvenida', agenda:true,
     ayuda:'15 min. Hasta fin de octubre con Angie; desde noviembre, con Santi.'},
    {id:'onb-llamadas', t:'Chequear que las llamadas estén agendadas'},
    {id:'onb-factura', t:'Verificar los datos de la factura'},
    {id:'onb-accesos', t:'Cargar accesos y demos en la ficha'},
    {id:'onb-formulario', t:'Mandar el formulario personalizado',
     ayuda:'Se genera en la ficha y se copia y pega.'},
    {id:'onb-cafecito', t:'Sumarlo a la invitación del cafecito mensual', msg:'cafecito',
     ayuda:'Último viernes de cada mes, 16 h. La invitación sale de Google Calendar.'}]},
  {k:'estrategia', n:'Estrategia', re:/estrateg|strategy/i, llamada:'Llamada de estrategia',
   tareas:[
    {id:'est-instructivos', t:'Mandar los instructivos de accesos (CRM y Meta)', msg:'instructivos',
     ayuda:'Cuando ya tuvieron un primer contacto.'},
    {id:'est-dataset', t:'Mandar el link del dataset', ayuda:'Cuando Angie lo termina.'},
    {id:'est-agendar', t:'Agendar la llamada de estrategia', agenda:true}]},
  {k:'sistemas', n:'Sistemas y montado del embudo', re:/sistema|montado/i, llamada:'',
   tareas:[
    {id:'sis-accesos', t:'Dieron los accesos'},
    {id:'sis-resultado', t:'Mandar el mensaje con el link del resultado final',
     ayuda:'Estáticos, landing e instructivos del pipeline.'}]},
  {k:'lanzamiento', n:'Lanzamiento', re:/lanzam|launch/i, llamada:'',
   tareas:[
    {id:'lan-prueba', t:'Probar el embudo entero como lead',
     ayuda:'Cuando el cliente da el OK: anuncio, agenda o registro, WhatsApp y CRM.'},
    {id:'lan-grupal', t:'Sumarlo a las capacitaciones grupales de los viernes', msg:'capacitacion'}]},
  {k:'recurrente', n:'Recurrente', re:/recurrent|gesti[oó]n mensual/i, llamada:'',
   tareas:[
    {id:'rec-diario', t:'Mensaje diario', cada:'dia', ayuda:'De lunes a viernes.'},
    {id:'rec-grupal', t:'Conectarse a la grupal de los viernes', cada:'semana'}]}
];

function csmEtapaDef(k){
  return CSM_ETAPAS.filter(function(e){ return e.k===k; })[0]||null;
}
/* De un label de la ruta o del tablero a la etapa del CSM. Lanzamiento va antes
   que sistemas a propósito: un «Lanzamiento del embudo» es lanzamiento. */
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
    var h=r.filter(function(x){ return !x.manual && def.re.test(String(x.l||'')) && x.estado==='hecho'; })[0];
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
function csmTildar(clientId, tareaId, val){
  var c=_csmCliente(clientId); if(!c) return;
  c.csmTareas=(c.csmTareas && typeof c.csmTareas==='object')?c.csmTareas:{};
  if(val) c.csmTareas[tareaId]={ok:true, at:new Date().toISOString(), por:_csmYo()};
  else delete c.csmTareas[tareaId];
  save();
  if(typeof p360Repintar==='function') p360Repintar();
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
function csmHechosCliente(c, ahora){
  var r={tildadas:0, vistos:0};
  if(!c) return r;
  var L=((c.hechos||{}).items)||[];
  if(!Array.isArray(L) || !L.length) return r;
  ahora=ahora||new Date();
  L.forEach(function(h){
    if(!h || !h.id || !h.csmTarea) return;
    c.csmHechosAplicados=(c.csmHechosAplicados && typeof c.csmHechosAplicados==='object')?c.csmHechosAplicados:{};
    if(c.csmHechosAplicados[h.id]) return;
    c.csmHechosAplicados[h.id]=ahora.toISOString(); r.vistos++;
    // Un id que no existe (mal escrito, o una tarea que se sacó) no tilda nada.
    var x=_csmTareaDeId(String(h.csmTarea));
    if(!x) return;
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
  var c=_csmCliente(clientId); if(!c || !csmEtapaDef(k)) return;
  if(['t','quien','para'].indexOf(campo)<0) return;
  c.etapaTraba=(c.etapaTraba && typeof c.etapaTraba==='object')?c.etapaTraba:{};
  var tr=c.etapaTraba[k]||{t:'', quien:'', para:''};
  tr[campo]=String(valor||'').trim();
  tr.at=new Date().toISOString(); tr.por=_csmYo();
  if(!tr.t && !tr.quien && !tr.para) delete c.etapaTraba[k];
  else c.etapaTraba[k]=tr;
  save();
  if(typeof p360Repintar==='function') p360Repintar();
}
function csmTrabaQuitar(clientId, k){
  var c=_csmCliente(clientId); if(!c || !c.etapaTraba) return;
  delete c.etapaTraba[k];
  save();
  if(typeof p360Repintar==='function') p360Repintar();
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
  }else{
    out+='<div style="display:flex;flex-wrap:nowrap;gap:7px;align-items:center;font-size:12.5px;color:var(--text3);margin-top:6px">'
      +lock+'<span>Sin bloqueante · <a href="javascript:void(0)" '
      +'onclick="csmTrabaEditar('+c.id+',\''+def.k+'\')" style="color:var(--text2);text-decoration:none;'
      +'border-bottom:1px dotted var(--border2)">cargar uno</a></span></div>';
  }
  return '<div style="margin-top:6px;padding:9px 8px 2px;border-top:1px dashed var(--border)">'+out+'</div>';
}

/* El bloque de la ficha. Va arriba de las etapas de la plantilla porque es lo
   que se opera todos los días; las de la plantilla siguen abajo, como antes. */
function _csmEtapaHtml(c){
  if(!c) return '';
  if(typeof esProspecto==='function' && esProspecto(c)) return '';
  var act=csmEtapaActual(c);
  var ver=(typeof S==='object' && S && S.csmEtapaVer && S.csmEtapaVer[c.id])
    ? csmEtapaDef(S.csmEtapaVer[c.id]) : null;
  var def=ver||act;
  var csm=(typeof _csmMail==='function')?_csmMail():'';
  var nom=csm?_csmNom(csm):'el CSM';
  var ahora=new Date();
  // Las etapas en pastillas: la de ahora marcada, para saltar a otra con un toque.
  var chips='<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px">'
    +CSM_ETAPAS.map(function(e){
      var on=!!(def && def.k===e.k);
      var hechas=e.tareas.filter(function(t){ return csmTareaEstado(c, t, e, ahora).ok; }).length;
      return '<button class="pet-tag" style="cursor:pointer;background:none;font-family:var(--font);'
        +(on?'border-color:var(--accent);color:var(--accent)':'')+'" '
        +'onclick="csmVerEtapa('+c.id+',\''+e.k+'\')"'
        +(act&&act.k===e.k?' title="La etapa en la que está"':'')+'>'
        +esc(e.n)+(act&&act.k===e.k?' · ahora':'')
        +' <span style="opacity:.7">'+hechas+'/'+e.tareas.length+'</span></button>';
    }).join('')+'</div>';
  var cuerpo;
  if(!def){
    cuerpo='<div style="font-size:12px;color:var(--text2);padding:6px 2px">'
      +'La etapa de ahora no tiene tareas del CSM. Tocá una etapa para ver las suyas.</div>';
  }else{
    cuerpo=def.tareas.map(function(t){
      var st=csmTareaEstado(c, t, def, ahora);
      var meta=[];
      if(t.ayuda) meta.push('<span>'+esc(t.ayuda)+'</span>');
      if(st.auto){
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
      if(t.cada && !st.ok) meta.push('<span class="amb">'+(t.cada==='dia'?'falta hoy':'falta esta semana')+'</span>');
      /* El 📅 en verde al lado de la tarea de agendar, una vez tildada (pedido
         de Angie): se ve de un vistazo que la llamada está puesta. */
      var cal=(t.agenda && st.ok)
        ? ' <span title="Agendada" style="display:inline-flex;align-items:center;justify-content:center;'
          +'width:20px;height:20px;border-radius:6px;background:rgba(200,255,71,.14);'
          +'vertical-align:-3px;font-size:12px">📅</span>' : '';
      var click=st.auto
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
    }).join('')
    +_csmEstadoHtml(c, def);
  }
  return '<div class="pet-et" style="padding-bottom:9px">'
    +'<div class="pet-eth" style="cursor:default;padding-bottom:0">'
      +'<span>'+(csm?('Tareas de '+esc(nom)):'Tareas del CSM')+'</span>'
      +(def?('<span class="pet-cnt">'+esc(def.n)+'</span>'):'')
    +'</div>'
    +chips+cuerpo
  +'</div>';
}
