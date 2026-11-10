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
  // «Sí» solo con el dataset terminado: una estrategia a medias (estado
  // «curso», como la de Juan Argüello el 10/11) tiene link y no está lista.
  if(k==='dataset') return (c.oferta.estado==='completa')?'Sí':'';
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
      +'<th class="lz-fijo">Cliente</th><th>Etapa</th><th>Para lanzar</th><th>OK de lanzamiento</th>'
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
        +_lzOkCelda(c)
        +LANZ_COLS.map(function(col){ return _lzCelda(c, col); }).join('')
      +'</tr>';
    }).join('')
    +'</tbody></table></div>';
}

/* ── El OK de lanzamiento (Angie y Ashtyn, llamada del 09/11/2026) ─────────
   Antes iba suelto por WhatsApp. Ahora se pide desde la vista Lista: Ashtyn
   carga el Loom (que muestra, en este orden, la campaña, los creativos, el
   objetivo y el destino, la landing o el primer mensaje, el filtro de API en
   GHL y la prueba del embudo al 100 %) y los links. Queda como tarea en
   «Esperando aprobación» a nombre de Angie, y a Angie le llega el paquete
   ordenado por WhatsApp. Aprobar es pasar la tarea a «Revisada»: a quien la
   pidió le llega la luz verde, como con cualquier tarea. */
var LZ_OK_CHECK=['La configuración de la campaña','Los creativos','El objetivo y a dónde va la campaña',
  'La landing o el primer mensaje de WhatsApp','El filtro de API en GHL','La prueba del embudo completo, al 100 %'];

function _lzOkTarea(c){
  var ts=(c&&c.tasks||[]).filter(function(t){ return t && t.lanzOk && !t.deleted; });
  return ts.length?ts[ts.length-1]:null;
}
function _lzOkCelda(c){
  var t=_lzOkTarea(c), id=String(c.id).replace(/'/g,'');
  var boton=function(txt){ return '<button class="btn btn-sm" style="font-size:10.5px;padding:2px 8px" '
    +'onclick="lzOkModal(\''+id+'\')">'+txt+'</button>'; };
  if(!t) return '<td>'+boton('Pedir OK')+'</td>';
  var abrir='onclick="ticketEditarModal('+c.id+','+t.id+')" style="cursor:pointer"';
  if(t.done||t.estado==='revisada'||t.estado==='finalizada')
    return '<td><span class="lz-listo" '+abrir+' title="Tocalo para ver la tarea">Aprobado ✓</span></td>';
  if(t.estado==='revision')
    return '<td><span class="lz-sel lz-med lz-auto" '+abrir+' title="Tocalo para ver el pedido y aprobarlo">Esperando OK</span></td>';
  return '<td><span class="lz-sel lz-no lz-auto" '+abrir+' title="Angie pidió cambios: tocalo para verlos">Cambios pedidos</span> '+boton('Volver a pedir')+'</td>';
}

/* Campaña, creativos y landing se completan solos (Angie, 10/11): salen de lo
   que el tracker ya trajo de Meta. La campaña es la última creada en la cuenta
   del cliente; los creativos, sus anuncios en el Administrador; la landing, el
   destino más repetido de esos anuncios (o la landing publicada). Quedan
   editables: si Meta no se sincronizó desde que se armó la campaña, se corrige
   a mano. */
function _lzOkSugeridos(c){
  var out={campana:'', creativos:'', landing:'', nota:''};
  var cs=[];
  (c.conversionLines||[]).forEach(function(l){ (l&&l.metaCampaigns||[]).forEach(function(cp){ if(cp&&cp.id) cs.push(cp); }); });
  var acc=String(c.metaAccountId||'').replace(/^act_/,'');
  if(cs.length && acc){
    cs.sort(function(a,b){ return String(b.createdTime||'').localeCompare(String(a.createdTime||'')); });
    var cp=cs[0], base='https://adsmanager.facebook.com/adsmanager/manage/';
    out.campana=base+'campaigns?act='+acc+'&selected_campaign_ids='+cp.id;
    var ads=[]; (cp.adsets||[]).forEach(function(as){ (as.ads||[]).forEach(function(ad){ if(ad) ads.push(ad); }); });
    if(ads.length) out.creativos=base+'ads?act='+acc+'&selected_campaign_ids='+cp.id;
    var cuenta={}, wa=0;
    ads.forEach(function(ad){ var u=String(ad.destLink||'').trim();
      if(/whatsapp\.com|wa\.me/i.test(u)){ wa++; return; }
      if(/^https?:\/\//i.test(u) && !/fb\.me\//i.test(u)) cuenta[u]=(cuenta[u]||0)+1; });
    var top=Object.keys(cuenta).sort(function(a,b){ return cuenta[b]-cuenta[a]; })[0];
    if(top) out.landing=top;
    else if(wa) out.wa=true;
    var f=String(cp.createdTime||'').slice(0,10).split('-').reverse().slice(0,2).join('/');
    out.nota='Desde Meta: «'+(cp.name||'campaña')+'»'+(f?(', creada el '+f):'')+', '+ads.length+' anuncio'+(ads.length===1?'':'s')+(out.wa?'; los anuncios van a WhatsApp, así que falta pegar el primer mensaje':'')+'.';
  }
  if(!out.landing){ var l=c.landing||{}, ab=c.ab||{};
    out.landing=String(l.publicadaUrl||ab.landingUrl||'').trim(); }
  return out;
}

function lzOkModal(clientId){
  var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(clientId); });
  if(!c) return;
  var ds=_lzOfertaUrl(c)||_lzV(c,'linkDataset');
  var f=lanzFaltan(c);
  var sg=_lzOkSugeridos(c);
  var campo=function(id, lab, ph, val){
    return '<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">'+lab+'</div>'
      +'<input id="'+id+'" type="text" value="'+esc(val||'')+'" placeholder="'+esc(ph)+'" '
      +'style="width:100%;padding:8px 11px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--bg3);color:var(--text);font-size:12.5px"></div>';
  };
  document.getElementById('modal-root').innerHTML=''
    +'<div class="modal-overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="max-width:620px;width:92%">'
    +'<div style="font-size:15px;font-weight:600;color:var(--strong);margin-bottom:4px">Pedir el OK de lanzamiento · '+esc(c.name||'')+'</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:14px;line-height:1.55">Queda como tarea esperando la aprobación de Angie, y a ella le llega todo ordenado por WhatsApp.</div>'
    +(f.length?('<div style="font-size:11.5px;color:var(--amberx);margin-bottom:12px">En la lista todavía falta: '+esc(f.join(', '))+'.</div>'):'')
    +'<div style="display:flex;flex-direction:column;gap:10px">'
      +campo('lzok-loom','Loom (obligatorio)','https://www.loom.com/share/…','')
      +'<div style="font-size:11.5px;color:var(--text2);line-height:1.5">El Loom muestra, en este orden:</div>'
      +'<div style="display:flex;flex-direction:column;gap:4px;margin-top:-4px">'
        +LZ_OK_CHECK.map(function(x,i){ return '<label style="font-size:12.5px;color:var(--text);display:flex;gap:8px;align-items:center">'
          +'<input type="checkbox" class="lzok-ck" data-i="'+i+'"> '+(i+1)+'. '+esc(x)+'</label>'; }).join('')
      +'</div>'
      +(sg.nota?('<div style="font-size:11.5px;color:var(--text3);line-height:1.5">Campaña, creativos y landing se completaron solos. '+esc(sg.nota)+' Si no es la que vas a lanzar, cambiá el link.</div>'):'<div style="font-size:11.5px;color:var(--amberx);line-height:1.5">No encontré campañas de Meta de este cliente en el tracker: pegá los links a mano.</div>')
      +campo('lzok-campana','Campaña en Meta','Link a la campaña o al conjunto',sg.campana)
      +campo('lzok-creativos','Creativos','Link a las piezas (Drive, artifact…)',sg.creativos)
      +campo('lzok-landing','Landing o primer mensaje',sg.wa?'Pegá el primer mensaje de WhatsApp':'Link a la landing, o el texto del primer mensaje',sg.landing)
      +campo('lzok-dataset','Dataset','https://claude.ai/artifact/…', ds)
    +'</div>'
    +'<div id="lzok-err" style="font-size:11.5px;color:var(--redx);margin-top:10px"></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
      +'<button class="btn btn-sm" onclick="closeModal()">Cancelar</button>'
      +'<button class="btn btn-sm btn-primary" onclick="lzOkPedir(\''+String(c.id).replace(/'/g,'')+'\')">Pedir el OK</button>'
    +'</div></div></div>';
}

function lzOkPedir(clientId){
  var c=(DB.clients||[]).find(function(x){ return String(x.id)===String(clientId); });
  if(!c) return;
  var v=function(id){ return String((document.getElementById(id)||{}).value||'').trim(); };
  var err=function(t){ var e=document.getElementById('lzok-err'); if(e) e.textContent=t; };
  var loom=v('lzok-loom');
  if(!/^https?:\/\/(www\.)?loom\.com\//i.test(loom)) return err('Falta el link del Loom (loom.com).');
  var cks=[].slice.call(document.querySelectorAll('.lzok-ck'));
  var sin=cks.filter(function(x){ return !x.checked; }).map(function(x){ return Number(x.getAttribute('data-i'))+1; });
  if(sin.length) return err('El Loom tiene que mostrar todo: falta tildar '+sin.join(', ')+'.');
  var ok={loom:loom, campana:v('lzok-campana'), creativos:v('lzok-creativos'), landing:v('lzok-landing'),
          dataset:v('lzok-dataset'), at:new Date().toISOString(), por:(typeof SB!=='undefined'&&SB.email)||''};
  var adj=[['Loom',ok.loom],['Campaña',ok.campana],['Creativos',ok.creativos],['Landing o primer mensaje',ok.landing],['Dataset',ok.dataset]]
    .filter(function(x){ return /^https?:\/\//i.test(x[1]); }).map(function(x){ return {url:x[1], label:x[0]}; });
  var aprob=(typeof _respMail==='function')?_respMail('Angie'):'Angie';
  var t={id:Date.now()+Math.floor(Math.random()*1000), text:'Aprobar el lanzamiento de '+(c.name||''),
    responsible:ok.por||'Ashy', aprobador:aprob, estado:'revision', revisionAt:ok.at, done:false,
    source:'Lanzamiento', creadoAt:ok.at, lanzOk:ok,
    ticket:(typeof nextTicketFromApp==='function')?('#'+nextTicketFromApp()):''};
  if(adj.length) t.attachments=adj;
  c.tasks=c.tasks||[]; c.tasks.push(t);
  try{ save(); }catch(e){}
  var mandado=_lzOkAvisar(c, t);
  closeModal();
  try{ showTickets(); }catch(e){}
  if(typeof toast==='function') toast(mandado?'Pedido. A Angie le llegó por WhatsApp.'
    :'Pedido: quedó la tarea, pero el WhatsApp no salió desde este navegador. Avisale a Angie.');
}

/* El paquete, en el mismo orden que el Loom. Sale por el mismo canal que los
   demás avisos de tareas (alert_msg del proxy de GHL). Se manda aunque el
   aviso de «Esperando aprobación» esté apagado en este navegador: este lo
   pidió Angie siempre. */
function _lzOkAvisar(c, t){
  try{
    var mail=t.aprobador||'', num=(typeof telDe==='function'&&mail)?telDe(mail):'';
    var proxy=(typeof getGhlProxy==='function')?getGhlProxy():{};
    if(!num || !proxy.url) return false;
    if(typeof soyYo==='function' && soyYo(mail)) return true;
    var o=t.lanzOk||{};
    var txt='OK de lanzamiento · '+(c.name||'')+'\n'
      +'1. Loom: '+o.loom+'\n'
      +(o.campana?('2. Campaña: '+o.campana+'\n'):'')
      +(o.creativos?('3. Creativos: '+o.creativos+'\n'):'')
      +(o.landing?('4. Landing o primer mensaje: '+o.landing+'\n'):'')
      +(o.dataset?('5. Dataset: '+o.dataset+'\n'):'')
      +'Lo pide '+((typeof personaNombre==='function'&&o.por)?personaNombre(o.por):'el equipo')
      +(t.ticket?(' · '+t.ticket):'')+'. Aprobalo pasando la tarea a Revisada.';
    proxyFetch(proxy.url+'?secret='+encodeURIComponent(proxy.secret)
      +'&action=alert_msg&numero='+encodeURIComponent(num)
      +'&texto='+encodeURIComponent(txt)).catch(function(){});
    t.lanzOk.avisadoAt=new Date().toISOString();
    try{ save(); }catch(e){}
    return true;
  }catch(e){ return false; }
}
