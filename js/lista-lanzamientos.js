/* ── Panel 360 · vista «Lista» (Angie y Ashtyn, 10/11/2026) ──────────────
   La planilla de lanzamientos de Ashtyn, adentro de la app: un renglón por
   cliente, una columna por cosa que hace falta para lanzar, y arriba cuántos
   hay en cada etapa del tablero. Se elige desde la isla del pie, al lado de
   «Por cliente», «Reparto» y «Datos que faltan».

   Cada celda se guarda en el cliente, en `c.lanz[clave]`. Va en la columna
   `datos` (no está en CLAVES_MAQUINA), así que no pide migración.

   «Listo para lanzar» no se tilda: se calcula con la regla que Ashtyn contó
   en la llamada del 09/11 —según el tipo de embudo, qué tiene que estar— y
   dice qué falta cuando no lo está. */

var LANZ_ESTADOS=['Sí','No','En proceso','Parcial','Esperando confirmación','Falta verificar negocio','No aplica'];
var LANZ_EMBUDOS=['WhatsApp','Agenda','Formulario / tarjetas','Formulario','Meta forms','Llamada directa'];
var LANZ_COLS=[
  {k:'accesosMeta',  l:'Accesos Meta'},
  {k:'invitadoCrm',  l:'Invitado al CRM'},
  {k:'dataset',      l:'Dataset listo', auto:true},
  {k:'linkDataset',  l:'Link dataset', texto:true, ph:'https://claude.ai/artifact/…', auto:true},
  {k:'embudo',       l:'Tipo de embudo', ops:LANZ_EMBUDOS},
  {k:'pago',         l:'Método de pago'},
  {k:'waMeta',       l:'WhatsApp Meta'},
  {k:'waComprar',    l:'Quiere comprar WhatsApp'},
  {k:'waCrm',        l:'WhatsApp con CRM'},
  {k:'dominio',      l:'Dominio'},
  {k:'landing',      l:'Landing'},
  {k:'estaticos',    l:'Estáticos'},
  {k:'videos',       l:'Videos'},
  {k:'linkVideos',   l:'Link videos', texto:true, ph:'https://…'},
  {k:'garantia',     l:'Garantía del contrato', texto:true, ph:'Ej.: lanzar en 30 días'}
];

/* El dataset se completa solo (Ashtyn, Loom del 10/11): si el cliente ya
   tiene el dataset de oferta subido en Documentos (`c.oferta.url`), «Dataset
   listo» dice «Sí» y «Link dataset» trae ese link. Lo cargado a mano vale
   solo mientras no haya uno subido. */
function _lzOfertaUrl(c){
  var u=c&&c.oferta&&c.oferta.url;
  return (typeof u==='string' && /^https:\/\//i.test(u))?u:'';
}
function _lzAuto(c, k){
  var u=_lzOfertaUrl(c);
  if(!u) return '';
  if(k==='dataset') return 'Sí';
  if(k==='linkDataset') return u;
  return '';
}
function _lzV(c, k){ return _lzAuto(c,k) || (c.lanz&&c.lanz[k]) || ''; }

/* Ya lanzó (Ashtyn, Loom del 10/11: la lista es para los que todavía no
   lanzamos): está en una columna del tablero posterior a «Lanzamiento», o
   tiene campañas prendidas en Meta. */
function _lzYaLanzo(d, cols){
  var iL=-1;
  (cols||[]).forEach(function(x,i){ if(iL<0 && /lanzamiento/i.test(String(x.l||''))) iL=i; });
  if(iL>=0 && d.et){
    for(var i=iL+1;i<cols.length;i++){ if(cols[i].l===d.et.l) return true; }
  }
  try{ if(typeof _yaLanzo==='function' && _yaLanzo(d.c)) return true; }catch(e){}
  return false;
}
function _lzSi(v){ return v==='Sí'; }
function _lzOkONa(v){ return v==='Sí'||v==='No aplica'; }

/* Qué le falta para lanzar. Vacío = listo. Sin tipo de embudo no se puede
   saber qué pide, y eso es lo primero que falta. */
function lanzFaltan(c){
  var f=[], v=function(k){ return _lzV(c,k); };
  if(!_lzSi(v('accesosMeta'))) f.push('accesos de Meta');
  if(!_lzSi(v('invitadoCrm'))) f.push('invitado al CRM');
  if(!_lzSi(v('dataset')))     f.push('dataset');
  if(!_lzSi(v('pago')))        f.push('método de pago');
  var emb=v('embudo');
  if(!emb){ f.push('tipo de embudo'); return f; }
  if(/whatsapp/i.test(emb)){
    if(!_lzSi(v('waMeta')) && !_lzSi(v('waCrm'))) f.push('WhatsApp conectado');
  } else if(/formulario|agenda/i.test(emb)){
    if(!_lzOkONa(v('dominio'))) f.push('dominio');
    if(!_lzOkONa(v('landing'))) f.push('landing');
  }
  if(!_lzSi(v('estaticos')) && !_lzSi(v('videos'))) f.push('estáticos o videos');
  return f;
}

function _lzColor(v){
  if(!v) return '';
  if(v==='Sí') return 'lz-si';
  if(v==='No'||v==='No aplica'||v==='Falta verificar negocio') return 'lz-no';
  if(v==='Parcial') return 'lz-med';
  return 'lz-proc';
}

function lanzGuardar(clientId, k, v){
  var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(clientId); });
  if(!c) return;
  c.lanz=Object.assign({}, c.lanz||{});
  v=String(v||'').trim();
  if(v) c.lanz[k]=v; else delete c.lanz[k];
  c.lanz._at=new Date().toISOString();
  try{ save(); }catch(e){}
  try{ showTickets(); }catch(e){}
}

function _lzCelda(c, col){
  var v=_lzV(c, col.k), id=String(c.id).replace(/'/g,'');
  if(col.auto && _lzAuto(c, col.k)){
    if(col.texto) return '<td class="lz-tx"><a href="'+esc(v)+'" target="_blank" rel="noopener" title="Dataset subido en Documentos">Abrir dataset ↗</a></td>';
    return '<td><span class="lz-sel lz-si lz-auto" title="Se completa solo: el dataset está subido en Documentos">Sí</span></td>';
  }
  if(col.texto){
    var esLink=/^https?:\/\//i.test(v);
    return '<td class="lz-tx">'
      +'<input type="text" value="'+esc(v)+'" placeholder="'+esc(col.ph||'')+'" '
      +'onchange="lanzGuardar(\''+id+'\',\''+col.k+'\',this.value)">'
      +(esLink?'<a href="'+esc(v)+'" target="_blank" rel="noopener" title="Abrir">↗</a>':'')
      +'</td>';
  }
  var ops=col.ops||LANZ_ESTADOS;
  return '<td><select class="lz-sel '+(col.ops?(v?'lz-proc':''):_lzColor(v))+'" '
    +'onchange="lanzGuardar(\''+id+'\',\''+col.k+'\',this.value)">'
    +'<option value=""></option>'
    +ops.map(function(o){ return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>'; }).join('')
    +((v&&ops.indexOf(v)<0)?'<option selected>'+esc(v)+'</option>':'')
    +'</select></td>';
}

/* `ver` y `cols` vienen ya armados por p360Html: mismos filtros de producto y
   de búsqueda que el tablero, mismas columnas. */
function p360ListaHtml(ver, cols){
  var activos=(ver||[]).filter(function(d){ return !esProspecto(d.c); });
  var filas=activos.filter(function(d){ return !_lzYaLanzo(d, cols); });
  var orden={}; (cols||[]).forEach(function(x,i){ orden[x.l]=i; });
  filas.sort(function(a,b){
    var ia=(a.et&&orden[a.et.l]!=null)?orden[a.et.l]:99, ib=(b.et&&orden[b.et.l]!=null)?orden[b.et.l]:99;
    return ia-ib || String(a.c.name||'').localeCompare(String(b.c.name||''));
  });
  var listos=0;
  filas.forEach(function(d){ d._lzf=lanzFaltan(d.c); if(!d._lzf.length) listos++; });

  // Los totales: cuántos hay en cada columna del tablero, y cuántos ya tienen
  // todo para lanzar. Es la vista «macro» que la planilla no daba.
  var tot='<div class="lz-tot">'
    +'<div><b>'+activos.length+'</b><span>Activos</span></div>'
    +'<div><b>'+filas.length+'</b><span>Por lanzar</span></div>'
    +(cols||[]).map(function(x){
      var n=x.cards.filter(function(d){ return !esProspecto(d.c); }).length;
      return '<div><b>'+n+'</b><span>'+esc(x.l)+'</span></div>';
    }).join('')
    +'<div class="lz-ok"><b>'+listos+'</b><span>Listos para lanzar</span></div>'
    +'</div>';

  if(!filas.length) return tot+'<div style="font-size:11.5px;color:var(--text3);margin-top:10px">Ningún cliente por lanzar con este filtro.</div>';

  return tot
    +'<div class="p3scroll"><table class="lz-tab"><thead><tr>'
      +'<th class="lz-fijo">Cliente</th><th>Etapa</th><th>Para lanzar</th>'
      +LANZ_COLS.map(function(x){ return '<th>'+esc(x.l)+'</th>'; }).join('')
    +'</tr></thead><tbody>'
    +filas.map(function(d){
      var c=d.c, f=d._lzf;
      return '<tr>'
        +'<td class="lz-fijo"><a href="javascript:void(0)" onclick="p360Abrir('+JSON.stringify(c.id).replace(/"/g,'&quot;')+')">'+esc(c.name||'')+'</a></td>'
        +'<td class="lz-et">'+esc((d.et&&d.et.l)||'—')+'</td>'
        +'<td class="lz-falta">'+(f.length
            ?'<span title="'+esc('Falta: '+f.join(', '))+'">Falta: '+esc(f.join(', '))+'</span>'
            :'<span class="lz-listo">Listo</span>')+'</td>'
        +LANZ_COLS.map(function(col){ return _lzCelda(c, col); }).join('')
      +'</tr>';
    }).join('')
    +'</tbody></table></div>';
}
