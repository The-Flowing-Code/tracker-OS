/* ── Parte del día v2: la bienvenida nueva (Angie, 19/10/2026) ─────────────
   Modelo: el artifact 4JBuYqxuwiYxb2JfduZsiZ («Propuesta», fondo Faro).
   Mientras Angie la revisa, sale SOLO en el navegador que tiene la llave
   localStorage 'evold-bienvenida-v2' = '1'; el resto sigue viendo la de antes
   (bienvenidaMostrar, en index.html).

   ⚠️  NADA INVENTADO. El modelo traía horas por tipo de trabajo y horas que
   «te sacás de encima»: la app no guarda ninguna de las dos. En su lugar va
   lo que sí se mide (llamadas grabadas por vos y minutos activos en la app)
   y lo que espera una decisión tuya, cada cosa con su botón.

   Solo declaraciones: todo lo de la app se usa recién al abrirla. */

function _bv2On(){
  try{ return localStorage.getItem('evold-bienvenida-v2')==='1'; }catch(e){ return false; }
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

/* La cartera en cuatro: lo que se mira primero va arriba. Se apoya en lo que
   ya decide la app: _yaLanzo (hay campaña nuestra al aire), _lanzaCuenta (la
   fecha de lanzar), alarmStatus y la tarea sin tildar de la etapa actual. */
function _bv2Grupos(){
  var G={fren:[], alar:[], prog:[], bien:[]};
  var base=(typeof activeClients==='function')?activeClients():[];
  try{ if(typeof soloCartera==='function' && soloCartera() && typeof esDeMiCartera==='function') base=base.filter(esDeMiCartera); }catch(e){}
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
    var pu=c.metaPulso||null, gasto=pu?((+pu.gasto||0)+(+((pu.anterior||{}).gasto)||0)):0;
    if(!L && gasto>0 && pu && !(+pu.activos)){
      it.q='campaña pausada · sin anuncios al aire'+(pu.at?(' · pulso del '+new Date(pu.at).getDate()+'/'+(new Date(pu.at).getMonth()+1)):'');
      it.acc='Ver campaña'; it.orden=-99; G.alar.push(it);
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
    if(al && al.breached>0){
      var d0=al.detalle[0]||{};
      it.q=dia+' · '+(d0.label||'alarma')+(d0.valor?(': '+d0.valor+(d0.limite?(' (límite '+d0.limite+')'):'')):'')+(al.breached>1?(' · '+al.breached+' alarmas'):'');
      it.acc='Ver alarmas'; it.orden=-al.breached; G.alar.push(it);
    } else {
      it.q=dia+' · sin alarmas'; it.orden=-(L.dias||0); G.bien.push(it);
    }
  });
  // Los AAA+ primero en cada tarjeta (Angie, 19/10/2026): con ellos no alcanza
  // con que funcione, tienen que estar cerca del resultado.
  Object.keys(G).forEach(function(k){ G[k].sort(function(a,b){ return ((b.aaa?1:0)-(a.aaa?1:0)) || (a.orden-b.orden); }); });
  return G;
}

/* Los 3 no negociables: lo más frenado, la peor alarma y la reunión con un
   cliente que más pesa hoy. Lo que cambies o tildes queda en este navegador,
   por persona y por día. */
function _bv2NNKey(){ return 'evold-bv2-nn-'+String((SB&&SB.email)||'x')+'-'+rvISO(new Date()); }
function _bv2Sugeridos(G){
  var s=[], aaa=function(L){ return L.filter(function(x){ return x.aaa; })[0]||L[0]; };
  var f=aaa(G.fren), a=aaa(G.alar);
  var r=(_BV2.reun||[]).filter(function(x){ return x.cliId && _bv2Min(x.ini)+x.min>_bv2Min(new Date()); })[0];
  if(f) s.push({t:'Destrabar '+f.n+(f.acc&&f.acc!=='Abrir'?(': '+f.acc.charAt(0).toLowerCase()+f.acc.slice(1)):''), por:f.q, cid:f.c.id});
  if(a) s.push({t:'Resolver la alarma de '+a.n, por:a.q, cid:a.c.id});
  if(r) s.push({t:'Llegar preparada a '+r.w+((r.c && String(r.w).toLowerCase().indexOf(String(r.c).toLowerCase())<0)?(' con '+r.c):'')+' ('+_bv2Hora(r.ini)+')', por:'tu próxima reunión con un cliente', cid:r.cliId});
  var p=G.prog[0];
  if(s.length<3 && p) s.push({t:'Dejar listo el lanzamiento de '+p.n, por:p.q, cid:p.c.id});
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
  +'#bv2 .in{position:relative;z-index:2;max-width:1004px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left,0px)) 48px;display:flex;flex-direction:column;gap:28px}'
  +'#bv2 .sal{position:relative;min-height:calc(100vh - 56px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding-top:40px}'
  +'#bv2 .esq{position:absolute;top:0;right:0;display:flex;gap:14px;align-items:center}'
  +'#bv2 .sello{font-family:"Geist Mono",ui-monospace,monospace;font-size:11.5px;color:var(--t3);display:flex;align-items:center;gap:7px}'
  +'#bv2 .sello i{width:6px;height:6px;border-radius:50%;background:var(--ok)}'
  +'#bv2 .btnE{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 18px;border-radius:99px;background:var(--ok);color:#080A0F;font-weight:600;font-size:13.5px}'
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
  +'#bv2 .tt small{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:rgba(242,240,235,.55)}'
  +'#bv2 .apil{display:flex;height:6px;border-radius:3px;overflow:hidden;gap:3px;background:rgba(242,240,235,.05)} #bv2 .apil i{display:block;height:100%;border-radius:3px}'
  +'#bv2 .usos{display:grid;margin-top:12px} #bv2 .usos div{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px;color:var(--t2);padding:7px 0;border-top:1px solid var(--ln)}'
  +'#bv2 .usos div:first-child{border-top:0} #bv2 .usos i{width:6px;height:6px;border-radius:50%} #bv2 .usos b{font-family:"Geist Mono",ui-monospace,monospace;font-weight:400;font-size:12px;color:#F2F0EB}'
  +'#bv2 .usos p{margin:8px 0 0;font-size:11.5px;color:var(--t3)}'
  +'#bv2 .reco{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:11px 0;border-top:1px solid var(--ln);align-items:center}'
  +'#bv2 .reco:first-child{border-top:0;padding-top:0} #bv2 .reco .tipo{grid-column:1/-1;font-size:11px;color:var(--c)}'
  +'#bv2 .reco .w{font-size:14px;font-weight:500;letter-spacing:-.01em} #bv2 .reco .w span{display:block;font-weight:400;color:var(--t3);font-size:12.5px;margin-top:1px}'
  +'#bv2 .reco button{font-size:12px;font-weight:500;padding:6px 11px;border-radius:99px;border:1px solid rgba(242,240,235,.18);white-space:nowrap} #bv2 .reco button:hover{border-color:var(--ok)}'
  +'#bv2 .agente{--c:var(--ok)} #bv2 .delegar{--c:var(--prog)} #bv2 .auto{--c:rgba(242,240,235,.6)}';

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
  var top='<div class="sal"><div class="esq"><span class="sello"><i></i>actualizado '+_bv2Hora(_BV2.abierta)+'</span><button class="btnE" data-bv2entrar="1">Entrar →</button></div>'
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
  var act=(typeof activeClients==='function')?activeClients():[];
  var nuevos=act.filter(function(c){ var t=new Date(c.altaAt||c.createdAt||0).getTime(); return t && t>=Date.now()-30*86400000; }).length;
  var linea='<div class="linea"><span><b class="num">'+act.length+'</b> cliente'+(act.length===1?' activo':'s activos')+'</span><span><b class="num">'+nuevos+'</b> nuevo'+(nuevos===1?'':'s')+' en los últimos 30 días</span></div>';
  var DEF=[['fren','frenado para lanzar','frenados para lanzar','Ninguno pasó su fecha de lanzar sin campaña al aire.'],
           ['alar','lanzado con alarmas','lanzados con alarmas','Ningún cliente al aire tiene alarmas saltadas.'],
           ['prog','programado para lanzar','programados para lanzar','No hay lanzamientos por delante.'],
           ['bien','viene bien','vienen bien','Todavía no hay clientes al aire sin alarmas.']];
  var cuadro='<div class="q4">'+DEF.map(function(d){
      var L=G[d[0]], t=(L.length===1?d[1]:d[2]);
      return '<div class="card g '+d[0]+'"><div class="gh"><span class="x"><i></i>'+esc(t.charAt(0).toUpperCase()+t.slice(1))+'</span><span class="k num">'+L.length+'</span></div>'
        +(L.length?'<div class="lst" tabindex="0" aria-label="'+esc(t)+'">'+L.map(function(it){
          var acc=(it.acc&&d[0]!=='bien')?'<button class="acc" data-bv2cli="'+it.c.id+'" title="'+esc(it.acc)+'">'+esc(it.acc)+'</button>':'<span></span>';
          return '<div class="it"><button class="nm" data-bv2cli="'+it.c.id+'" title="Abrir '+esc(it.n)+'"><b>'+esc(it.n)+(it.aaa?'<span class="aaa">AAA+</span>':'')+(it.nuevo?'<span class="nv">nuevo</span>':'')+'</b><span>'+esc(it.q)+'</span></button>'+acc+'</div>';
        }).join('')+'</div>':'<div class="vac">'+d[3]+'</div>')+'</div>';
    }).join('')+'</div>';
  var U=_bv2Tiempo(), tot=U.reduce(function(t,u){ return t+u.m; },0);
  var usos='<div class="card"><div class="tt">En qué se te fue el tiempo <small>7 días · '+_bv2Dur(tot)+'</small></div>'
    +'<div class="apil">'+(tot?U.map(function(u){ return u.m?'<i style="width:'+(u.m/tot*100)+'%;background:'+u.c+'" title="'+esc(u.l)+'"></i>':''; }).join(''):'')+'</div>'
    +'<div class="usos">'+U.map(function(u){ return '<div><i style="background:'+u.c+'"></i><span>'+esc(u.l)+'</span><b class="num">'+_bv2Dur(u.m)+'</b></div>'; }).join('')
    +'<p>Llamadas que grabaste vos en Fathom y minutos con la app abierta y en uso en este navegador. El resto del trabajo la app no lo mide.</p></div></div>';
  var P=_bv2Pendiente();
  var pend='<div class="card"><div class="tt">Lo que espera tu decisión <small>'+(P.length?'hoy':'nada pendiente')+'</small></div><div>'
    +(P.length?P.map(function(r){ return '<div class="reco '+r.t+'"><span class="tipo">'+esc(r.l)+'</span><span class="w">'+esc(r.w)+'<span>'+esc(r.s)+'</span></span><button data-bv2go="'+esc(r.go)+'">'+esc(r.b)+'</button></div>'; }).join('')
      :'<div class="vac" style="border:0;padding:0">No hay cambios propuestos, tickets que venzan hoy ni comentarios sin leer.</div>')
    +'</div></div>';
  return '<div class="fx" aria-hidden="true"><div class="faro"></div><div class="lampara"></div></div>'
    +'<div class="in">'+top+hero+linea+cuadro+'<div class="tiempo">'+usos+pend+'</div></div>';
}

function _bv2Pintar(){
  var el=document.getElementById('bv2'); if(!el) return;
  var y=el.scrollTop; el.innerHTML=_bv2Html(); el.scrollTop=y;
}
function bienvenida2Cerrar(luego){
  var el=document.getElementById('bv2'); if(!el) return;
  try{ bienvenidaVista(); }catch(e){}
  clearInterval(_BV2.reloj); document.removeEventListener('keydown', _bv2Tecla);
  el.style.opacity='0';
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); if(typeof luego==='function') luego(); }, 300);
}
function _bv2Tecla(e){
  if(e.key!=='Escape') return;
  if(document.activeElement && document.activeElement.id==='bv2I'){ _BV2.edit=-1; _bv2Pintar(); return; }
  bienvenida2Cerrar();
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
    if((b=e.target.closest('[data-bv2cli]'))){ var id=+b.dataset.bv2cli; bienvenida2Cerrar(function(){ try{ selectClient(id); }catch(err){} }); return; }
    if((b=e.target.closest('[data-bv2go]'))){ var go=b.dataset.bv2go;
      bienvenida2Cerrar(function(){ try{ if(go==='showTickets()') showTickets(); else { var m=/^irTorre\('(\w+)'\)$/.exec(go); if(m) irTorre(m[1]); } }catch(err){} }); return; }
  });
  document.addEventListener('keydown', _bv2Tecla);
  // El reloj y las horas libres se mueven solos; mientras se escribe un no
  // negociable solo cambia la hora, para no borrar lo que se está tipeando.
  _BV2.reloj=setInterval(function(){
    if(document.activeElement && document.activeElement.id==='bv2I'){ var r=document.getElementById('bv2reloj'); if(r) r.textContent=_bv2Hora(); return; }
    _bv2Pintar();
  }, 60000);
  _bv2SumarGoogle();
}
