/* ── Parte del día v2: la bienvenida nueva (Angie, 19/10/2026) ─────────────
   Modelo: el artifact 4JBuYqxuwiYxb2JfduZsiZ («Propuesta», fondo Faro).
   Es la bienvenida de todo el equipo; la de antes (bienvenidaMostrar, en
   index.html) vuelve solo donde la llave 'evold-bienvenida-v2' esté en '0'.

   ⚠️  NADA INVENTADO. El modelo traía horas por tipo de trabajo y horas que
   «te sacás de encima»: la app no guarda ninguna de las dos. En su lugar va
   lo que sí se mide (llamadas grabadas por vos y minutos activos en la app)
   y lo que espera una decisión tuya, cada cosa con su botón.

   Solo declaraciones: todo lo de la app se usa recién al abrirla. */

/* Es la bienvenida de todo el equipo desde el 19/10/2026 (Angie: «que todos
   tengan la nueva»). Con la llave localStorage 'evold-bienvenida-v2' = '0' no
   sale en ese navegador y vuelve la de antes: es la vuelta atrás sin tocar código. */
function _bv2On(){
  var k=null; try{ k=localStorage.getItem('evold-bienvenida-v2'); }catch(e){}
  return k!=='0';
}

var _BV2={ reun:null, gcal:false, edit:-1 };
var _BV2_JORNADA={ desde:9*60, hasta:19*60 }, _BV2_RESPIRO=10;

function _bv2Hora(d){ d=d||new Date(); return (d.getHours()<10?'0':'')+d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes(); }
function _bv2Min(d){ return d.getHours()*60+d.getMinutes(); }
function _bv2Dur(m){ m=Math.max(0,Math.round(m)); var h=Math.floor(m/60), r=m%60; return h?(h+' h'+(r?' '+r:'')):(r+' min'); }
function _bv2Hoy(d){ var h=new Date(); return d && d.getFullYear()===h.getFullYear() && d.getMonth()===h.getMonth() && d.getDate()===h.getDate(); }
function _bv2Mio(quien){
  var q=String(quien||'').toLowerCase().trim();
  if(!q) return true;   // sin dato de quien la toma: mejor mostrarla que perderla
  var mail=String((SB&&SB.email)||'').toLowerCase(), nom=String(personaNombre((SB&&SB.email)||'')||'').toLowerCase();
  return q===mail || (!!nom && q===nom);
}

/* Las reuniones de hoy. Primero lo que ya está en memoria (las citas de cada
   cliente); después, si hay Google conectado, se suman las de tu calendario
   que no estén (Google copia las de GHL: se descartan por la hora de inicio). */
function _bv2ReunionesLocal(){
  var out=[];
  try{
    (_calEntradas()||[]).forEach(function(x){
      if(x.tipo!=='cita' || x.estado==='cancelled' || !_bv2Hoy(x.at) || !_bv2Mio(x.quien)) return;
      var fin=Date.parse(x.fin||'');
      var min=(fin && fin>x.at.getTime())?Math.round((fin-x.at.getTime())/60000):60;
      out.push({ini:x.at, min:min, w:x.titulo||x.etapa||'Reunión', c:x.cli||'', cliId:x.cliId||null});
    });
  }catch(e){}
  return out.sort(function(a,b){ return a.ini-b.ini; });
}
async function _bv2SumarGoogle(){
  if(_BV2.gcal || typeof _csGcal!=='function') return;
  _BV2.gcal=true;
  var r=null; try{ r=await _csGcal(); }catch(e){ return; }
  var evs=(r&&r.eventos)||[], mail=String((SB&&SB.email)||'').toLowerCase(), cambio=false;
  var ya={}; (_BV2.reun||[]).forEach(function(x){ ya[Math.round(x.ini.getTime()/60000)]=1; });
  evs.forEach(function(ev){
    if(ev.estado==='cancelled' || String(ev.deNuestroLado||'').toLowerCase()!==mail) return;
    var d=new Date(ev.inicio); if(isNaN(d) || !_bv2Hoy(d)) return;
    var k=Math.round(d.getTime()/60000); if(ya[k]) return; ya[k]=1;
    var fin=Date.parse(ev.fin||''), cli=null;
    try{ cli=(DB.clients||[]).find(function(c){ return !c.archived && _citaEsDe(c, ev.titulo, ev.con, ev.mail); }); }catch(e){}
    _BV2.reun.push({ini:d, min:(fin&&fin>d.getTime())?Math.round((fin-d.getTime())/60000):60,
      w:ev.titulo||'Reunión', c:cli?cli.name:(ev.con||''), cliId:cli?cli.id:null});
    cambio=true;
  });
  if(cambio){ _BV2.reun.sort(function(a,b){ return a.ini-b.ini; }); _bv2Pintar(); }
}
function _bv2Dia(){
  var R=_BV2.reun||[], a=_bv2Min(new Date());
  var total=R.reduce(function(t,x){ return t+x.min; },0);
  var resta=R.reduce(function(t,x){ var i=_bv2Min(x.ini), f=i+x.min; return t+(f<=a?0:(i>=a?x.min+_BV2_RESPIRO:f-a)); },0);
  var libre=Math.max(0, _BV2_JORNADA.hasta-Math.max(a,_BV2_JORNADA.desde))-resta;
  var prox=-1; for(var i=0;i<R.length;i++){ if(_bv2Min(R[i].ini)+R[i].min>a){ prox=i; break; } }
  return {n:R.length, total:total, libre:Math.max(0,libre), a:a, prox:prox};
}

// Los clientes de quien mira: toda la cartera, o solo la suya si ve su cartera.
function _bv2Base(){
  var base=(typeof activeClients==='function')?activeClients():[];
  try{ if(typeof soloCartera==='function' && soloCartera() && typeof esDeMiCartera==='function') base=base.filter(esDeMiCartera); }catch(e){}
  return base;
}
// Los avisos y seguimientos abiertos del CSM (js/avisos.js), del que vence primero.
var _BV2_CSM_SRC={'Aviso al cliente':1, 'Tarea del cliente':1, 'Seguimiento al cliente':1};
function _bv2Avisos(){
  var me=String((SB&&SB.email)||'').toLowerCase(), out=[];
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    (c.tasks||[]).forEach(function(t){
      if(!t || t.done || t.deleted || t.archivada || !_BV2_CSM_SRC[t.source]) return;
      if(String(t.responsible||'').toLowerCase()!==me) return;
      out.push({c:c, t:t, due:t.due||'9999-12-31'});
    });
  });
  return out.sort(function(a,b){ return a.due<b.due?-1:(a.due>b.due?1:0); });
}
function _bv2Vence(due){
  if(!due || due==='9999-12-31') return 'sin fecha';
  var h=rvISO(new Date()); if(due<h) return 'vencido'; if(due===h) return 'vence hoy';
  var d=Math.round((new Date(due+'T12:00:00')-new Date(h+'T12:00:00'))/864e5);
  return 'vence en '+d+' d';
}

/* Que tan urgente es una alarma. Urgente = se esta yendo plata sin resultado:
   gasto con cero agendas, opt-in por el piso, o registros/agendas en cero. La
   frecuencia y el CPM son ajuste fino: pueden esperar. */
var _BV2_URG={optInLinea:1, registros:1, agendas:1, costoRegistro:1, costoAgenda:1, sqls:1};
function _bv2Urgencia(c, al){
  var R=[]; try{ R=effectiveAlarmRules(c)||[]; }catch(e){}
  var urg=[], fino=[], plata=0;
  (al.detalle||[]).forEach(function(d){
    var r=R.filter(function(x){ return x.id===d.rid; })[0]||{};
    var esPlata=(r.metric==='adSpent' && r.metric2 && /agendas|registros|sqls/.test(r.metric2));
    if(esPlata){ plata=Math.max(plata, +d.n||0);
      urg.unshift('gastó '+d.valor+' en 7 días y '+(r.metric2==='agendas'?'ninguna agenda':(r.metric2==='registros'?'ningún registro':'ninguna llamada calificada'))); }
    else if(_BV2_URG[r.metric]) urg.push(d.label+': '+d.valor+(d.limite?(' (límite '+d.limite+')'):''));
    else fino.push(d.label+' '+d.valor);
  });
  var t=urg.length?urg.join(' · ')+(fino.length?(' · también '+fino.join(', ')):''):fino.join(' · ');
  return {urg:urg.length>0, plata:plata, texto:t||'alarma'};
}

/* La cartera en cuatro: lo que se mira primero va arriba. Se apoya en lo que
   ya decide la app: _yaLanzo (hay campaña nuestra al aire), _lanzaCuenta (la
   fecha de lanzar), alarmStatus y la tarea sin tildar de la etapa actual. */
function _bv2Grupos(){
  var G={fren:[], alar:[], prog:[], bien:[]};
  var base=_bv2Base();
  var hace30=Date.now()-30*86400000;
  base.forEach(function(c){
    var L=null, q=null, ea=null, al=null;
    try{ L=_yaLanzo(c); }catch(e){}
    try{ q=_lanzaCuenta(c); }catch(e){}
    try{ ea=petEtapaActual(c); }catch(e){}
    var pend=((ea&&ea.tareas)||[]).filter(function(t){ return t && !t.ok && t.t; });
    var tarea=pend.filter(function(t){ return t.b; })[0]||pend[0]||null;
    var etapa=(ea&&ea.etapa)||'';
    var t0=new Date(c.altaAt||c.createdAt||0).getTime(), nuevo=!!(t0 && t0>=hace30);
    var it={c:c, n:c.name, nuevo:nuevo, aaa:(c.categoria==='AAA+')};
    /* Sin nada prendido pero con gasto reciente en el pulso de Meta: lanzo y la
       campana esta pausada. No es «frenado para lanzar» (paso con Logical Minds,
       pausada desde el 16/10, que salia frenada hace 75 dias). */
    /* Y si el pulso no pudo leer Meta, el reporte de campañas manda: un cliente
       que ya tiene reporte lanzo (Logical Minds, 19/10: el pulso dio error y
       volvia a «frenado hace 75 dias»). */
    var pu=c.metaPulso||null, gasto=pu?((+pu.gasto||0)+(+((pu.anterior||{}).gasto)||0)):0;
    var yaTuvo=!!(c.reporteCampana && c.reporteCampana.url);
    if(!L && ((gasto>0 && pu && !(+pu.activos)) || yaTuvo)){
      it.q='campaña pausada · sin anuncios al aire'+((pu && pu.error)?' · el pulso de Meta no pudo leer la cuenta':(pu&&pu.at?(' · pulso del '+new Date(pu.at).getDate()+'/'+(new Date(pu.at).getMonth()+1)):''));
      it.acc='Ver campaña'; it.orden=-99; it.urg=true; it.pausada=true; it.plata=0; G.alar.push(it);
      return;
    }
    if(!L){
      if(q && q.faltan<0){
        it.q=[etapa, 'la fecha de lanzar pasó hace '+(-q.faltan)+' d', tarea?('falta: '+tarea.t):''].filter(Boolean).join(' · ');
        it.acc=tarea?tarea.t:'Abrir'; it.orden=q.faltan; G.fren.push(it);
      } else {
        it.q=[q?(q.faltan===0?'lanza hoy':'lanza en '+q.faltan+' d · '+q.fin.getDate()+'/'+(q.fin.getMonth()+1)):'sin fecha de lanzamiento', etapa, tarea?('falta: '+tarea.t):'todo listo en la etapa'].filter(Boolean).join(' · ');
        it.acc=tarea?tarea.t:null; it.orden=q?q.faltan:999; G.prog.push(it);
      }
      return;
    }
    try{ al=alarmStatus(c); }catch(e){}
    var dia=(L.dias!=null)?('día '+L.dias):'al aire';
    /* Subir presupuesto (Angie, 19/10/2026): si hay un «escalar-» sin decidir,
       eso es lo que importa del cliente, no el CPM. El embudo rinde y falta
       volumen: va arriba, con su propio boton. */
    var dec=c.cambiosDecisiones||{};
    var esc=((c.cambiosPropuestos||{}).items||[]).filter(function(x){
      return x && /^escalar-/.test(String(x.id||'')) && !(dec[x.id] && dec[x.id].estado && dec[x.id].estado!=='pendiente'); })[0];
    if(esc){
      var tx=String(esc.texto||'').replace(new RegExp('^'+String(c.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':\\s*'),'');
      it.q=dia+' · '+tx; it.acc='Subir presupuesto'; it.urg=true; it.escalar=true; it.plata=0; it.orden=-50;
      G.alar.push(it);
      return;
    }
    if(al && al.breached>0){
      var u=_bv2Urgencia(c, al);
      it.urg=u.urg; it.plata=u.plata;
      it.q=dia+' · '+u.texto;
      it.acc='Ver alarmas'; it.orden=-u.plata; G.alar.push(it);
    } else {
      it.q=dia+' · sin alarmas'; it.orden=-(L.dias||0); G.bien.push(it);
    }
  });
  // Los AAA+ primero en cada tarjeta (Angie, 19/10/2026): con ellos no alcanza
  // con que funcione, tienen que estar cerca del resultado.
  Object.keys(G).forEach(function(k){ G[k].sort(function(a,b){ return ((b.aaa?1:0)-(a.aaa?1:0)) || (a.orden-b.orden); }); });
  /* Las alarmas en dos (Angie, 19/10/2026): arriba las urgentes y de los
     clientes que mas importan (AAA+), abajo las que pueden esperar. Dentro de
     las urgentes: AAA+ con plata en juego, despues el resto por plata, y al
     final los AAA+ que solo tienen ajuste fino. */
  G.alar.forEach(function(x){ x.tier=(x.urg||x.aaa)?1:2; });
  G.alar.sort(function(a,b){
    var ka=(a.aaa&&a.urg)?0:(a.urg?1:(a.aaa?2:3)), kb=(b.aaa&&b.urg)?0:(b.urg?1:(b.aaa?2:3));
    return (ka-kb) || ((b.plata||0)-(a.plata||0));
  });
  return G;
}

/* Los 3 no negociables: lo más frenado, la peor alarma y la reunión con un
   cliente que más pesa hoy. Lo que cambies o tildes queda en este navegador,
   por persona y por día. */
function _bv2NNKey(){ return 'evold-bv2-nn-'+String((SB&&SB.email)||'x')+'-'+rvISO(new Date()); }
function _bv2Sugeridos(G){
  var s=[], ya={};
  var poner=function(cid, t, por){ if(s.length>=3 || (cid && ya[cid])) return; if(cid) ya[cid]=1; s.push({t:t, por:por||'', cid:cid||null}); };
  if(typeof _soyCsm==='function' && _soyCsm()){
    // El CSM: lo que tiene que avisar o seguir con el cliente, lo que vence primero.
    _bv2Avisos().forEach(function(x){
      var tx=String(x.t.text||'').replace(/^(Avisarle al cliente|Seguir con el cliente|Seguimiento):\s*/,'').split(' \u2014 ')[0];
      // El texto ya suele empezar con el cliente («PlayWith: …»): no se repite.
      if(tx.toLowerCase().indexOf(String(x.c.name).toLowerCase()+':')===0) tx=tx.slice(String(x.c.name).length+1).trim();
      poner(x.c.id, x.c.name+': '+(tx.length>90?tx.slice(0,88)+'…':tx), _bv2Vence(x.due));
    });
  } else {
    /* El criterio acordado con Angie (19/10/2026): primero donde se va plata
       sin resultado (los AAA+ adelante), despues lo que esta parado o frenado
       para lanzar, y al final la reunion con un cliente. */
    G.alar.filter(function(x){ return x.urg; }).forEach(function(x){
      if(x.escalar) poner(x.c.id, 'Subir el presupuesto de '+x.n+': rinde y le falta volumen', x.q);
      else if(x.pausada) poner(x.c.id, 'Decidir si se reactiva la campaña de '+x.n, x.q);
      else poner(x.c.id, 'Frenar la plata que se va en '+x.n, x.q);
    });
    G.fren.forEach(function(x){ poner(x.c.id, 'Destrabar el lanzamiento de '+x.n, x.q); });
    var r=(_BV2.reun||[]).filter(function(x){ return x.cliId && _bv2Min(x.ini)+x.min>_bv2Min(new Date()); })[0];
    if(r) poner(r.cliId, 'Llegar preparada a '+r.w+((r.c && String(r.w).toLowerCase().indexOf(String(r.c).toLowerCase())<0)?(' con '+r.c):'')+' ('+_bv2Hora(r.ini)+')', 'tu próxima reunión con un cliente');
  }
  while(s.length<3) s.push({t:'Elegí qué no puede quedar sin hacer hoy', por:'', vacio:true});
  return s.slice(0,3).map(function(x){ return {t:x.t, por:x.por, cid:x.cid||null, ok:false, mio:false, vacio:!!x.vacio}; });
}
function _bv2NN(G){
  var n=null; try{ n=JSON.parse(localStorage.getItem(_bv2NNKey())||'null'); }catch(e){}
  if(!n || !Array.isArray(n.items)) n={items:_bv2Sugeridos(G)};
  return n;
}
function _bv2NNGuardar(n){ try{ localStorage.setItem(_bv2NNKey(), JSON.stringify(n)); }catch(e){} }

/* Lo que se puede medir de los últimos 7 días: tus llamadas grabadas
   (Fathom, por quién grabó) y los minutos activos en la app. */
function _bv2Tiempo(){
  var mail=String((SB&&SB.email)||'').toLowerCase(), desde=Date.now()-7*86400000;
  var cat={cli:0, ven:0, int:0};
  (DB.clients||[]).forEach(function(c){
    (c.fathomCalls||[]).forEach(function(l){
      if(String(l.grabo||'').toLowerCase()!==mail) return;
      var d=(typeof _calFechaFathom==='function')?_calFechaFathom(l.date):null;
      if(!d || d.getTime()<desde) return;
      var m=(typeof _durMin==='function')?_durMin(l.duration):0; if(!m) return;
      if(typeof esAgencia==='function' && esAgencia(c)) cat.int+=m;
      else if(esProspecto(c) || (typeof _calLadoDeTexto==='function' && _calLadoDeTexto(l.title)==='ventas')) cat.ven+=m;
      else cat.cli+=m;
    });
  });
  var act=0;
  for(var i=0;i<7;i++){
    var d=new Date(Date.now()-i*86400000);
    try{ act+=(parseInt(localStorage.getItem('evold-foco-'+(SB.email||'x')+'-'+rvISO(d))||'0',10)||0)/60; }catch(e){}
  }
  return [
    {l:'Llamadas con clientes', m:cat.cli, c:'#C8FF47'},
    {l:'Llamadas de venta', m:cat.ven, c:'rgba(242,240,235,.62)'},
    {l:'Reuniones internas', m:cat.int, c:'rgba(242,240,235,.38)'},
    {l:'Activa en la app', m:Math.round(act), c:'rgba(242,240,235,.18)'}
  ];
}
function _bv2Pendiente(){
  var out=[];
  try{ var n=dashCambiosPendientes().length; if(n) out.push({t:'agente', l:'Para decidir', w:n+' cambio'+(n===1?'':'s')+' propuesto'+(n===1?'':'s'), s:'De las llamadas, la rutina de campañas y las etapas. Crear ticket o descartar.', b:'Decidir', go:"irTorre('dashboard')"}); }catch(e){}
  var d=null; try{ d=_bvDatos(); }catch(e){}
  if(d && d.vencen) out.push({t:'delegar', l:'Vence hoy', w:d.vencen+' ticket'+(d.vencen===1?'':'s')+' tuyo'+(d.vencen===1?'':'s'), s:'Vencen hoy o ya vencieron.', b:'Ver tickets', go:'showTickets()'});
  if(d && d.coment) out.push({t:'auto', l:'Sin leer', w:d.coment+' comentario'+(d.coment===1?'':'s'), s:'En tickets de la cartera.', b:'Ver tickets', go:'showTickets()'});
  if(d && d.alarmas) out.push({t:'delegar', l:'Alarmas', w:d.alarmas+' alarma'+(d.alarmas===1?'':'s')+' saltada'+(d.alarmas===1?'':'s'), s:'Reglas de Meta que se pasaron del límite.', b:'Ver Panel 360', go:"irTorre('panel360')"});
  return out;
}

var _BV2_CSS=''
  +'#bv2{position:fixed;inset:0;z-index:9997;overflow-y:auto;background:#080A0F;color:#F2F0EB;font-family:Geist,Inter,system-ui,sans-serif;opacity:0;transition:opacity .35s ease;'
  +'--t2:rgba(242,240,235,.72);--t3:rgba(242,240,235,.6);--ln:rgba(242,240,235,.07);--sf:rgba(10,12,17,.45);--ok:#C8FF47;--red:#E0452E;--amb:#FFB547;--prog:#8DB4FF}'
  +'#bv2 *{box-sizing:border-box} #bv2 button{font-family:inherit;color:inherit;background:none;border:0;cursor:pointer;font-size:inherit}'
  +'#bv2 button:focus-visible{outline:2px solid var(--ok);outline-offset:4px;border-radius:6px}'
  +'#bv2 .num{font-variant-numeric:tabular-nums}'
  +'#bv2 .fx{position:fixed;inset:0;pointer-events:none;overflow:hidden}'
  +'#bv2 .faro{position:absolute;left:50%;top:-30px;width:2600px;height:2600px;margin-left:-1300px;transform-origin:50% 0;background:conic-gradient(from 180deg at 50% 0%,rgba(240,255,215,.22) 0deg,rgba(225,255,170,.08) 7deg,transparent 18deg,transparent 342deg,rgba(225,255,170,.08) 353deg,rgba(240,255,215,.22) 360deg);mix-blend-mode:screen;animation:bv2barre 16s ease-in-out infinite alternate;-webkit-mask-image:linear-gradient(#000 0,#000 45%,transparent 80%);mask-image:linear-gradient(#000 0,#000 45%,transparent 80%)}'
  +'#bv2 .lampara{position:absolute;left:50%;top:-34px;width:68px;height:68px;margin-left:-34px;border-radius:50%;background:radial-gradient(circle,rgba(252,255,240,.95) 0,rgba(240,255,205,.55) 18%,rgba(230,255,180,.12) 42%,transparent 62%);mix-blend-mode:screen}'
  +'@keyframes bv2barre{from{transform:rotate(-48deg)}to{transform:rotate(48deg)}}'
  +'@media (prefers-reduced-motion:reduce){#bv2 .faro{animation:none}}'
  +'#bv2 .in{position:relative;z-index:2;width:100%;max-width:min(1560px,94vw);margin:0 auto;padding:28px max(16px,env(safe-area-inset-left,0px)) 48px;display:flex;flex-direction:column;gap:28px}'
  +'#bv2 .sal{position:relative;min-height:calc(100vh - 56px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding-top:40px}'
  +'#bv2 .esq{position:absolute;top:0;right:0;display:flex;gap:14px;align-items:center}'
  +'#bv2 .sello{font-family:Geist,Inter,system-ui,sans-serif;font-size:14px;font-weight:400;letter-spacing:.01em;color:var(--t2);display:flex;align-items:center;gap:9px;font-variant-numeric:tabular-nums}'
  +'#bv2 .sello i{box-shadow:0 0 0 4px rgba(200,255,71,.14)}'
  +'body:has(#bv2) #modal-root .modal-overlay{z-index:10001}'
  +'#bv2 .prp{display:flex;flex-direction:column;gap:10px;margin:2px 0 10px;padding:12px 14px;border-radius:12px;background:rgba(242,240,235,.04);border:1px solid var(--ln)}'
  +'#bv2 .prp .t{font-size:13.5px;line-height:1.45;color:var(--t2)} #bv2 .prp .p{font-size:12px;color:var(--t3);margin-top:2px}'
  +'#bv2 .prp .o{font-family:Geist,Inter,system-ui,sans-serif;font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--t3);text-transform:uppercase}'
  +'#bv2 .prp .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}'
  +'#bv2 .bAcc{min-height:30px;padding:0 12px;border-radius:99px;border:1px solid rgba(242,240,235,.18)!important;font-size:12.5px;color:var(--t2)} #bv2 .bAcc:hover{border-color:rgba(242,240,235,.4)!important;color:#F2F0EB}'
  +'#bv2 .bAcc.ok{background:var(--ok)!important;border-color:var(--ok)!important;color:#080A0F;font-weight:600}'
  +'#bv2 .fpop .acc{white-space:nowrap;flex:none} #bv2 .fpop .acc.vacio{border-color:rgba(242,240,235,.2)!important;color:var(--t3)!important;background:transparent}'
  +'#bv2 .nm .prn{display:inline-block;margin-left:8px;font-weight:400;font-size:12px;color:var(--amb)}'
  +'#bv2 .pieBv{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:8px;padding-top:20px;border-top:1px solid var(--ln)}'
  +'#bv2 .sello i{width:6px;height:6px;border-radius:50%;background:var(--ok)}'
  +'#bv2 .btnE{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 18px;border-radius:99px;background:var(--ok);color:#080A0F;font-family:Geist,Inter,system-ui,sans-serif;font-weight:600;font-size:14.5px;letter-spacing:-.005em}'
  +'#bv2 .reloj{font-size:clamp(84px,15vw,176px);font-weight:500;letter-spacing:-.045em;line-height:1;text-shadow:0 2px 40px rgba(0,0,0,.5)}'
  +'#bv2 .hola{font-size:clamp(28px,4.6vw,52px);font-weight:500;letter-spacing:-.03em;line-height:1.15;text-shadow:0 2px 24px rgba(0,0,0,.5)}'
  +'#bv2 .nnB{margin-top:48px;width:min(640px,100%);display:flex;flex-direction:column;align-items:center;gap:12px}'
  +'#bv2 .nnB h2{margin:0;font-size:12px;letter-spacing:.18em;color:var(--t2);font-weight:500}'
  +'#bv2 .nnL{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;max-width:100%}'
  +'#bv2 .nn{display:grid;grid-template-columns:20px minmax(0,auto) 30px;gap:14px;align-items:center;padding:6px 0;text-align:left}'
  +'#bv2 .nn .ck{width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(242,240,235,.6);display:flex;align-items:center;justify-content:center;color:#080A0F;padding:0}'
  +'#bv2 .nn.hecha .ck{background:var(--ok);border-color:var(--ok)}'
  +'#bv2 .nn .tx{font-size:clamp(17px,2.2vw,22px);font-weight:400;letter-spacing:-.015em;text-shadow:0 2px 12px rgba(0,0,0,.5);min-width:0;overflow-wrap:anywhere}'
  +'#bv2 .nn .tx.vacio{color:var(--t3)}'
  +'#bv2 .nn.hecha .tx{text-decoration:line-through;text-decoration-thickness:2px;color:var(--t2)}'
  +'#bv2 .nn .ed{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--t3);opacity:0;transition:opacity .15s}'
  +'#bv2 .nn:hover .ed,#bv2 .nn .ed:focus-visible{opacity:1} @media (hover:none){#bv2 .nn .ed{opacity:.7}}'
  +'#bv2 .nn input{width:100%;background:none;border:0;border-bottom:2px solid var(--ok);color:#F2F0EB;font:inherit;font-size:18px;padding:4px 0;outline:none}'
  +'#bv2 .pie{display:flex;gap:16px;align-items:center;font-size:12.5px;color:var(--t3)}'
  +'#bv2 .pie button{color:var(--t3);text-decoration:underline;text-underline-offset:3px}'
  +'#bv2 .pts{display:flex;gap:6px} #bv2 .pts i{width:6px;height:6px;border-radius:50%;background:rgba(242,240,235,.25)} #bv2 .pts i.on{background:var(--ok)}'
  +'#bv2 .bravo{color:var(--ok)}'
  +'#bv2 .bajar{margin-top:44px;font-size:12.5px;color:var(--t3)}'
  +'#bv2 .card{background:var(--sf);border:1px solid var(--ln);border-radius:20px;padding:22px 24px;min-width:0;backdrop-filter:blur(1.5px);-webkit-backdrop-filter:blur(1.5px)}'
  +'#bv2 .hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px} @media (max-width:780px){#bv2 .hero{grid-template-columns:minmax(0,1fr)}}'
  +'#bv2 .lbl{font-size:12.5px;color:var(--t3)}'
  +'#bv2 .libre{font-size:60px;font-weight:200;letter-spacing:-.05em;line-height:1;color:var(--ok);margin:6px 0 8px}'
  +'#bv2 .subl{font-size:13px;color:var(--t2)}'
  +'#bv2 .barra{position:relative;height:28px;border-radius:8px;background:rgba(242,240,235,.05);margin-top:18px;overflow:hidden}'
  +'#bv2 .barra i{position:absolute;top:4px;bottom:4px;border-radius:5px;background:rgba(242,240,235,.3)} #bv2 .barra i.ya{background:rgba(242,240,235,.1)}'
  +'#bv2 .barra em{position:absolute;top:0;bottom:0;width:2px;background:var(--ok)}'
  +'#bv2 .barra-l{display:flex;justify-content:space-between;margin-top:6px;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--t3)}'
  +'#bv2 .prox{display:flex;flex-direction:column;gap:6px;height:100%}'
  +'#bv2 .prox .h{display:flex;align-items:baseline;gap:12px} #bv2 .prox .h b{font-size:44px;font-weight:200;letter-spacing:-.05em;line-height:1}'
  +'#bv2 .prox .h span{font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;color:var(--ok);border:1px solid rgba(200,255,71,.35);border-radius:99px;padding:2px 9px}'
  +'#bv2 .prox .w{font-size:17px;font-weight:500;letter-spacing:-.01em} #bv2 .prox .cl{font-size:13px;color:var(--t3)}'
  +'#bv2 .prox .sig{margin-top:auto;padding-top:14px;border-top:1px solid var(--ln);font-size:12.5px;color:var(--t3)}'
  +'#bv2 .linea{font-size:13.5px;color:var(--t2);display:flex;gap:18px;flex-wrap:wrap} #bv2 .linea b{color:#F2F0EB;font-weight:500}'
  +'#bv2 .q4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px} @media (max-width:700px){#bv2 .q4{grid-template-columns:minmax(0,1fr)}}'
  +'#bv2 .g{padding-bottom:12px} #bv2 .fren{--c:var(--red)} #bv2 .alar{--c:var(--amb)} #bv2 .prog{--c:var(--prog)} #bv2 .bien{--c:var(--ok)}'
  +'#bv2 .gh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}'
  +'#bv2 .gh .x{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--t2)} #bv2 .gh .x i{width:8px;height:8px;border-radius:50%;background:var(--c)}'
  +'#bv2 .gh .k{font-size:40px;font-weight:300;line-height:.9;letter-spacing:-.05em;color:var(--c)}'
  +'#bv2 .it{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:12px 0;border-top:1px solid var(--ln)}'
  +'#bv2 .it .nm{display:grid;gap:2px;min-width:0;text-align:left;padding:0}'
  +'#bv2 .it .nm b{font-weight:500;font-size:14px;letter-spacing:-.01em} #bv2 .it .nm:hover b{text-decoration:underline;text-underline-offset:3px}'
  +'#bv2 .it .nm span{color:var(--t3);font-size:12.5px;line-height:1.45}'
  +'#bv2 .sub{font-size:11px;letter-spacing:.06em;color:var(--t3);padding:12px 0 4px;border-top:1px solid var(--ln)} #bv2 .sub:first-child{border-top:0;padding-top:0} #bv2 .sub.urg{color:var(--amb)}'
  +'#bv2 .it .aaa{font-size:10px;font-weight:600;color:#080A0F;background:var(--ok);border-radius:4px;padding:0 5px;margin-left:7px;vertical-align:1px}'
  +'#bv2 .it .nv{font-size:10.5px;color:var(--ok);margin-left:6px;font-weight:400}'
  +'#bv2 .acc{font-size:12.5px;font-weight:500;padding:7px 12px;min-height:34px;border-radius:99px;border:1px solid var(--c);white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis}'
  +'#bv2 .acc:hover{background:rgba(242,240,235,.06)}'
  +'#bv2 .lst{max-height:404px;overflow-y:auto;overscroll-behavior:contain;margin-right:-10px;padding-right:10px;scrollbar-width:thin;scrollbar-color:rgba(242,240,235,.2) transparent}'
  +'#bv2 .lst::-webkit-scrollbar{width:6px} #bv2 .lst::-webkit-scrollbar-thumb{background:rgba(242,240,235,.2);border-radius:3px}'
  +'#bv2 .lst:focus-visible{outline:2px solid var(--ok);outline-offset:4px;border-radius:8px}'
  +'#bv2 .vac{padding:12px 0;border-top:1px solid var(--ln);font-size:12.5px;color:var(--t3)}'
  +'#bv2 .tiempo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:12px} @media (max-width:820px){#bv2 .tiempo{grid-template-columns:minmax(0,1fr)}}'
  +'#bv2 .tt{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:16px;font-size:13px;color:var(--t3)}'
  +'#bv2 .tt small{font-family:Geist,Inter,system-ui,sans-serif;font-size:12.5px;font-weight:400;letter-spacing:.01em;color:var(--t2);font-variant-numeric:tabular-nums}'
  +'#bv2 .apil{display:flex;height:6px;border-radius:3px;overflow:hidden;gap:3px;background:rgba(242,240,235,.05)} #bv2 .apil i{display:block;height:100%;border-radius:3px}'
  +'#bv2 .usos{display:grid;margin-top:12px} #bv2 .usos div{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px;color:var(--t2);padding:7px 0;border-top:1px solid var(--ln)}'
  +'#bv2 .usos div:first-child{border-top:0} #bv2 .usos i{width:6px;height:6px;border-radius:50%} #bv2 .usos b{font-family:"Geist Mono",ui-monospace,monospace;font-weight:400;font-size:12px;color:#F2F0EB}'
  +'#bv2 .usos p{margin:8px 0 0;font-size:11.5px;color:var(--t3)}'
  +'#bv2 .reco{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:11px 0;border-top:1px solid var(--ln);align-items:center}'
  +'#bv2 .reco:first-child{border-top:0;padding-top:0} #bv2 .reco .tipo{grid-column:1/-1;font-size:11px;color:var(--c)}'
  +'#bv2 .reco .w{font-size:14px;font-weight:500;letter-spacing:-.01em} #bv2 .reco .w span{display:block;font-weight:400;color:var(--t3);font-size:12.5px;margin-top:1px}'
  +'#bv2 .reco button{font-size:12px;font-weight:500;padding:6px 11px;border-radius:99px;border:1px solid rgba(242,240,235,.18);white-space:nowrap} #bv2 .reco button:hover{border-color:var(--ok)}'
  +'#bv2 .agente{--c:var(--ok)} #bv2 .delegar{--c:var(--prog)} #bv2 .auto{--c:rgba(242,240,235,.6)}';

/* «Cómo van los clientes» (Angie, 20/10/2026): la lectura de resultados que arma el
   reporte de campañas cada mañana (maquina.carteraEstado, migración 044). Es un
   juicio sobre registros, costo, calificados y agendas; NO es lo mismo que
   «sin alarmas», que solo dice que ninguna regla saltó. */
function _bv2PropFila(x){
  var tipoDe=function(y){ return y.tipo||(y.origen==='revision'?'revision':'rutina'); };
  var iid=esc(String(x.it.id)), rid=esc(String((x.r&&x.r.id)||'')), cid=x.c.id;
  var crear=x.origen==='rutina'?"dashTicketModal('rutina',"+cid+",'','"+iid+"')":(x.origen==='etapa'?"dashTicketModal('etapa',"+cid+",'','"+iid+"')":"dashTicketModal('revision',"+cid+",'"+rid+"','"+iid+"')");
  var desc=x.origen==='rutina'?"dashRutinaDecidir("+cid+",'"+iid+"','descartado')":(x.origen==='etapa'?"dashEtapaDecidir("+cid+",'"+iid+"','descartado')":"dashDescartar("+cid+",'"+rid+"','"+iid+"')");
  var cuando=x.ts?new Date(x.ts).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}):'';
  return '<div class="row prop" style="align-items:flex-start;padding:10px 0">'
    +'<div style="flex:1;min-width:0"><div class="ks mono">'+({llamada:'llamada',rutina:'rutina',etapa:'etapa',revision:'revisión'}[tipoDe(x)]||'')+(cuando?' · '+cuando:'')+'</div>'
    +'<div style="color:var(--text2);font-size:13px;line-height:1.5;margin-top:2px">'+esc(x.it.texto)+'</div>'
    +(x.it.porque?'<div class="ks" style="margin-top:2px">'+esc(x.it.porque)+'</div>':'')+'</div>'
    +'<div class="prop-acc" style="display:flex;gap:8px;flex:none;flex-wrap:wrap;justify-content:flex-end">'
      +'<a class="cta" onclick="'+crear+'">Crear ticket</a>'
      +'<span class="pill" onclick="propEditarModal(\''+x.origen+'\','+cid+',\''+rid+'\',\''+iid+'\')" title="Mejorar la redacción antes de decidir">Editar</span>'
      +'<span class="pill" onclick="dashAgenteMandar(\''+x.origen+'\','+cid+',\''+rid+'\',\''+iid+'\');_bv2PopRefrescar('+cid+',0,1600)" title="El agente lo prepara y lo hacemos juntos cuando lo apruebes">Mandar al agente</span>'
      +'<span class="pill" onclick="'+desc+';_bv2PopRefrescar('+cid+',1,350)" title="No se hace; queda registrado como descartado">Descartar</span>'
    +'</div></div>';
}
/* Descartar y «Mandar al agente» guardan sin abrir ningún cuadro, así que el
   observador de modal-root no se entera y el popup quedaba igual: parecía que el
   botón no andaba (Angie, 22/10/2026; el descarte sí se había guardado). Se
   vuelve a dibujar el popup y la pantalla de atrás, con un aviso. */
function _bv2PopRefrescar(cid, aviso, ms){
  setTimeout(function(){
    // «Mandar al agente» ya avisa solo cuando termina; Descartar no avisa nada.
    if(aviso){ try{ if(typeof toast==='function') toast('Descartado: quedó registrado'); }catch(e){} }
    try{ if(document.getElementById('bv2')) _bv2Pintar(); }catch(e){}
    var P=[]; try{ var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(cid); }); if(c) P=_bv2PropDe(c); }catch(e){}
    if(P.length){ _bv2Popup(cid); } else { try{ closeModal(); }catch(e){} }
  }, ms||350);
}
// El popup de un cliente: sus cambios propuestos como en Tickets, con las mismas acciones.
function _bv2Popup(cid){
  var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(cid); }); if(!c) return;
  var P=_bv2PropDe(c);
  if(!P.length && _BV2.reabrir){ _BV2.reabrir=false; return; }
  _BV2.pop=c.id;
  var mr=document.getElementById('modal-root'); if(!mr) return;
  mr.innerHTML='<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal" id="bv2-pop" style="max-width:780px;width:min(780px,94vw);max-height:84vh;overflow:auto">'
    +(typeof DASH_CSS==='string'?DASH_CSS:'')
    +'<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px"><div class="modal-title" style="margin:0">'+esc(c.name)+' · '+(P.length?(P.length+' cambio'+(P.length===1?'':'s')+' propuesto'+(P.length===1?'':'s')+' sin decidir'):'sin cambios propuestos')+'</div>'
    +'<a class="cta" onclick="closeModal();selectClient('+c.id+')" style="flex:none">Ver ficha</a></div>'
    +'<div class="dsh">'+(P.length?P.map(_bv2PropFila).join(''):_bv2PorQueNo(c))+'</div>'
    +'<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeModal()">Cerrar</button></div></div></div>';
}
// El nombre de un cliente abre su reporte de campañas (el artifact que arma la rutina); sin reporte, sus sugerencias.
function _bv2Reporte(cid){
  var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(cid); }); if(!c) return;
  var url=c.reporteCampana&&c.reporteCampana.url;
  if(url){ try{ window.open(url,'_blank','noopener'); return; }catch(e){} }
  try{ if(typeof toast==='function') toast(c.name+' todavía no tiene reporte de campañas.','amber'); }catch(e){}
  _bv2Popup(c.id);
}
// Si no hay sugerencias, se dice por qué, con lo que la app sabe de este cliente.
function _bv2PorQueNo(c){
  var f=function(iso){ var d=iso?new Date(iso):null; return (d&&!isNaN(d))?(('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)):''; };
  var cp=c.cambiosPropuestos||null, dec=c.cambiosDecisiones||{}, motivos=[];
  if(!cp || !cp.at) motivos.push('La rutina de campañas todavía no le dejó ninguna propuesta a este cliente.');
  else motivos.push('La rutina de campañas lo revisó el '+f(cp.at)+' y no dejó propuestas abiertas.');
  var n={tarea:0,descartado:0}, ult=null;
  Object.keys(dec).forEach(function(k){ var x=dec[k]; if(!x||!x.estado) return; if(x.estado==='tarea') n.tarea++; else if(x.estado==='descartado') n.descartado++; var d=x.at?new Date(x.at):null; if(d&&!isNaN(d)&&(!ult||d>ult)) ult=d; });
  if(n.tarea||n.descartado) motivos.push('Ya decidiste sobre sus propuestas: '+n.tarea+' pasaron a ticket y '+n.descartado+' se descartaron'+(ult?' (la última, el '+f(ult.toISOString())+')':'')+'.');
  var ab=(c.tasks||[]).filter(function(t){ return t && !t.done && !t.deleted && !t.archivada; }).length;
  if(ab) motivos.push('Tiene '+ab+' ticket'+(ab===1?'':'s')+' abierto'+(ab===1?'':'s')+' en su ficha.');
  var rep=c.reporteCampana&&c.reporteCampana.url;
  return '<div style="padding:12px 0 4px"><div style="font-size:13.5px;color:var(--text);margin-bottom:8px">No hay sugerencias abiertas para '+esc(c.name)+'. Esto es lo que sabe la app:</div>'
    +'<ul style="margin:0 0 10px 18px;padding:0;color:var(--text2);font-size:13px;line-height:1.6">'+motivos.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join('')+'</ul>'
    +'<div class="ks">Que no tenga sugerencias no quiere decir que le vaya bien: eso lo dice el reporte de campañas.'+(rep?' <a class="cta" onclick="window.open(\''+esc(rep)+'\',\'_blank\',\'noopener\')">Abrir el reporte</a>':'')+'</div></div>';
}
function _bv2PropDe(c){
  var out=[]; try{ out=dashCambiosPendientes().filter(function(x){ return String(x.c.id)===String(c.id); }); }catch(e){}
  return out;
}
function _bv2CarteraHtml(){
  var e=null; (DB.clients||[]).forEach(function(c){ if(c && c.carteraEstado && Array.isArray(c.carteraEstado.bien)) e=c.carteraEstado; });
  if(!e) return '';
  var f=String(e.fecha||''), fd=f?(f.slice(8,10)+'/'+f.slice(5,7)):'';
  var viejo=(f && f!==rvISO(new Date()));
  var porNombre=function(n){ var q=String(n||'').toLowerCase().trim(); return (DB.clients||[]).filter(function(c){ return c && !c.archived && String(c.name||'').toLowerCase().trim()===q; })[0]||null; };
  // Cada cliente con propuestas sin decidir se abre al tocarlo y trae sus mismos botones.
  var fila=function(nombre, a, b){
    var c=porNombre(nombre), P=c?_bv2PropDe(c):[];
    var cuerpo='<b>'+esc(nombre||'')+(P.length?'<span class="prn">'+P.length+' propuesta'+(P.length===1?'':'s')+'</span>':'')+'</b><span>'+esc(a||'')+'</span>'+(b?'<span style="display:block;margin-top:2px;color:var(--t2)">'+esc(b)+'</span>':'');
    if(!c) return '<div class="it"><span class="nm" style="cursor:default">'+cuerpo+'</span><span></span></div>';
    return '<div class="it fpop"><button class="nm" data-bv2rep="'+c.id+'" title="Abrir el reporte de campañas de '+esc(nombre)+'">'+cuerpo+'</button>'
      +'<button class="acc'+(P.length?'':' vacio')+'" data-bv2sug="'+c.id+'" title="'+(P.length?('Ver los cambios propuestos de '+esc(nombre)):('Sin sugerencias abiertas: tocá para ver por qué'))+'">'+(P.length?'Ver sugerencias':'Sin sugerencias')+'</button></div>';
  };
  var tarj=function(cls,t,L,vacio,pinta){ return '<div class="card g '+cls+'"><div class="gh"><span class="x"><i></i>'+t+'</span><span class="k num">'+L.length+'</span></div>'
    +(L.length?'<div class="lst" tabindex="0" aria-label="'+t+'">'+L.map(pinta).join('')+'</div>':'<div class="vac">'+vacio+'</div>')+'</div>'; };
  var B=e.bien||[], M=e.mal||[];
  return '<div class="tt" style="margin:0 2px -8px;font-size:12px;letter-spacing:.14em;color:var(--t2)">CÓMO VAN LOS CLIENTES <small style="letter-spacing:0;text-transform:none">· '+(viejo?('lectura del '+fd+', no es de hoy'):'lectura de hoy, del reporte de campañas')+'</small></div>'
    +'<div class="q4">'+tarj('bien','Van bien',B,'Hoy ningún cliente cumple lo que pide el reporte.',function(x){ return fila(x.cliente, x.numeros, x.lectura); })
    +tarj('fren','No van bien',M,'Ninguno con problemas de resultados hoy.',function(x){ return fila(x.cliente, x.motivo, ''); })+'</div>';
}
/* «Qué quedó trabado» (Angie, 22/10/2026): lo que dejan las rutinas que miran el
   resultado con los leads y los clientes (maquina.vigilancia, migración 048).
   «leads» = Leads sin mensaje 1 y conversaciones del día (8:35 y 18:35);
   «whatsapp» = Parte de WhatsApp de los grupos de clientes y del equipo (18:45).
   Nació porque el 21/10 una rutina vio dos plantillas aprobadas, lo dejó en un
   archivo y nadie las conectó: lo que vigilan tiene que estar donde se mira. */
var _BV2_VIG_TIPO={sin_mensaje:'sin mensaje 1',fallo:'falló el envío',tarde:'mensaje tarde',espera:'espera respuesta',
  no_agendo:'contestó y no agendó',sin_seguimiento:'sin seguimiento',prometido:'prometimos',riesgo:'riesgo',otro:''};
var _BV2_VIG_URG={sin_mensaje:1,fallo:1,espera:1,prometido:1,riesgo:1};
function _bv2Vig(){
  var v=null; (DB.clients||[]).forEach(function(c){ if(c && c.vigilancia && typeof c.vigilancia==='object') v=c.vigilancia; });
  return v||{};
}
function _bv2VigHtml(noche){
  var V=_bv2Vig(), hoy=rvISO(new Date());
  var ayer=(function(){ var d=new Date(); d.setDate(d.getDate()-1); return rvISO(d); })();
  // A la mañana sirve el parte de WhatsApp de anoche; a la noche, solo lo de hoy.
  var vale=function(p){ return p && (p.fecha===hoy || (!noche && p.fecha===ayer && p.momento==='noche')); };
  var L=vale(V.leads)?V.leads:null, W=vale(V.whatsapp)?V.whatsapp:null;
  var porNombre=function(n){ var q=String(n||'').toLowerCase().trim(); return q?((DB.clients||[]).filter(function(c){ return c && !c.archived && String(c.name||'').toLowerCase().trim()===q; })[0]||null):null; };
  var items=[].concat(L?(L.items||[]):[], W?(W.items||[]):[]);
  var urg=items.filter(function(x){ return _BV2_VIG_URG[x.tipo]; }), resto=items.filter(function(x){ return !_BV2_VIG_URG[x.tipo]; });
  var fila=function(x){
    var c=porNombre(x.cliente), t=_BV2_VIG_TIPO[x.tipo]||'';
    return '<div class="it"><span class="nm" style="cursor:default"><b>'+esc(x.cliente||'General')+(t?'<span class="prn">'+esc(t)+'</span>':'')+'</b><span>'+esc(x.texto||'')+'</span></span>'
      +(c?'<button class="acc" data-bv2cli="'+c.id+'" title="Abrir la ficha de '+esc(c.name)+'">Abrir</button>':'<span></span>')+'</div>';
  };
  var cuando=function(p,nom){ if(!p) return ''; var d=p.at?new Date(p.at):null; return nom+' '+((d&&!isNaN(d))?_bv2Hora(d):'')+(p.fecha!==hoy?' de ayer':''); };
  var fuentes=[cuando(L,'leads'),cuando(W,'WhatsApp')].filter(Boolean).join(' · ');
  var falta=[]; if(!L) falta.push(noche?'la de leads corre a las 18:35':'la de leads corre a las 8:35'); if(!W) falta.push(noche?'el parte de WhatsApp corre a las 18:45':'el parte de WhatsApp de anoche no está');
  var lista=function(a,vacio){ return a.length?'<div class="lst" tabindex="0">'+a.slice(0,14).map(fila).join('')+(a.length>14?'<div class="vac" style="border:0;padding:6px 0">y '+(a.length-14)+' más</div>':'')+'</div>':'<div class="vac">'+vacio+'</div>'; };
  var resumen=[L&&L.resumen, W&&W.resumen].filter(Boolean).map(function(r){ return '<div class="subl" style="margin-bottom:8px">'+esc(r)+'</div>'; }).join('');
  var tarj=function(cls,t,n,cuerpo){ return '<div class="card g '+cls+'"><div class="gh"><span class="x"><i></i>'+t+'</span><span class="k num">'+n+'</span></div>'+cuerpo+'</div>'; };
  var rec=(W&&W.recurrentes)||[];
  var recHtml=rec.length?tarj('prog','Lo que se repite entre clientes',rec.length,'<div class="lst" tabindex="0">'+rec.map(function(r){
      return '<div class="it"><span class="nm" style="cursor:default"><b>'+esc(r.problema||'')+(r.veces?'<span class="prn">'+esc(String(r.veces))+' veces</span>':'')+'</b><span>'+esc(r.clientes||'')+'</span></span><span></span></div>';
    }).join('')+'</div>'):'';
  return '<div class="tt" style="margin:0 2px -8px;font-size:12px;letter-spacing:.14em;color:var(--t2)">QUÉ QUEDÓ TRABADO <small style="letter-spacing:0;text-transform:none">· '
      +(fuentes?('rutinas: '+esc(fuentes)):'las rutinas todavía no corrieron')+(falta.length?(' · '+esc(falta.join('; '))):'')+'</small></div>'
    +'<div class="q4">'+tarj('fren','Para resolver ya',urg.length,resumen+lista(urg,'Nada urgente: todos los leads tienen su mensaje 1 y nadie espera respuesta.'))
    +tarj('alar','Para seguir',resto.length,lista(resto,'Nada pendiente de seguimiento.'))+'</div>'
    +(recHtml?'<div class="q4" style="grid-template-columns:1fr">'+recHtml+'</div>':'');
}
/* «Mensajes para mandar hoy» (Angie, 22/10/2026): las rutinas de vigilancia,
   además de ver lo trabado, redactan el mensaje para cada cliente que lo
   necesita (maquina.mensajesDia, migración 049). La app no manda nada: muestra
   dónde va, por qué, el texto y un botón para copiarlo. A la mañana, los de
   hoy; a la noche, los que quedaron armados para mañana.
   «Enviar» (Angie, 27/10/2026) abre WhatsApp con el texto ya escrito y el
   selector de chats: un link no puede abrir un grupo, así que el grupo lo
   elige ella (la tarjeta dice cuál) y lo manda desde su número. */
/* Editar y «Listo» (Angie, 27/10/2026: «me tendría que dejar editarlos y si los
   envié manual poner listo»). Lo que cambia ella va en DB.mensajesEstado, que
   se sincroniza como clave global (tabla config): el texto editado y cuándo lo
   marcó mandado, por mensaje (día|fuente|cliente|n). El de la rutina no se
   toca: mensajesDia es de la base y se pisa en cada corrida. Se guardan 7 días. */
function _bv2MensEstado(){ if(!DB.mensajesEstado || typeof DB.mensajesEstado!=='object') DB.mensajesEstado={}; return DB.mensajesEstado; }
function _bv2MensGuardar(k, cambio){
  var E=_bv2MensEstado(), v=Object.assign({}, E[k]||{}, cambio);
  Object.keys(v).forEach(function(x){ if(v[x]===null||v[x]===undefined||v[x]==='') delete v[x]; });
  if(Object.keys(v).length) E[k]=v; else delete E[k];
  var lim=rvISO(new Date(Date.now()-7*864e5));
  Object.keys(E).forEach(function(x){ if(x.slice(0,10)<lim) delete E[x]; });
  try{ save(); }catch(e){}
}
function _bv2MensHtml(noche){
  var M=null; (DB.clients||[]).forEach(function(c){ if(c && c.mensajesDia && typeof c.mensajesDia==='object') M=c.mensajesDia; });
  M=M||{};
  var hoy=rvISO(new Date());
  var vale=function(p){ return p && (noche ? p.fecha>hoy : p.fecha===hoy); };
  var E=_bv2MensEstado(), cuenta={};
  var L=[];
  ['leads','whatsapp'].forEach(function(f){
    if(!vale(M[f])) return;
    (M[f].mensajes||[]).forEach(function(x){
      var cl=String(x.cliente||''), n=cuenta[f+cl]=(cuenta[f+cl]||0)+1;
      var k=M[f].fecha+'|'+f+'|'+cl+'|'+n, e=E[k]||{};
      L.push({x:x, k:k, texto:(e.t!=null?String(e.t):String(x.texto||'')), editado:e.t!=null, listo:e.listo||''});
    });
  });
  // Los mandados bajan al final; adentro de cada grupo, el orden de la rutina.
  /* El CSM ve los mensajes de SUS clientes, de todas las fuentes (Angie,
     27/10/2026: «todos los mensajes que tiene que mandar a los clientes que él
     tenga asignado», en vez del artifact aparte). Angie sigue viendo todos. */
  if(typeof _soyCsm==='function' && _soyCsm() && typeof esDeMiCartera==='function'){
    var _porNom=function(n){ var q=String(n||'').toLowerCase().trim(); return q?((DB.clients||[]).filter(function(c){ return c && !c.archived && String(c.name||'').toLowerCase().trim()===q; })[0]||null):null; };
    L=L.filter(function(m){ var c=_porNom(m.x.cliente); return !!(c && esDeMiCartera(c)); });
  }
  L=L.filter(function(m){ return !m.listo; }).concat(L.filter(function(m){ return m.listo; }));
  _BV2.mlist=L; _BV2.msgs=L.map(function(m){ return m.texto; });
  var pend=L.filter(function(m){ return !m.listo; }).length;
  var porNombre=function(n){ var q=String(n||'').toLowerCase().trim(); return q?((DB.clients||[]).filter(function(c){ return c && !c.archived && String(c.name||'').toLowerCase().trim()===q; })[0]||null):null; };
  var t=noche?'Mensajes armados para mañana':'Mensajes para mandar hoy';
  var cab='<div class="tt" style="margin:0 2px -8px;font-size:12px;letter-spacing:.14em;color:var(--t2)">'+(noche?'PARA MANDAR MAÑANA':'PARA MANDAR HOY')+' <small style="letter-spacing:0;text-transform:none">· los redactan las rutinas; revisalos antes de mandar</small></div>';
  if(!L.length) return noche?'':cab+'<div class="q4" style="grid-template-columns:1fr"><div class="card g prog"><div class="gh"><span class="x"><i></i>'+t+'</span><span class="k num">0</span></div><div class="vac">No quedó ningún mensaje armado para hoy.</div></div></div>';
  var caja='margin-top:8px;padding:10px 12px;border-radius:10px;background:rgba(242,240,235,.04);white-space:pre-wrap;font-size:13px;line-height:1.55;color:#F2F0EB';
  var filas=L.map(function(m,i){
    var x=m.x, c=porNombre(x.cliente), ed=(_BV2.medit===m.k);
    var dq=[x.donde, x.quien?('lo manda '+x.quien):''].filter(Boolean).join(' · ');
    var bots;
    if(ed) bots='<button class="acc" data-bv2mok="'+i+'" title="Guardar el texto">Guardar</button><button class="acc" data-bv2mno="1" title="Descartar los cambios">Cancelar</button>';
    else if(m.listo) bots='<span class="acc" style="border-color:var(--ok);color:var(--ok)">Mandado '+esc(_bv2Hora(new Date(m.listo)))+'</span><button class="acc" data-bv2mlisto="'+i+'" title="Volver a pendiente">Deshacer</button>';
    else bots='<a class="acc" href="'+esc(_bv2WaLink(m.texto))+'" target="_blank" rel="noopener" data-bv2wa="'+i+'" title="'+esc('Abrir WhatsApp con el mensaje escrito'+(x.donde?(' · elegí «'+x.donde+'»'):''))+'" style="text-decoration:none;color:inherit;display:inline-flex;align-items:center">Enviar</a>'
      +'<button class="acc" data-bv2copy="'+i+'" title="Copiar el mensaje">Copiar</button>'
      +'<button class="acc" data-bv2med="'+i+'" title="Editar el texto">Editar</button>'
      +'<button class="acc" data-bv2mlisto="'+i+'" title="Ya lo mandé">Listo</button>'
      +(c?'<button class="acc" data-bv2cli="'+c.id+'" title="Abrir la ficha de '+esc(c.name)+'">Ficha</button>':'');
    var cuerpo=ed
      ? '<textarea id="bv2MT" aria-label="Texto del mensaje a '+esc(x.cliente||'')+'" maxlength="3000" style="'+caja+';width:100%;min-height:160px;border:1px solid var(--c);font-family:inherit;resize:vertical">'+esc(m.texto)+'</textarea>'
      : '<div style="'+caja+'">'+esc(m.texto)+'</div>';
    return '<div class="it" style="display:block;padding:12px 0'+(m.listo&&!ed?';opacity:.5':'')+'">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><span class="nm" style="cursor:default"><b>'+esc(x.cliente||'')+(m.editado?' <small style="font-weight:400;color:var(--t2)">· editado</small>':'')+'</b>'
      +(dq?'<span>'+esc(dq)+'</span>':'')+(x.motivo?'<span style="display:block;margin-top:2px;color:var(--t2)">'+esc(x.motivo)+'</span>':'')+'</span>'
      +'<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+bots+'</span></div>'
      +cuerpo+'</div>';
  }).join('');
  return cab+'<div class="q4" style="grid-template-columns:1fr"><div class="card g prog"><div class="gh"><span class="x"><i></i>'+t+'</span><span class="k num" title="'+(L.length-pend)+' de '+L.length+' mandados">'+pend+'</span></div><div class="lst" tabindex="0" aria-label="'+t+'">'+filas+'</div></div></div>';
}
function _bv2WaLink(txt){
  var t=encodeURIComponent(String(txt||''));
  // En el celular el esquema de la app; wa.me desde otra pestaña manda al iPhone a la página de descarga.
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'') ? 'whatsapp://send?text='+t : 'https://wa.me/?text='+t;
}
function _bv2Copiar(i){
  var txt=(_BV2.msgs||[])[i]; if(!txt) return;
  var ok=function(){ try{ if(typeof toast==='function') toast('Mensaje copiado'); }catch(e){} };
  try{ navigator.clipboard.writeText(txt).then(ok,function(){ _bv2CopiarViejo(txt); ok(); }); }catch(e){ _bv2CopiarViejo(txt); ok(); }
}
function _bv2CopiarViejo(txt){
  try{ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }catch(e){}
}
function _bv2PieHtml(txt){
  return '<div class="pieBv"><span class="sello"><i></i>Actualizado '+_bv2Hora(_BV2.abierta)+'</span><button class="btnE" data-bv2entrar="1">'+txt+'</button></div>';
}
function _bv2Html(){
  var G=_bv2Grupos(), D=_bv2Dia(), R=_BV2.reun||[], NN=_bv2NN(G);
  var nom=String(personaNombre((SB&&SB.email)||'')||'');
  nom=(nom.indexOf('@')>=0)?'':nom.split(' ')[0];
  var tilde='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>';
  var lapiz='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
  var hechas=NN.items.filter(function(x){ return x.ok; }).length;
  var nn='<div class="nnB"><h2>NO NEGOCIABLES DE HOY</h2><ol class="nnL">'+NN.items.map(function(it,i){
      var cuerpo=_BV2.edit===i
        ? '<form data-bv2f="'+i+'"><input id="bv2I" maxlength="120" autocomplete="off" aria-label="No negociable '+(i+1)+'" value="'+esc(it.vacio?'':it.t)+'"></form>'
        : '<span class="tx'+(it.vacio?' vacio':'')+'" title="'+esc(it.mio?'Lo escribiste vos':(it.por?('Por qué: '+it.por):''))+'">'+esc(it.t)+'</span>';
      return '<li class="nn'+(it.ok?' hecha':'')+'"><button class="ck" data-bv2ck="'+i+'" aria-pressed="'+(it.ok?'true':'false')+'" aria-label="'+(it.ok?'Desmarcar':'Marcar como hecho')+'">'+(it.ok?tilde:'')+'</button>'
        +cuerpo+'<button class="ed" data-bv2ed="'+i+'" aria-label="Cambiar este no negociable">'+lapiz+'</button></li>';
    }).join('')+'</ol><div class="pie num"><span class="pts">'+NN.items.map(function(x){ return '<i class="'+(x.ok?'on':'')+'"></i>'; }).join('')+'</span>'
    +(hechas===3?'<span class="bravo">Listo por hoy.</span>':'')
    +(NN.items.some(function(x){ return x.mio; })?'<button data-bv2reset="1">Volver a las sugerencias</button>':'')+'</div></div>';
  var top='<div class="sal"><div class="esq"><button class="btnE" data-bv2entrar="1">Entrar →</button></div>'
    +'<div class="reloj num" id="bv2reloj">'+_bv2Hora()+'</div><div class="hola">'+esc(_bvSaludo().replace('Buen dia','Buen día'))+(nom?(', '+esc(nom)):'')+'.</div>'+nn
    +'<div class="bajar">Tu día y tus clientes, más abajo ↓</div></div>';
  var X=function(m){ var L=_BV2_JORNADA.hasta-_BV2_JORNADA.desde; return Math.max(0,Math.min(100,(m-_BV2_JORNADA.desde)/L*100)); };
  var bloques=R.map(function(x){ var i=_bv2Min(x.ini); return '<i class="'+(i+x.min<=D.a?'ya':'')+'" style="left:'+X(i)+'%;width:'+(X(i+x.min)-X(i))+'%" title="'+_bv2Hora(x.ini)+' · '+esc(x.w)+'"></i>'; }).join('')
    +((D.a>=_BV2_JORNADA.desde&&D.a<=_BV2_JORNADA.hasta)?'<em style="left:'+X(D.a)+'%"></em>':'');
  var p=R[D.prox], sig=R[D.prox+1], falta='';
  if(p){ var m=_bv2Min(p.ini)-D.a; falta=m<=0?'en curso':'en '+_bv2Dur(m); }
  var hero='<div class="hero"><div class="card"><div class="lbl">Te quedan para trabajar</div><div class="libre num">'+_bv2Dur(D.libre)+'</div>'
    +'<div class="subl num">'+D.n+' reunion'+(D.n===1?'':'es')+' hoy · '+_bv2Dur(D.total)+' en llamadas</div>'
    +'<div class="barra" aria-label="Tu jornada, con las reuniones marcadas">'+bloques+'</div>'
    +'<div class="barra-l num"><span>9:00</span><span>12:00</span><span>15:00</span><span>19:00</span></div></div>'
    +'<div class="card prox">'+(p
      ? '<div class="lbl">Próxima reunión</div><div class="h"><b class="num">'+_bv2Hora(p.ini)+'</b><span>'+falta+'</span></div><div class="w">'+esc(p.w)+'</div>'+(p.c?'<div class="cl">'+esc(p.c)+'</div>':'')
        +(sig?'<div class="sig num">Después: '+_bv2Hora(sig.ini)+' · '+esc(sig.w)+(sig.c?' · '+esc(sig.c):'')+'</div>':'<div class="sig">Es la última del día.</div>')
      : '<div class="lbl">Próxima reunión</div><div class="w">No quedan reuniones hoy</div><div class="sig">Las horas libres se cuentan hasta las 19:00, con 10 min de respiro después de cada reunión.</div>')
    +'</div></div>';
  var act=_bv2Base();
  var nuevos=act.filter(function(c){ var t=new Date(c.altaAt||c.createdAt||0).getTime(); return t && t>=Date.now()-30*86400000; }).length;
  var linea='<div class="linea"><span><b class="num">'+act.length+'</b> cliente'+(act.length===1?' activo':'s activos')+'</span><span><b class="num">'+nuevos+'</b> nuevo'+(nuevos===1?'':'s')+' en los últimos 30 días</span></div>';
  var DEF=[['fren','frenado para lanzar','frenados para lanzar','Ninguno pasó su fecha de lanzar sin campaña al aire.'],
           ['alar','lanzado con alarmas','lanzados con alarmas','Ningún cliente al aire tiene alarmas saltadas.'],
           ['prog','programado para lanzar','programados para lanzar','No hay lanzamientos por delante.'],
           ['bien','sin alarmas','sin alarmas','Todavía no hay clientes al aire sin alarmas. Eso no dice que rindan: mirá «Cómo van los clientes».']];
  var cuadro='<div class="q4">'+DEF.map(function(d){
      var L=G[d[0]], t=(L.length===1?d[1]:d[2]);
      return '<div class="card g '+d[0]+'"><div class="gh"><span class="x"><i></i>'+esc(t.charAt(0).toUpperCase()+t.slice(1))+'</span><span class="k num">'+L.length+'</span></div>'
        +(L.length?'<div class="lst" tabindex="0" aria-label="'+esc(t)+'">'+L.map(function(it, ix){
          // En alarmas, un rotulo al empezar cada grupo: urgentes / pueden esperar.
          var sub='';
          if(d[0]==='alar' && (ix===0 || L[ix-1].tier!==it.tier)){
            var nT=L.filter(function(z){ return z.tier===it.tier; }).length;
            sub='<div class="sub'+(it.tier===1?' urg':'')+'">'+(it.tier===1?'Urgentes y AAA+':'Pueden esperar · ajuste fino')+' · '+nT+'</div>';
          }
          var acc=(it.acc&&d[0]!=='bien')?'<button class="acc" data-bv2cli="'+it.c.id+'" title="'+esc(it.acc)+'">'+esc(it.acc)+'</button>':'<span></span>';
          return sub+'<div class="it"><button class="nm" data-bv2cli="'+it.c.id+'" title="Abrir '+esc(it.n)+'"><b>'+esc(it.n)+(it.aaa?'<span class="aaa">AAA+</span>':'')+(it.nuevo?'<span class="nv">nuevo</span>':'')+'</b><span>'+esc(it.q)+'</span></button>'+acc+'</div>';
        }).join('')+'</div>':'<div class="vac">'+d[3]+'</div>')+'</div>';
    }).join('')+'</div>';
  var U=_bv2Tiempo(), tot=U.reduce(function(t,u){ return t+u.m; },0);
  var usos='<div class="card"><div class="tt">En qué se te fue el tiempo <small>7 días · '+_bv2Dur(tot)+'</small></div>'
    +'<div class="apil">'+(tot?U.map(function(u){ return u.m?'<i style="width:'+(u.m/tot*100)+'%;background:'+u.c+'" title="'+esc(u.l)+'"></i>':''; }).join(''):'')+'</div>'
    +'<div class="usos">'+U.map(function(u){ return '<div><i style="background:'+u.c+'"></i><span>'+esc(u.l)+'</span><b class="num">'+_bv2Dur(u.m)+'</b></div>'; }).join('')
    +'<p>Llamadas que grabaste vos en Fathom y minutos con la app abierta y en uso en este navegador. El resto del trabajo la app no lo mide.</p></div></div>';
  var P=_bv2Pendiente();
  var _csm=(typeof _soyCsm==='function' && _soyCsm());
  var pend='<div class="card"><div class="tt">Lo que espera tu decisión <small>'+(P.length?'hoy':'nada pendiente')+'</small></div><div>'
    +(P.length?P.map(function(r){ return '<div class="reco '+r.t+'"><span class="tipo">'+esc(r.l)+'</span><span class="w">'+esc(r.w)+'<span>'+esc(r.s)+'</span></span><button data-bv2go="'+esc(r.go)+'">'+esc(r.b)+'</button></div>'; }).join('')
      :'<div class="vac" style="border:0;padding:0">No hay cambios propuestos, tickets que venzan hoy ni comentarios sin leer.</div>')
    +'</div></div>';
  return '<div class="fx" aria-hidden="true"><div class="faro"></div><div class="lampara"></div></div>'
    /* Al CSM los mensajes para mandar hoy le van arriba de todo (Santi,
       27/10/2026): es lo que usa todos los dias y quedaba abajo de la jornada
       y de la cartera. Para el resto el orden sigue igual. */
    +'<div class="in">'+top+(_csm?_bv2MensHtml(false):'')+hero+linea+_bv2CarteraHtml()+(_csm?'':_bv2MensHtml(false))+_bv2VigHtml(false)+_bv2AvisosHtml()+cuadro+'<div class="tiempo">'+usos+pend+'</div>'+_bv2PieHtml('Entrar →')+'</div>';
}

// Para el CSM: su trabajo del dia, los avisos y seguimientos al cliente.
function _bv2AvisosHtml(){
  if(!(typeof _soyCsm==='function' && _soyCsm())) return '';
  var A=_bv2Avisos();
  var cuenta=function(src){ return A.filter(function(x){ return x.t.source===src; }).length; };
  return '<div class="card g prog"><div class="gh"><span class="x"><i></i>Avisos y seguimientos al cliente</span><span class="k num">'+A.length+'</span></div>'
    +'<div class="subl" style="margin:-6px 0 8px">'+cuenta('Aviso al cliente')+' avisos · '+cuenta('Tarea del cliente')+' tareas del cliente · '+cuenta('Seguimiento al cliente')+' seguimientos</div>'
    +(A.length?'<div class="lst" tabindex="0" aria-label="Avisos y seguimientos">'+A.map(function(x){
        var tx=String(x.t.text||'').split(' \u2014 ')[0], v=_bv2Vence(x.due);
        return '<div class="it"><button class="nm" data-bv2cli="'+x.c.id+'" title="Abrir '+esc(x.c.name)+'"><b>'+esc(x.c.name)+(x.c.categoria==='AAA+'?'<span class="aaa">AAA+</span>':'')+'</b><span>'+esc(tx)+'</span></button>'
          +'<span class="acc" style="border-color:'+(v==='vencido'||v==='vence hoy'?'var(--red)':'rgba(242,240,235,.18)')+'">'+esc(v)+'</span></div>';
      }).join('')+'</div>':'<div class="vac">No tenés avisos ni seguimientos abiertos.</div>')+'</div>';
}

function _bv2Pintar(){
  var el=document.getElementById('bv2'); if(!el) return;
  // Un mensaje a medio editar sobrevive al repintado (el reloj y la sincronización repintan solos).
  var ta=document.getElementById('bv2MT'), mt=ta?{v:ta.value,a:ta.selectionStart,b:ta.selectionEnd,f:document.activeElement===ta}:null;
  var y=el.scrollTop; el.innerHTML=_BV2.noche?_bv2HtmlNoche():_bv2Html(); el.scrollTop=y;
  var tb=mt&&document.getElementById('bv2MT');
  if(tb){ tb.value=mt.v; if(mt.f){ tb.focus(); try{ tb.setSelectionRange(mt.a,mt.b); }catch(e){} } el.scrollTop=y; }
}
function bienvenida2Cerrar(luego){
  var el=document.getElementById('bv2'); if(!el) return;
  if(_BV2.noche){ buenasNochesVista(); } else { try{ bienvenidaVista(); }catch(e){} }
  clearInterval(_BV2.reloj); document.removeEventListener('keydown', _bv2Tecla); try{ if(_BV2.mo) _BV2.mo.disconnect(); }catch(e){}
  el.style.opacity='0';
  setTimeout(function(){ _BV2.noche=false; if(el.parentNode) el.parentNode.removeChild(el); if(typeof luego==='function') luego(); }, 300);
}
function _bv2Tecla(e){
  if(e.key!=='Escape') return;
  if(document.activeElement && document.activeElement.id==='bv2I'){ _BV2.edit=-1; _bv2Pintar(); return; }
  if(_BV2.medit){ _BV2.medit=null; _bv2Pintar(); return; }
  bienvenida2Cerrar();
}
function _bv2Tic(){
  // «Buenas noches» no pasa la noche abierta: al cambiar el día se cierra sola.
  if(_BV2.noche && _BV2.abierta && rvISO(_BV2.abierta)!==rvISO(new Date())){ bienvenida2Cerrar(); return; }
  if(document.activeElement && document.activeElement.id==='bv2I'){ var r=document.getElementById('bv2reloj'); if(r) r.textContent=_bv2Hora(); return; }
  _bv2Pintar();
}
function bienvenida2Mostrar(){
  if(document.getElementById('bv2')) return;
  if(!document.getElementById('bv2-fuente')){
    var lk=document.createElement('link'); lk.id='bv2-fuente'; lk.rel='stylesheet';
    lk.href='https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400;500;600&family=Geist+Mono:wght@400&display=swap';
    document.head.appendChild(lk);
  }
  if(!document.getElementById('bv2-css')){
    var st=document.createElement('style'); st.id='bv2-css'; st.textContent=_BV2_CSS; document.head.appendChild(st);
  }
  _BV2.abierta=new Date(); _BV2.edit=-1; _BV2.gcal=false; _BV2.reun=_bv2ReunionesLocal();
  var el=document.createElement('div'); el.id='bv2'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Parte del día');
  document.body.appendChild(el); _bv2Pintar();
  requestAnimationFrame(function(){ el.style.opacity='1'; });
  el.addEventListener('submit', function(e){
    var f=e.target.closest('[data-bv2f]'); if(!f) return; e.preventDefault();
    var i=+f.dataset.bv2f, v=(document.getElementById('bv2I').value||'').trim(), n=_bv2NN(_bv2Grupos());
    if(v && v!==n.items[i].t){ n.items[i].t=v; n.items[i].mio=true; n.items[i].vacio=false; _bv2NNGuardar(n); }
    _BV2.edit=-1; _bv2Pintar();
  });
  el.addEventListener('click', function(e){
    var b;
    if((b=e.target.closest('[data-bv2ck]'))){ var n=_bv2NN(_bv2Grupos()), i=+b.dataset.bv2ck; n.items[i].ok=!n.items[i].ok; _bv2NNGuardar(n); _bv2Pintar(); return; }
    if((b=e.target.closest('[data-bv2ed]'))){ var j=+b.dataset.bv2ed; _BV2.edit=(_BV2.edit===j)?-1:j; _bv2Pintar(); var inp=document.getElementById('bv2I'); if(inp){ inp.focus(); inp.select(); } return; }
    if(e.target.closest('[data-bv2reset]')){ try{ localStorage.removeItem(_bv2NNKey()); }catch(err){} _BV2.edit=-1; _bv2Pintar(); return; }
    if(e.target.closest('[data-bv2entrar]')){ bienvenida2Cerrar(); return; }
    if((b=e.target.closest('[data-bv2copy]'))){ _bv2Copiar(+b.dataset.bv2copy); return; }
    if((b=e.target.closest('[data-bv2med]'))){ var mm=(_BV2.mlist||[])[+b.dataset.bv2med]; if(mm){ _BV2.medit=mm.k; _bv2Pintar(); var ta=document.getElementById('bv2MT'); if(ta) ta.focus(); } return; }
    if((b=e.target.closest('[data-bv2mok]'))){ var mo=(_BV2.mlist||[])[+b.dataset.bv2mok], tx=document.getElementById('bv2MT'); if(mo&&tx){ var v=tx.value; _bv2MensGuardar(mo.k,{t:(v.trim()&&v!==String(mo.x.texto||''))?v:null}); } _BV2.medit=null; _bv2Pintar(); return; }
    if(e.target.closest('[data-bv2mno]')){ _BV2.medit=null; _bv2Pintar(); return; }
    if((b=e.target.closest('[data-bv2mlisto]'))){ var ml=(_BV2.mlist||[])[+b.dataset.bv2mlisto]; if(ml){ _bv2MensGuardar(ml.k,{listo:ml.listo?null:new Date().toISOString(), por:ml.listo?null:(String(personaNombre((SB&&SB.email)||'')||'').split(' ')[0]||null)}); _bv2Pintar(); } return; }
    // «Enviar» sigue el link a WhatsApp; además deja el texto copiado por si la app lo pierde.
    if((b=e.target.closest('[data-bv2wa]'))){ _bv2Copiar(+b.dataset.bv2wa); return; }
    if((b=e.target.closest('[data-bv2sug]'))){ _bv2Popup(+b.dataset.bv2sug); return; }
    if((b=e.target.closest('[data-bv2rep]'))){ _bv2Reporte(+b.dataset.bv2rep); return; }
    // El nombre de un cliente, en cualquier tarjeta, abre su reporte de campañas; las sugerencias, en el botón «Ver sugerencias».
    if((b=e.target.closest('.nm[data-bv2cli]'))){ _bv2Reporte(+b.dataset.bv2cli); return; }
    if((b=e.target.closest('[data-bv2cli]'))){ var id=+b.dataset.bv2cli; bienvenida2Cerrar(function(){ try{ selectClient(id); }catch(err){} }); return; }
    if((b=e.target.closest('[data-bv2go]'))){ var go=b.dataset.bv2go;
      bienvenida2Cerrar(function(){ try{ if(go==='showTickets()') showTickets(); else { var m=/^irTorre\('(\w+)'\)$/.exec(go); if(m) irTorre(m[1]); } }catch(err){} }); return; }
  });
  document.addEventListener('keydown', _bv2Tecla);
  // Al cerrarse un cuadro (crear ticket, editar, descartar) la lista se vuelve a dibujar sola.
  var _mr=document.getElementById('modal-root');
  if(_mr && window.MutationObserver){ try{ if(_BV2.mo) _BV2.mo.disconnect(); }catch(e){} _BV2.pop=null; _BV2.reabrir=false; _BV2.mo=new MutationObserver(function(){
      var hay=!!document.getElementById('bv2-pop');
      if(hay){ _BV2.vePop=true; return; }
      if(_mr.firstChild){ if(_BV2.vePop){ _BV2.reabrir=true; _BV2.vePop=false; } return; }
      // modal-root quedo vacio: se vuelve a dibujar la lista y, si venias de una accion del popup, se reabre
      _BV2.vePop=false; setTimeout(_bv2Pintar, 300);
      if(_BV2.reabrir && _BV2.pop){ var id=_BV2.pop; setTimeout(function(){ if(document.getElementById('bv2')) _bv2Popup(id); }, 450); }
      _BV2.reabrir=false; });
    _BV2.mo.observe(_mr,{childList:true}); }
  // El reloj y las horas libres se mueven solos; mientras se escribe un no
  // negociable solo cambia la hora, para no borrar lo que se está tipeando.
  _BV2.reloj=setInterval(_bv2Tic, 60000);
  _bv2SumarGoogle();
}

/* ── Buenas noches (Angie, 19/10/2026) ───────────────────────────────────────
   El cierre del día, con la misma pantalla que la bienvenida. NADA INVENTADO:
   todo sale de lo que la app ya guarda (tickets tildados hoy, llamadas de
   Fathom, decisiones sobre cambios propuestos, lo que vence y lo que espera
   al cliente). Lo que pasó fuera de la app (GHL, Meta, archivos) no se mide
   acá: eso lo cuenta el EOD de la rutina de cierre. */
function _bv2HechoHoy(){
  var out=[];
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    (c.tasks||[]).forEach(function(t){
      if(!t || !t.done || t.deleted || !t.doneAt) return;
      var d=new Date(t.doneAt); if(isNaN(d) || !_bv2Hoy(d)) return;
      out.push({c:c, t:t, at:d});
    });
  });
  return out.sort(function(a,b){ return b.at-a.at; });
}
function _bv2LlamadasHoy(){
  var mail=String((SB&&SB.email)||'').toLowerCase(), out=[];
  (DB.clients||[]).forEach(function(c){
    (c.fathomCalls||[]).forEach(function(l){
      if(String(l.grabo||'').toLowerCase()!==mail) return;
      var d=(typeof _calFechaFathom==='function')?_calFechaFathom(l.date):null;
      if(!d || !_bv2Hoy(d)) return;
      out.push({c:c, l:l, at:d, m:(typeof _durMin==='function')?_durMin(l.duration):0});
    });
  });
  return out.sort(function(a,b){ return a.at-b.at; });
}
function _bv2DecididoHoy(){
  var n={tarea:0, descartado:0, otro:0};
  (DB.clients||[]).forEach(function(c){
    var dec=(c&&c.cambiosDecisiones)||{};
    Object.keys(dec).forEach(function(k){
      var x=dec[k], d=x&&x.at?new Date(x.at):null;
      if(!d || isNaN(d) || !_bv2Hoy(d)) return;
      if(x.estado==='tarea') n.tarea++; else if(x.estado==='descartado') n.descartado++; else n.otro++;
    });
  });
  return n;
}
function _bv2ParaManana(){
  var man=new Date(Date.now()+864e5), lim=rvISO(man), out=[];
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    (c.tasks||[]).forEach(function(t){
      if(!t || t.done || t.deleted || t.archivada || !t.due || t.due>lim || !_bv2Mio(t.responsible)) return;
      out.push({c:c, t:t, due:t.due});
    });
  });
  return out.sort(function(a,b){ return a.due<b.due?-1:(a.due>b.due?1:0); });
}
function _bv2EsperaTercero(){
  var out=[];
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    (c.tasks||[]).forEach(function(t){
      if(!t || t.done || t.deleted || t.archivada || !(t.ownerCliente || t.source==='Seguimiento al cliente' || t.source==='Aviso al cliente' || t.source==='Tarea del cliente')) return;
      out.push({c:c, t:t, due:t.due||'9999-12-31'});
    });
  });
  return out.sort(function(a,b){ return a.due<b.due?-1:(a.due>b.due?1:0); });
}
// Los no negociables que elegiste a la mañana, tal como los dejaste (se pueden
// tildar desde acá). Si no los elegiste, se dice, sin inventar ninguno.
function _bv2NNNoche(){
  // Igual que a la mañana: si no elegiste los tuyos, quedan los que te propuso la pantalla.
  var n=null; try{ n=_bv2NN(_bv2Grupos()); }catch(e){}
  var items=(n&&Array.isArray(n.items))?n.items.filter(function(x){ return x && !x.vacio; }):[];
  if(!items.length) return '<div class="nnB"><h2>NO NEGOCIABLES DE HOY</h2><div class="subl" style="font-size:14px;color:var(--t2)">Hoy no había no negociables para mostrar.</div></div>';
  var tilde='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>';
  var hechas=items.filter(function(x){ return x.ok; }).length;
  return '<div class="nnB"><h2>NO NEGOCIABLES DE HOY · '+hechas+' DE '+items.length+'</h2><ol class="nnL">'+n.items.map(function(it,i){
    if(!it || it.vacio) return '';
    return '<li class="nn'+(it.ok?' hecha':'')+'"><button class="ck" data-bv2ck="'+i+'" aria-pressed="'+(it.ok?'true':'false')+'" aria-label="'+(it.ok?'Desmarcar':'Marcar como hecho')+'">'+(it.ok?tilde:'')+'</button>'
      +'<span class="tx">'+esc(it.t)+'</span><span></span></li>';
  }).join('')+'</ol>'+(hechas===items.length?'<div class="pie num"><span class="bravo">Cumpliste los de hoy.</span></div>':'')+'</div>';
}
// El EOD que deja la rutina de cierre (maquina.eod, migración 043): lo que se hizo
// hoy a grandes rasgos, incluido lo que pasó fuera de la app. Solo cuenta si es de hoy.
function _bv2EodHoy(){
  var hoy=rvISO(new Date()), e=null;
  (DB.clients||[]).forEach(function(c){ if(c && c.eod && c.eod.fecha===hoy) e=c.eod; });
  return e;
}
function _bv2EodHtml(){
  var e=_bv2EodHoy();
  var cab=function(n){ return '<div class="gh"><span class="x"><i></i>Lo que hiciste hoy</span><span class="k num">'+n+'</span></div>'; };
  if(!e) return '<div class="card g bien">'+cab(0)+'<div class="vac">El EOD de hoy todavía no está: lo arma la rutina de cierre a las 18:30.</div></div>';
  var L=(e.lineas||[]).map(function(x){ return '<div class="it"><span class="nm" style="cursor:default"><b>'+esc(x.cliente||'')+'</b><span>'+esc(x.texto||'')+'</span></span><span></span></div>'; }).join('');
  var lista=function(t,a){ return (a&&a.length)?'<div class="sub" style="margin-top:14px">'+t+'</div>'+a.map(function(x){ return '<div class="it"><span class="nm" style="cursor:default"><span>'+esc(x)+'</span></span><span></span></div>'; }).join(''):''; };
  return '<div class="card g bien">'+cab((e.lineas||[]).length)+'<div class="lst" tabindex="0" aria-label="Lo que hiciste hoy">'+L+lista('Queda para mañana',e.manana)+lista('Esperando a terceros',e.esperando)+'</div></div>';
}
function _bv2HtmlNoche(){
  var H=_bv2HechoHoy(), LL=_bv2LlamadasHoy(), DE=_bv2DecididoHoy(), MA=_bv2ParaManana(), ET=_bv2EsperaTercero();
  var pend=0; try{ pend=dashCambiosPendientes().length; }catch(e){}
  var nom=String(personaNombre((SB&&SB.email)||'')||''); nom=(nom.indexOf('@')>=0)?'':nom.split(' ')[0];
  var min=LL.reduce(function(t,x){ return t+(x.m||0); },0);
  var corto=function(t){ return String((t&&t.text)||'').split(' — ')[0]; };
  var fila=function(c, tx, der){ return '<div class="it"><button class="nm" data-bv2cli="'+c.id+'" title="Abrir '+esc(c.name)+'"><b>'+esc(c.name)+'</b><span>'+esc(tx)+'</span></button>'+(der?'<span class="acc" style="border-color:rgba(242,240,235,.18)">'+esc(der)+'</span>':'<span></span>')+'</div>'; };
  var lista=function(arr, vacio, pinta, max){
    if(!arr.length) return '<div class="vac">'+vacio+'</div>';
    var corte=arr.slice(0,max||12), mas=arr.length-corte.length;
    return '<div class="lst" tabindex="0">'+corte.map(pinta).join('')+(mas>0?'<div class="vac" style="border:0;padding:6px 0">y '+mas+' más</div>':'')+'</div>';
  };
  var tarj=function(cls, titulo, n, cuerpo){ return '<div class="card g '+cls+'"><div class="gh"><span class="x"><i></i>'+titulo+'</span><span class="k num">'+n+'</span></div>'+cuerpo+'</div>'; };
  var EOD=_bv2EodHoy();
  var resumen=(EOD?(EOD.lineas||[]).length+' cosas hechas · ':'')+H.length+' ticket'+(H.length===1?'':'s')+' cerrado'+(H.length===1?'':'s')+' · '+LL.length+' llamada'+(LL.length===1?'':'s')+(min?' ('+_bv2Dur(min)+')':'');
  var top='<div class="sal"><div class="esq"><button class="btnE" data-bv2entrar="1">Cerrar el día →</button></div>'
    +'<div class="reloj num" id="bv2reloj">'+_bv2Hora()+'</div><div class="hola">'+esc(_bvSaludo())+(nom?(', '+esc(nom)):'')+'.</div>'
    +'<div class="subl num" style="margin-top:22px;font-size:15px;color:var(--t2)">Hoy: '+resumen+'</div>'
    +_bv2NNNoche()
    +'<div class="bajar">Lo que quedó hecho y lo que sigue, más abajo ↓</div></div>';
  var hecho=tarj('bien','Lo que quedó hecho hoy',H.length,lista(H,'Hoy no se tildó ningún ticket en la app.',function(x){ return fila(x.c, corto(x.t), x.t.ticket||''); },10));
  var llam=tarj('prog','Llamadas de hoy',LL.length,lista(LL,'No grabaste llamadas hoy en Fathom.',function(x){ return fila(x.c, String(x.l.title||'Llamada'), x.m?_bv2Dur(x.m):''); },10));
  var dec=tarj('prog','Lo que decidiste hoy sobre cambios propuestos',DE.tarea+DE.descartado+DE.otro,
    (DE.tarea+DE.descartado+DE.otro)?'<div class="subl">'+DE.tarea+' pasaron a ticket · '+DE.descartado+' se descartaron'+(DE.otro?' · '+DE.otro+' otras':'')+'</div>':'<div class="vac">Hoy no decidiste ningún cambio propuesto.</div>');
  var man=tarj('alar','Queda para mañana',MA.length+(pend?pend:0),
    (pend?'<div class="subl" style="margin-bottom:8px">'+pend+' cambio'+(pend===1?'':'s')+' propuesto'+(pend===1?'':'s')+' sin decidir</div>':'')
    +lista(MA,'No tenés tickets que venzan hasta mañana.',function(x){ return fila(x.c, corto(x.t), _bv2Vence(x.due)); },10));
  var esp=tarj('fren','Esperando a terceros',ET.length,lista(ET,'No hay nada esperando al cliente o a otra persona.',function(x){ return fila(x.c, corto(x.t), _bv2Vence(x.due)); },8));
  return '<div class="fx" aria-hidden="true"><div class="faro"></div><div class="lampara"></div></div>'
    +'<div class="in">'+top+'<div class="q4" style="grid-template-columns:1fr">'+_bv2EodHtml()+'</div>'+_bv2VigHtml(true)+_bv2MensHtml(true)+'<div class="q4">'+hecho+llam+man+esp+'</div>'+'<div class="q4" style="grid-template-columns:1fr">'+dec+'</div>'
    +'<div class="vac" style="border:0;padding:0 4px">Las tarjetas de abajo cuentan lo que la app sabe; lo hecho fuera de ella (GHL, Meta, archivos) está en «Lo que hiciste hoy», que arma la rutina de cierre.</div>'+_bv2PieHtml('Cerrar el día →')+'</div>';
}
function buenasNochesMostrar(){
  if(document.getElementById('bv2')) return;
  _BV2.noche=true; bienvenida2Mostrar();
  var el=document.getElementById('bv2'); if(el) el.setAttribute('aria-label','Cierre del día');
}

// Sale sola una vez por día, la primera vez que se abre la app después de las 19:00
// (si ya viste el «buen día» de hoy). Con la llave de la bienvenida apagada, no sale.
function _bnKey(){ return 'evold-buenas-noches-'+String((SB&&SB.email)||'x'); }
function buenasNochesToca(){
  if(!_bv2On() || new Date().getHours()<19) return false;
  try{ return localStorage.getItem(_bnKey())!==rvISO(new Date()); }catch(e){ return false; }
}
function buenasNochesVista(){
  try{ localStorage.setItem(_bnKey(), rvISO(new Date())); }catch(e){}
}
