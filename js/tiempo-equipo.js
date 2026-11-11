/* ── Dashboard · la rueda del tiempo del equipo (Angie, 11/11/2026) ────────
   Cuánto tiempo va a estrategia y dataset, a revisión y optimización de
   embudos y a cambios e implementación, por persona o del equipo completo, en
   un rango de fechas (por defecto, esta semana desde el lunes).

   Solo entra lo que se mide de verdad:
   · El tiempo con Claude de cada máquina (cuatro tipos y «sin clasificar»; el
     cuarto, «sistemas y procesos», es lo interno: migración 056): `tools/medir-tiempo.mjs` de TFC-OS
     lo cuenta desde las sesiones de esa máquina y lo sube como totales por
     día (maquina.tiempoEquipo del cliente interno, migración 055). El tipo
     sale de la skill que usó la sesión; sin skill, «sin clasificar».
   · Las llamadas grabadas en Fathom (c.fathomCalls): la duración y quién
     grabó. El tipo sale del título; si el título no lo dice, «sin
     clasificar».
   Lo que no se mide (WhatsApp, tickets, cambios de Meta) no va en la rueda.
   Quien no reportó dice «sin datos»: no es cero. */

var TQ_TIPOS=[
  {k:'estrategia',     l:'Estrategia y dataset',               col:'#C8FF47'},
  {k:'optimizacion',   l:'Revisión y optimización de embudos', col:'#4CC9F0'},
  {k:'implementacion', l:'Cambios e implementación',           col:'#B388FF'},
  // Lo interno: la web app, las skills, las herramientas y los procesos (Angie, 11/11/2026).
  {k:'sistemas',       l:'Sistemas y procesos (interno)',      col:'#FFB547'},
  {k:'sin_clasificar', l:'Sin clasificar',                     col:'#3A3F4B'}
];
// Quienes tienen con qué medir: una rutina o la herramienta en su máquina.
var TQ_ESPERADOS=['angie','santi','ashtyn'];

function _tqIso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _tqLunes(hoy){ var d=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
function _tqSlug(v){
  return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().split(/[\s@._]+/)[0].replace(/[^a-z0-9-]/g,'');
}
// La fecha de una llamada viene como la escribe es-AR: «9/11/2026».
function _tqFechaLlamada(s){
  var m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m?(m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')):'';
}
// «28 min», «1h 6m», «1h».
function _tqMinutos(s){
  s=String(s||''); var h=s.match(/(\d+)\s*h/), m=s.match(/(\d+)\s*m/);
  return (h?Number(h[1])*60:0)+(m?Number(m[1]):0);
}
function tqTipoLlamada(t){
  t=String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  // Lo interno va primero: «Revisión del tracker» es sistemas, no optimización.
  if(/sistema|proceso|skill|tracker|web ?app|automatiza/.test(t)) return 'sistemas';
  if(/estrateg|dataset|oferta|diagnost|onboarding|kick ?off|propuesta/.test(t)) return 'estrategia';
  if(/seguimiento|revision|catch ?up|optimiz|resultado|reporte/.test(t)) return 'optimizacion';
  if(/implementa|lanzamiento|embudo|landing|setup|configura|campana/.test(t)) return 'implementacion';
  return 'sin_clasificar';
}
// La persona de una llamada: quien la grabó, por su mail en Personas.
function _tqPersonaLlamada(l, personas){
  var mail=String(l&&l.grabo||'').toLowerCase(); if(!mail) return '';
  var p=(personas||[]).find(function(x){ return String(x&&x.email||'').toLowerCase()===mail; });
  return _tqSlug(p&&p.nombre?p.nombre:mail);
}

function tqDatos(clients, personas, desde, hasta, persona){
  var vacio=function(){ var o={}; TQ_TIPOS.forEach(function(t){ o[t.k]=0; }); return o; };
  var r={claude:vacio(), llamadas:vacio(), reportaron:{}, ultimo:{}, nLlamadas:0};
  var te=null; (clients||[]).forEach(function(c){ if(c&&c.tiempoEquipo&&Array.isArray(c.tiempoEquipo.dias)) te=c.tiempoEquipo; });
  ((te&&te.dias)||[]).forEach(function(d){
    if(!d||!d.persona) return;
    if(!r.ultimo[d.persona]||String(d.at||'')>r.ultimo[d.persona]) r.ultimo[d.persona]=String(d.at||'');
    if(d.fecha<desde||d.fecha>hasta) return;
    if(persona&&d.persona!==persona) return;
    r.reportaron[d.persona]=1;
    TQ_TIPOS.forEach(function(t){ r.claude[t.k]+=Number(d[t.k])||0; });
  });
  var vistas={};
  (clients||[]).forEach(function(c){
    (c&&c.fathomCalls||[]).forEach(function(l){
      var clave=String(l&&(l.id||l.url)||''); if(!clave||vistas[clave]) return;
      var f=_tqFechaLlamada(l.date); if(!f||f<desde||f>hasta) return;
      var p=_tqPersonaLlamada(l, personas); if(!p) return;
      if(persona&&p!==persona) return;
      var min=_tqMinutos(l.duration); if(!min) return;
      vistas[clave]=1; r.nLlamadas++;
      r.llamadas[tqTipoLlamada(l.title)]+=min;
    });
  });
  r.total=0; r.porTipo=vacio();
  TQ_TIPOS.forEach(function(t){ r.porTipo[t.k]=r.claude[t.k]+r.llamadas[t.k]; r.total+=r.porTipo[t.k]; });
  return r;
}

function _tqHoras(min){ min=Math.round(min||0); return min>=60?(Math.floor(min/60)+' h '+String(min%60).padStart(2,'0')):(min+' min'); }
function _tqNombre(slug){ return slug?slug.charAt(0).toUpperCase()+slug.slice(1):''; }

function _tqRueda(r){
  var R=54, C=2*Math.PI*R, off=0, arcos='';
  if(r.total>0) TQ_TIPOS.forEach(function(t){
    var v=r.porTipo[t.k]; if(!v) return;
    var largo=C*v/r.total;
    arcos+='<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="'+t.col+'" stroke-width="22" '
      +'stroke-dasharray="'+largo.toFixed(2)+' '+(C-largo).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" '
      +'transform="rotate(-90 70 70)"><title>'+esc(t.l)+': '+_tqHoras(v)+'</title></circle>';
    off+=largo;
  });
  else arcos='<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="var(--border2)" stroke-width="22" stroke-dasharray="4 6"/>';
  return '<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Tiempo por tipo de trabajo">'+arcos
    +'<text x="70" y="68" text-anchor="middle" font-size="17" font-weight="600" fill="var(--strong)">'+(r.total?_tqHoras(r.total):'—')+'</text>'
    +'<text x="70" y="86" text-anchor="middle" font-size="10.5" fill="var(--text3)">medidas</text></svg>';
}

function tqSet(k, v){
  S.tq=S.tq||{}; S.tq[k]=v;
  if(k==='rango'){
    var hoy=new Date(), lun=_tqLunes(hoy);
    if(v==='semana'){ S.tq.desde=_tqIso(lun); S.tq.hasta=_tqIso(hoy); }
    if(v==='pasada'){ var a=new Date(lun); a.setDate(a.getDate()-7); var b=new Date(lun); b.setDate(b.getDate()-1); S.tq.desde=_tqIso(a); S.tq.hasta=_tqIso(b); }
    if(v==='mes'){ S.tq.desde=_tqIso(new Date(hoy.getFullYear(),hoy.getMonth(),1)); S.tq.hasta=_tqIso(hoy); }
  }
  if(k==='desde'||k==='hasta') S.tq.rango='';
  showTickets();
}

function tiempoEquipoHtml(){
  var q=S.tq||{}, hoy=new Date();
  var desde=q.desde||_tqIso(_tqLunes(hoy)), hasta=q.hasta||_tqIso(hoy), persona=q.persona||'';
  var rango=(q.rango===undefined&&!q.desde)?'semana':(q.rango||'');
  var r=tqDatos(DB.clients, DB.personas, desde, hasta, persona);
  var gente={}; TQ_ESPERADOS.forEach(function(p){ gente[p]=1; }); Object.keys(r.ultimo).forEach(function(p){ gente[p]=1; });
  var _selSt='font:inherit;font-size:12.5px;padding:6px 10px;border-radius:999px;border:1px solid var(--border2);background:var(--bg2);color:var(--text)';
  var seg=function(k,l){ return '<button class="seg'+(rango===k?' on':'')+'" onclick="tqSet(\'rango\',\''+k+'\')">'+l+'</button>'; };
  var filtros='<select aria-label="Persona" style="'+_selSt+(persona?';border-color:var(--accent)':'')+'" onchange="tqSet(\'persona\',this.value)">'
      +'<option value="">Equipo completo</option>'
      +Object.keys(gente).sort().map(function(p){ return '<option value="'+esc(p)+'"'+(persona===p?' selected':'')+'>'+esc(_tqNombre(p))+'</option>'; }).join('')
    +'</select>'
    +'<div style="display:flex;background:#12151C;border-radius:999px;padding:4px">'+seg('semana','Esta semana')+seg('pasada','Semana pasada')+seg('mes','Este mes')+'</div>'
    +'<input type="date" aria-label="Desde" value="'+esc(desde)+'" onchange="tqSet(\'desde\',this.value)" style="'+_selSt+'">'
    +'<input type="date" aria-label="Hasta" value="'+esc(hasta)+'" onchange="tqSet(\'hasta\',this.value)" style="'+_selSt+'">';

  var leyenda=TQ_TIPOS.map(function(t){
    var v=r.porTipo[t.k], pct=r.total?Math.round(100*v/r.total):0;
    return '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px">'
      +'<span style="width:10px;height:10px;border-radius:3px;background:'+t.col+';flex:none"></span>'
      +'<span style="flex:1;color:var(--text)">'+esc(t.l)+'</span>'
      +'<span style="color:var(--strong);font-weight:600">'+_tqHoras(v)+'</span>'
      +'<span style="color:var(--text3);width:38px;text-align:right">'+pct+'%</span></div>';
  }).join('');

  var quienes=persona?[persona]:Object.keys(gente).sort();
  var sinDatos=quienes.filter(function(p){ return !r.reportaron[p]; });
  var conDatos=quienes.filter(function(p){ return r.reportaron[p]; });
  var nota='<div style="font-size:11.5px;color:var(--text3);line-height:1.5">'
    +'Con Claude: '+_tqHoras(r.total-TQ_TIPOS.reduce(function(s,t){ return s+r.llamadas[t.k]; },0))
    +' · en llamadas grabadas: '+_tqHoras(TQ_TIPOS.reduce(function(s,t){ return s+r.llamadas[t.k]; },0))+' ('+r.nLlamadas+')'
    +(conDatos.length?('<br>Midieron: '+conDatos.map(function(p){ return esc(_tqNombre(p))+(r.ultimo[p]?' (último reporte '+esc(String(r.ultimo[p]).slice(0,10))+')':''); }).join(', ')):'')
    +(sinDatos.length?('<br><span style="color:#FF8A4C">Sin datos de Claude en estas fechas: '+sinDatos.map(function(p){ return esc(_tqNombre(p)); }).join(', ')+'. No es cero: todavía no reportaron.</span>'):'')
    +'<br>Lo que no guarda horas (WhatsApp, tickets, cambios de Meta) no entra. Si una llamada pasó con Claude abierto, ese rato cuenta en los dos.'
    +'</div>';

  return '<div class="card" style="display:flex;flex-direction:column;gap:14px">'
    +'<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">'
      +'<div class="h">En qué se va el tiempo <span style="color:var(--text3);font-weight:400">· '+(persona?esc(_tqNombre(persona)):'equipo completo')+'</span></div>'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">'+filtros+'</div></div>'
    +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:24px">'+_tqRueda(r)
      +'<div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:8px">'+leyenda+'</div></div>'
    +nota+'</div>';
}
