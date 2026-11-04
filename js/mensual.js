// ---- Comparacion mensual del servicio (Angie, 04/11/2026) ----
// Reemplaza en el Dashboard las tarjetas de los ultimos dias y la grilla de
// actividad por un cuadro de este mes contra el anterior: altas, abandono,
// ticket, tiempos por etapa y el embudo de campañas de todos los clientes.
//
// Cada registro cuenta en el mes en que entro, con lo que le paso despues
// (agendo, tuvo la llamada, compro): la misma cohorte que usa el reporte de
// campañas. Las etapas se leen como el reporte (armar_datos.py): si el cliente
// tiene reglas propias en `ghlRules`, mandan esas.
//
// La inversion de Meta de cada mes se pide aparte (insights de la cuenta) y se
// guarda solo en memoria, nunca en el cliente: `_metaSpend` se pisa a si mismo.
// Solo declaraciones: lo prueba tests/modulos.test.js.

var MENS_TEST=/\btest|prueba|john doe|caporicci/i;
var MENS_AGEND=/programad[ao]|asisti[oó]|tomando decisi|compr[oó]|filtro realizado|llamada tenida/i;
var MENS_ASIST=/asisti[oó]|tomando decisi|compr[oó]|filtro realizado|llamada tenida|\b(2da|3ra|4ta)\s+llamada programada/i;
var MENS_NOASIST=/no asisti|no asisit|no compr/i;
var MENS_COMPRO=/compr[oó]/i;
var MENS_NOMBRES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
// Pasos del servicio, con el nombre con que quedan tildados en `rutaHechas`.
var MENS_PASOS=[
  ['Alta al onboarding', null, ['Onboarding']],
  ['Onboarding a estrategia', ['Onboarding'], ['Estrategia']],
  ['Estrategia al embudo montado', ['Estrategia'], ['Sistemas y Montado del Embudo','Sistemas']],
  ['Embudo montado al lanzamiento', ['Sistemas y Montado del Embudo','Sistemas'], ['Lanzamiento']]
];
var MENS_GASTO={};      // 'idCliente|AAAA-MM' -> {spend, at} o {error, at}
var MENS_PIDIENDO={};
var _mensRepintar=null;

// Los dos meses cerrados que se comparan y el mes en curso, cortado hoy: comparar
// un mes entero contra cuatro dias daba «−100 %» en todo.
function mensMeses(hoy){
  var h=hoy?new Date(hoy):new Date();
  var mk=function(y,m,hasta){
    var d=new Date(y,m,1), f=hasta||new Date(y,m+1,1);
    return {ym:y+'-'+String(m+1).padStart(2,'0'), desde:d.getTime(), hasta:f.getTime(),
            nombre:MENS_NOMBRES[m], enCurso:!!hasta};
  };
  var y=h.getFullYear(), m=h.getMonth(), at=function(k){ var d=new Date(y,m-k,1); return [d.getFullYear(), d.getMonth()]; };
  var fin=new Date(h); fin.setHours(23,59,59,999);
  var a=at(2), b=at(1);
  return [mk(a[0],a[1]), mk(b[0],b[1]), mk(y,m,new Date(fin.getTime()+1))];
}
function _mensFecha(s){
  if(!s) return null;
  var m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]).getTime();
  // «2026-08-19» sola es medianoche UTC: en Argentina caeria el dia anterior.
  var d=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(d) return new Date(+d[1], +d[2]-1, +d[3]).getTime();
  var t=new Date(s).getTime(); return isFinite(t)?t:null;
}
function _mensEn(t, M){ return t!=null && t>=M.desde && t<M.hasta; }
function _mensDia(t){ var d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
function _mensDias(a,b){ return Math.round((_mensDia(b)-_mensDia(a))/86400000); }
function _mensProm(v){ return v.length?v.reduce(function(s,x){return s+x;},0)/v.length:null; }
function _mensReglas(c){
  var r=(c&&c.ghlRules)||{}, n=function(l){ return (l||[]).map(function(x){ return _n(x); }); };
  return {agendas:n(r.agendas), vivo:n((r.llamadaEnVivo||[]).concat(r.asistencias||[])),
          pres:n(r.presentaciones), ganado:n(r.ganado)};
}
// Que paso con un registro, mirando su etapa de hoy.
function mensClasificar(o, R){
  var st=String(o.pipelineStage||''), sn=_n(st), won=String(o.status||'').toLowerCase()==='won';
  var no=MENS_NOASIST.test(st);
  var compro=won || (R.ganado.length ? R.ganado.indexOf(sn)>=0 : (MENS_COMPRO.test(st) && !/no\s+compr/i.test(st)));
  var vivo=compro || (R.vivo.length ? R.vivo.indexOf(sn)>=0 : (MENS_ASIST.test(st) && !no)) || /no\s+compr/i.test(st);
  var agenda=vivo || no || (R.agendas.length ? R.agendas.indexOf(sn)>=0 : MENS_AGEND.test(st));
  var pres=R.pres.length ? (compro || R.pres.indexOf(sn)>=0) : null;
  return {agenda:agenda, vivo:vivo, pres:pres, compro:compro};
}
// Un archivado sin contrato ni pagos no llego a ser cliente (una venta que no
// se cerro, o una ficha repetida): no cuenta como alta ni como abandono.
function _mensCliente(c){
  if(!c.archived) return true;
  var pago=(c.acordado&&c.acordado.pago&&c.acordado.pago.valor);
  return Number(c.contractValue)>0 || (c.pagos||[]).length>0 || !!pago;
}
function _mensEsPrueba(o){ return MENS_TEST.test(String(o.contactName||'')+' '+String(o.name||'')); }

// La inversion de un mes en USD, o null mientras se pide (y la pide).
function mensGasto(c, M){
  var k=c.id+'|'+M.ym, v=MENS_GASTO[k];
  var vence=M.enCurso?30*60*1000:6*3600*1000;
  if(v && Date.now()-v.at<vence) return v;
  if(!c.metaToken || !c.metaAccountId) return {sinMeta:true};
  if(!MENS_PIDIENDO[k]) mensPedirGasto(c, M);
  return v||null;
}
async function mensPedirGasto(c, M){
  var k=c.id+'|'+M.ym; MENS_PIDIENDO[k]=true;
  try{
    var hasta=new Date(Math.min(M.hasta, Date.now())-1);
    var rango=JSON.stringify({since:isoDate(new Date(M.desde)), until:isoDate(hasta)});
    var url='https://graph.facebook.com/v25.0/act_'+c.metaAccountId+'/insights?fields=spend&level=account'
      +'&time_range='+encodeURIComponent(rango)+'&access_token='+c.metaToken;
    var r=await fetch(url), j=await r.json();
    if(j.error) throw new Error(j.error.message||'Meta');
    var s=((j.data||[])[0]||{}).spend;
    MENS_GASTO[k]={spend:s!=null?Number(s):0, at:Date.now()};
  }catch(e){ MENS_GASTO[k]={error:String(e&&e.message||e), at:Date.now()}; }
  delete MENS_PIDIENDO[k];
  clearTimeout(_mensRepintar);
  _mensRepintar=setTimeout(function(){
    if(typeof document!=='undefined' && document.querySelector('.dsh .mens') && typeof showTickets==='function') showTickets();
  }, 400);
}

// Los numeros de un mes. `todos` incluye archivados (altas y abandono);
// `activos` son los clientes de los que se miran las campañas.
function mensCalcular(M, todos, activos){
  var R={M:M};
  var nuevos=todos.filter(function(c){ return _mensEn(_mensFecha(c.altaAt), M); });
  R.nuevos=nuevos.length;
  var tk=nuevos.map(function(c){ return Number(c.contractValue); }).filter(function(v){ return v>0; });
  R.ticket=_mensProm(tk); R.ticketN=tk.length;
  // Lo cobrado: los pagos con `pagadoAt` en el mes, y el LTV cobrado de los que
  // entraron ese mes (todo lo que pagaron hasta hoy). Las cuotas mensuales y las
  // renovaciones suman solo si se cargan como pagos (Angie, 04/11/2026).
  var pagado=function(c){ return (c.pagos||[]).filter(function(p){ return p && p.pagadoAt; }); };
  R.cobrado=todos.reduce(function(s,c){ return s+pagado(c).filter(function(p){ return _mensEn(_mensFecha(p.pagadoAt), M); })
    .reduce(function(t,p){ return t+(Number(p.monto)||0); },0); },0);
  R.ltv=_mensProm(nuevos.map(function(c){ return pagado(c).reduce(function(t,p){ return t+(Number(p.monto)||0); },0); }));
  var bajas=todos.filter(function(c){ return c.archived && _mensEn(_mensFecha(c.archivedAt), M); });
  var alInicio=todos.filter(function(c){
    var a=_mensFecha(c.altaAt), b=c.archived?_mensFecha(c.archivedAt):null;
    return a!=null && a<M.desde && (b==null || b>=M.desde);
  });
  R.bajas=bajas; R.alInicio=alInicio.length;
  R.tasaBaja=alInicio.length?bajas.length/alInicio.length:null;
  R.diasBaja=_mensProm(bajas.map(function(c){ var a=_mensFecha(c.altaAt), b=_mensFecha(c.archivedAt); return (a!=null&&b!=null)?_mensDias(a,b):null; }).filter(function(x){ return x!=null&&x>=0; }));
  // Tiempos por paso: los que terminaron ese paso en el mes. Un paso tildado el
  // mismo dia que el anterior no es un tiempo, es una carga en lote: no cuenta.
  var hecha=function(c, nombres){
    var rh=c.rutaHechas||{};
    for(var i=0;i<nombres.length;i++){ var t=_mensFecha(rh[nombres[i]]); if(t!=null) return t; }
    return null;
  };
  R.pasos=MENS_PASOS.map(function(p){
    var v=[];
    todos.forEach(function(c){
      var a=p[1]?hecha(c,p[1]):_mensFecha(c.altaAt), b=hecha(c,p[2]);
      if(a!=null && b!=null && _mensEn(b,M)){ var d=_mensDias(a,b); if(d>0) v.push(d); }
    });
    return {nombre:p[0], prom:_mensProm(v), n:v.length};
  });
  var lanz=todos.map(function(c){ var a=_mensFecha(c.altaAt), b=hecha(c,['Lanzamiento']); return (a!=null&&b!=null&&_mensEn(b,M))?_mensDias(a,b):null; })
    .filter(function(x){ return x!=null&&x>0; });
  R.lanzados=lanz.length; R.diasLanz=_mensProm(lanz);
  // Embudo de campañas, por cliente.
  var F={reg:[],agenda:[],vivo:[],pres:[],compro:[]}, tot={reg:0,agenda:0,vivo:0,pres:0,compro:0};
  var gastoTot=0, pendiente=0, sinTasa=[], conPres=0, conCamp=0;
  activos.forEach(function(c){
    var ops=((c.ghl&&c.ghl.opportunities)||[]).filter(function(o){ return _mensEn(new Date(o.createdAt||o.dateAdded||0).getTime(), M) && !_mensEsPrueba(o); });
    var rg=_mensReglas(c); if(rg.pres.length) conPres++;
    var n={reg:ops.length,agenda:0,vivo:0,pres:0,compro:0};
    ops.forEach(function(o){ var k=mensClasificar(o,rg); if(k.agenda)n.agenda++; if(k.vivo)n.vivo++; if(k.pres)n.pres++; if(k.compro)n.compro++; });
    var g=mensGasto(c,M), usd=null;
    if(g && g.spend!=null){
      var mon=c.metaCurrency||'';
      if(mon && mon!=='USD' && !(typeof fxActiva==='function' && fxActiva(c))){ if(g.spend>0) sinTasa.push(c.name); }
      else usd=(typeof aUsd==='function')?Number(aUsd(c,g.spend)):g.spend;
    } else if(!g) pendiente++;
    if(usd) gastoTot+=usd;
    // Con campaña activa = gastó en Meta ese mes, tenga o no tasa cargada.
    var act=!!(g && g.spend>0); if(act) conCamp++;
    Object.keys(F).forEach(function(k){ tot[k]+=n[k]; if(n[k]>0) F[k].push({c:c, n:n[k], usd:usd, act:act}); });
  });
  R.gasto=gastoTot; R.pendiente=pendiente; R.sinTasa=sinTasa; R.conPres=conPres; R.conCamp=conCamp;
  R.f={};
  Object.keys(F).forEach(function(k){
    var cl=F[k], costos=cl.filter(function(x){ return x.usd; }).map(function(x){ return x.usd/x.n; });
    var deAct=cl.filter(function(x){ return x.act; }).length;
    R.f[k]={clientes:cl.length, total:tot[k], costo:_mensProm(costos), pct:conCamp?deAct/conCamp:null, deAct:deAct};
  });
  var conCierre=F.compro.filter(function(x){ return x.usd; });
  R.cac=conCierre.length?conCierre.reduce(function(s,x){return s+x.usd;},0)/conCierre.reduce(function(s,x){return s+x.n;},0):null;
  R.cierres=F.compro.map(function(x){ return x.c.name; });
  return R;
}

function _mensUsd(v){ return v==null?'—':'USD '+(v>=100?Math.round(v).toLocaleString('es-AR'):v.toLocaleString('es-AR',{maximumFractionDigits:1})); }
function _mensDiasTxt(v){ return v==null?'—':(Math.round(v)+' días'); }
function _mensPct(v){ return v==null?'—':Math.round(v*100)+' %'; }
// El cambio entre los dos meses. `bajaEsBueno` para costos, tiempos y abandono.
function _mensCambio(a, b, bajaEsBueno){
  if(a==null || b==null || !isFinite(a) || !isFinite(b)) return '';
  if(a===0 && b===0) return '<span style="color:var(--text3)">igual</span>';
  if(a===0) return '<span style="color:var(--text3)">nuevo</span>';
  var p=(b-a)/a, txt=(p>0?'+':'')+Math.round(p*100)+' %';
  if(Math.abs(p)<0.05) return '<span style="color:var(--text3)">igual</span>';
  var bueno=bajaEsBueno?p<0:p>0;
  return '<span style="color:'+(bueno?'var(--accent)':'#FF8A4C')+'">'+txt+'</span>';
}

function dashMensualHtml(activos){
  var base=(DB.clients||[]).filter(function(c){ return !esAgencia(c) && !esProspecto(c) && _mensCliente(c); });
  if(typeof soloCartera==='function' && soloCartera() && typeof esDeMiCartera==='function') base=base.filter(esDeMiCartera);
  if(S._dashIds){
    // Con filtro de producto o responsable, los archivados se filtran igual.
    var fP=S.dashProd||'', fR=S.dashResp||'';
    base=base.filter(function(c){
      if(fP){ var p=_p360Prod(c); if(fP==='__sin'?p:p!==fP) return false; }
      if(fR){ var r=String(responsableDe(c)||''); var m=(typeof _respMail==='function')?String(_respMail(r)||r):r;
        if(fR==='__sin'?r:m.toLowerCase()!==fR.toLowerCase()) return false; }
      return true;
    });
  }
  // Las campañas se miran sobre todos, archivados incluidos: el que se fue en octubre fue cliente en octubre.
  var MS=mensMeses(), A=mensCalcular(MS[0], base, base), B=mensCalcular(MS[1], base, base), C=mensCalcular(MS[2], base, base);
  var hoyD=new Date().getDate();
  // Cada fila: los dos meses cerrados, el cambio entre ellos y el mes en curso.
  var fila=function(nombre, va, vb, cambio, nota, vc){
    return '<tr><td>'+nombre+(nota?'<div class="ks">'+nota+'</div>':'')+'</td><td class="v">'+va+'</td><td class="v">'+vb+'</td><td class="v">'+(cambio||'')+'</td><td class="v cur">'+(vc==null?'—':vc)+'</td></tr>';
  };
  var sec=function(t){ return '<tr class="sec"><td colspan="5">'+t+'</td></tr>'; };
  // El porcentaje es sobre los clientes con campaña activa ese mes (Angie, 04/11/2026).
  var pctTxt=function(f,R){ return f.pct==null?String(f.clientes):'<span title="'+f.deAct+' de '+R.conCamp+' con campaña activa">'+_mensPct(f.pct)+'</span>'; };
  var cnt=function(k, nombre, costoNombre){
    var a=A.f[k], b=B.f[k];
    var c=C.f[k];
    return fila('Clientes con '+nombre, pctTxt(a,A), pctTxt(b,B), _mensCambio(a.pct,b.pct),
        'de los clientes con campaña activa: '+a.deAct+' de '+A.conCamp+' y '+b.deAct+' de '+B.conCamp+' · '+a.total+' y '+b.total+' en total', pctTxt(c,C))
      +fila(costoNombre, _mensUsd(a.costo), _mensUsd(b.costo), _mensCambio(a.costo,b.costo,true), 'promedio de lo que le cuesta a cada cliente', _mensUsd(c.costo));
  };
  var bajasTxt=function(R){ return R.bajas.length?esc(R.bajas.map(function(c){ return c.name; }).join(', ')):''; };
  var rows=sec('Clientes')
    +fila('Clientes nuevos', A.nuevos, B.nuevos, _mensCambio(A.nuevos,B.nuevos), '', C.nuevos)
    +fila('Ticket promedio', _mensUsd(A.ticket), _mensUsd(B.ticket), _mensCambio(A.ticket,B.ticket), 'lo que le vendimos, de los que tienen el contrato cargado ('+A.ticketN+' y '+B.ticketN+')', _mensUsd(C.ticket))
    +fila('LTV cobrado', _mensUsd(A.ltv), _mensUsd(B.ltv), _mensCambio(A.ltv,B.ltv), 'lo que pagó hasta hoy cada cliente que entró ese mes', _mensUsd(C.ltv))
    +fila('Cobrado en el mes', _mensUsd(A.cobrado), _mensUsd(B.cobrado), _mensCambio(A.cobrado,B.cobrado), 'pagos cargados como cobrados ese mes; las cuotas y renovaciones suman si se cargan como pagos', _mensUsd(C.cobrado))
    +fila('Clientes que abandonaron', A.bajas.length, B.bajas.length, '', [bajasTxt(A),bajasTxt(B),bajasTxt(C)].filter(Boolean).join(' · '), C.bajas.length)
    +fila('Tasa de abandono', _mensPct(A.tasaBaja), _mensPct(B.tasaBaja), _mensCambio(A.tasaBaja,B.tasaBaja,true), 'sobre los activos al empezar el mes ('+A.alInicio+' y '+B.alInicio+')', _mensPct(C.tasaBaja))
    +fila('Días hasta abandonar', _mensDiasTxt(A.diasBaja), _mensDiasTxt(B.diasBaja), '', 'del alta al archivo', _mensDiasTxt(C.diasBaja))
    +fila('Clientes que renovaron', '—', '—', '', 'la app todavía no guarda las renovaciones')
    +sec('Tiempo en cada etapa')
    +A.pasos.map(function(p,i){ var q=B.pasos[i], r=C.pasos[i];
        return fila(p.nombre, _mensDiasTxt(p.prom), _mensDiasTxt(q.prom), _mensCambio(p.prom,q.prom,true), 'de los que terminaron el paso ese mes ('+p.n+' y '+q.n+')', _mensDiasTxt(r.prom)); }).join('')
    +fila('Del alta al lanzamiento', _mensDiasTxt(A.diasLanz), _mensDiasTxt(B.diasLanz), _mensCambio(A.diasLanz,B.diasLanz,true), A.lanzados+' y '+B.lanzados+' clientes lanzados', _mensDiasTxt(C.diasLanz))
    +sec('Campañas')
    +fila('Inversión en pauta', _mensUsd(A.gasto), _mensUsd(B.gasto), _mensCambio(A.gasto,B.gasto),
        'toda la cuenta de Meta de cada cliente'+((A.pendiente||B.pendiente||C.pendiente)?' · <span style="color:#FF8A4C">trayendo de Meta…</span>':'')
        +((A.sinTasa.length||B.sinTasa.length)?' · <span style="color:#FF8A4C">'+esc(A.sinTasa.concat(B.sinTasa,C.sinTasa).filter(function(x,i,l){ return l.indexOf(x)===i; }).join(', '))+': sin tasa cargada, no suman</span>':''), _mensUsd(C.gasto))
    +fila('Clientes con campaña activa', A.conCamp, B.conCamp, _mensCambio(A.conCamp,B.conCamp), 'gastaron en Meta ese mes', C.conCamp)
    +fila('Registros', A.f.reg.total, B.f.reg.total, _mensCambio(A.f.reg.total,B.f.reg.total), '', C.f.reg.total)
    +cnt('reg','registros','Costo por registro')
    +cnt('agenda','agendas','Costo por agenda')
    +cnt('vivo','llamadas en vivo','Costo por llamada en vivo')
    +(A.conPres||B.conPres||C.conPres ? cnt('pres','presentaciones','Costo por presentación')
        : fila('Clientes con presentaciones','—','—','','ningún cliente tiene la etapa de presentación marcada en sus reglas de GHL'))
    +fila('Clientes con cierre', pctTxt(A.f.compro,A), pctTxt(B.f.compro,B), _mensCambio(A.f.compro.pct,B.f.compro.pct),
        [A,B,C].map(function(R){ return R.cierres.length?R.M.nombre+': '+esc(R.cierres.join(', ')):''; }).filter(Boolean).join(' · '), pctTxt(C.f.compro,C))
    +fila('CAC', _mensUsd(A.cac), _mensUsd(B.cac), _mensCambio(A.cac,B.cac,true), 'inversión de los clientes con cierre dividida por sus cierres', _mensUsd(C.cac));
  return '<div class="card mens" style="display:flex;flex-direction:column;gap:16px;padding:24px 28px">'
    +'<style>.mens table{width:100%;border-collapse:collapse}.mens td{padding:10px 12px;border-top:1px solid #1E222B;vertical-align:top}'
      +'.mens td.v{text-align:right;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}'
      +'.mens th{text-align:right;padding:0 12px 8px;font-weight:500}.mens th:first-child{text-align:left}'
      +'.mens tr.sec td{border-top:none;padding:18px 12px 6px;font-size:10.5px;font-weight:500;letter-spacing:.08em;color:var(--text3);text-transform:uppercase}'
      +'.mens .ks{margin-top:2px}.mens td.cur,.mens th.cur{color:var(--text3);border-left:1px solid #1E222B}</style>'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">'
      +'<div><div class="lbl">Servicio completo · mes contra mes</div><div class="h" style="margin-top:6px">'+MS[1].nombre+' contra '+MS[0].nombre+', y cómo va '+MS[2].nombre.toLowerCase()+'</div></div>'
      +'<div class="ks">Cada registro cuenta en el mes en que entró, con lo que le pasó después</div></div>'
    +'<table><thead><tr><th></th><th class="lbl">'+MS[0].nombre+'</th><th class="lbl">'+MS[1].nombre+'</th><th class="lbl">Cambio</th><th class="lbl cur">'+MS[2].nombre+' · al día '+hoyD+'</th></tr></thead><tbody>'
    +rows+'</tbody></table></div>';
}
