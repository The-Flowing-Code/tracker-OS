/* ── Meta Ads ─────────────────────────────────────────────────────────────
   Separado de index.html el 17/10/2026 (paso 2 del plan del 23/09: partir el
   archivo de a una parte por vez, sin reescribir nada). Es el mismo codigo,
   en el mismo orden, con las mismas funciones globales: los onclick="" del
   HTML las siguen encontrando.

   ⚠️  SE CARGA ANTES QUE EL SCRIPT PRINCIPAL. Lo que el principal ejecuta al
   arrancar (timers, listeners) usa estas funciones, asi que tienen que
   existir primero. Por lo mismo, aca no puede haber nada que al CARGAR use
   algo del principal: solo declaraciones. */
/* ══════════════════════════════════════════════════════════════════════
   CUANTO DEL LIMITE DE META LLEVAMOS USADO

   Meta lo dice en cada respuesta, en tres cabeceras, y hasta ahora se
   tiraban. No es una estimacion nuestra: es el numero de Meta.

     X-Business-Use-Case-Usage  por cuenta publicitaria. Trae call_count,
                                total_cputime y total_time como PORCENTAJE
                                del limite, y —si ya te frenaron—
                                estimated_time_to_regain_access en minutos.
     X-Ad-Account-Usage         acc_id_util_pct, el uso de la cuenta.
     X-App-Usage                lo mismo pero de la app entera.

   ⚠️  SE ENVUELVE `fetch` EN VEZ DE TOCAR LOS ONCE LUGARES QUE LLAMAN A
       META. Es el mismo criterio que ya usa este archivo con
       `localStorage.setItem` unas lineas mas abajo: cualquier pantalla que
       le pregunte algo a Meta queda contada sin modificarla, y no hay forma
       de agregar una llamada nueva y olvidarse.
       Leer cabeceras NO consume el cuerpo de la respuesta, asi que quien
       llamo recibe exactamente lo mismo que antes.

   Vive en memoria a proposito: es el estado de AHORA. Guardarlo en el
   cliente lo subiria a Supabase en cada sync para un dato que a los diez
   minutos ya no vale.
   ══════════════════════════════════════════════════════════════════════ */
var META_USO={};
var _metaUsoAvisado={};

function _metaUsoDeCabeceras(h){
  var pct=0, bloqueo=0, llamadas=null;
  var mirar=function(o){
    if(!o||typeof o!=='object') return;
    ['call_count','total_cputime','total_time','acc_id_util_pct'].forEach(function(k){
      var v=Number(o[k]); if(isFinite(v) && v>pct) pct=v;
    });
    var b=Number(o.estimated_time_to_regain_access);
    if(isFinite(b) && b>bloqueo) bloqueo=b;
  };
  var leer=function(nombre){
    var raw=null;
    try{ raw=h.get(nombre); }catch(e){}
    if(!raw) return;
    var d=null; try{ d=JSON.parse(raw); }catch(e){ return; }
    if(Array.isArray(d)) d.forEach(mirar);
    else if(d && typeof d==='object'){
      // X-Business-Use-Case-Usage viene como {"<id>":[{...}]}
      Object.keys(d).forEach(function(k){
        var v=d[k];
        if(Array.isArray(v)) v.forEach(mirar); else mirar(v);
      });
      mirar(d);
    }
  };
  leer('x-business-use-case-usage');
  leer('x-ad-account-usage');
  leer('x-app-usage');
  return {pct:pct, bloqueo:bloqueo, llamadas:llamadas};
}

function _metaUsoAnotar(url, headers){
  var u=_metaUsoDeCabeceras(headers);
  // Sin cabeceras utiles no se anota nada: mejor "no se" que un 0 inventado.
  if(!u.pct && !u.bloqueo) return;
  var m=String(url||'').match(/act_(\d+)/);
  var cuenta=m?('act_'+m[1]):'(cuenta)';
  var prev=META_USO[cuenta]||{};
  META_USO[cuenta]={ pct:u.pct, bloqueo:u.bloqueo, at:Date.now(),
                     pico:Math.max(prev.pico||0, u.pct), n:(prev.n||0)+1 };
  // Aviso una sola vez por cuenta y por tramo: al 75% queda margen para
  // terminar lo que estes haciendo; al 90% conviene frenar.
  var tramo=u.bloqueo?'bloqueo':(u.pct>=90?'90':(u.pct>=75?'75':''));
  if(tramo && _metaUsoAvisado[cuenta]!==tramo){
    _metaUsoAvisado[cuenta]=tramo;
    try{
      if(u.bloqueo) toast('Meta frenó los pedidos de esta cuenta. Vuelve en '
        +Math.ceil(u.bloqueo)+' min.','red');
      else toast('Meta: llevas '+Math.round(u.pct)+'% del limite de pedidos de esta cuenta.',
        u.pct>=90?'red':'amber');
    }catch(e){}
  }
}

// ---- Inversion de Meta por periodo (para Conversion de ventas / fuente Tiempo real) ----
// Suma SOLO las campanas incluidas (checkboxes de Ads & Guiones de la linea activa).
const _metaSpendInFlight={};
function _metaSpendKey(c,period){
  const al=getActiveLine(c.conversionLines||[]);
  const excluded=((al&&al.excludedCampaigns)||[]).slice().sort();
  var suf=period;
  if(period==='custom'){ var cr=(S.ventasCustom||{}); suf='custom|'+(cr.from||'')+'|'+(cr.to||''); }
  return {key:'v3|'+suf+'|'+excluded.join(','), excluded:excluded};
}
async function fetchMetaSpendPeriod(clientId,period){
  const c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c||!c.metaToken||!c.metaAccountId) return null;
  c._metaSpend=c._metaSpend||{};
  const sk=_metaSpendKey(c,period);
  const cached=c._metaSpend[sk.key];
  if(cached && (Date.now()-cached.at)<10*60*1000) return cached;
  const fk=clientId+':'+sk.key;
  if(_metaSpendInFlight[fk]) return cached||null;
  _metaSpendInFlight[fk]=true;
  try{
    const actId='act_'+c.metaAccountId;
    let insSpec;
    if(period==='mes'){
      const first=new Date(); first.setDate(1);
      insSpec='insights.time_range({"since":"'+isoDate(first)+'","until":"'+isoDate(new Date())+'"})';
    }else if(period==='30d'){
      insSpec='insights.date_preset(last_30d)';
    }else if(period==='custom'){
      const cr=S.ventasCustom||{};
      insSpec='insights.time_range({"since":"'+(cr.from||isoDate(new Date()))+'","until":"'+(cr.to||isoDate(new Date()))+'"})';
    }else{
      insSpec='insights.date_preset(maximum)';
    }
    insSpec+='.breakdowns(country).limit(500)';
    const fields='id,'+insSpec+'{spend,actions}';
    let url='https://graph.facebook.com/v25.0/'+actId+'/campaigns?fields='+encodeURIComponent(fields)+'&limit=200&access_token='+c.metaToken;
    let spend=0, views=0, pages=0;
    const byCamp={};
    const vByCamp={};
    const byCountry={}; // solo campanas incluidas, clave = nombre de pais
    const vByCountry={};
    const byCampCountry={}; // cruce: 'campId||pais' -> spend
    const vByCampCountry={};
    const countriesByCamp={}; // campId -> {pais:spend} para saber que paises tiene cada campana
    while(url && pages<5){
      const res=await fetch(url);
      const data=await res.json();
      if(data.error) throw new Error(data.error.message||'Meta error');
      (data.data||[]).forEach(function(camp){
        const included=sk.excluded.indexOf(camp.id)===-1;
        const rows=(camp.insights&&camp.insights.data)||[];
        rows.forEach(function(row){
          const v=parseFloat(row.spend||0);
          let lv=0;
          (row.actions||[]).forEach(function(a){ if(a.action_type==='landing_page_view') lv+=parseInt(a.value||0); });
          byCamp[String(camp.id)]=(byCamp[String(camp.id)]||0)+v;
          vByCamp[String(camp.id)]=(vByCamp[String(camp.id)]||0)+lv;
          const pais=_ISO_PAIS[String(row.country||'').toUpperCase()]||String(row.country||'');
          if(pais){
            const ck=String(camp.id)+'||'+pais;
            byCampCountry[ck]=(byCampCountry[ck]||0)+v;
            vByCampCountry[ck]=(vByCampCountry[ck]||0)+lv;
            countriesByCamp[String(camp.id)]=countriesByCamp[String(camp.id)]||{};
            countriesByCamp[String(camp.id)][pais]=(countriesByCamp[String(camp.id)][pais]||0)+v;
          }
          if(included){
            spend+=v; views+=lv;
            if(pais){ byCountry[pais]=(byCountry[pais]||0)+v; vByCountry[pais]=(vByCountry[pais]||0)+lv; }
          }
        });
      });
      url=data.paging&&data.paging.next;
      pages++;
    }
    // --- Gasto por ANUNCIO: segunda consulta a nivel /ads (Meta no lo da dentro de campaigns) ---
    // Se agrupa por nombre de anuncio normalizado, que es como la vista "Por anuncio" agrupa los leads.
    const byAd={};       // nombre normalizado de anuncio -> spend
    const byAdId={};     // adId -> spend (por si el lead trae adId directo)
    const vByAd={};      // nombre normalizado -> landing views
    try{
      let insSpecAd;
      if(period==='mes'){ const first=new Date(); first.setDate(1); insSpecAd='insights.time_range({"since":"'+isoDate(first)+'","until":"'+isoDate(new Date())+'"})'; }
      else if(period==='30d'){ insSpecAd='insights.date_preset(last_30d)'; }
      else if(period==='custom'){ const cr=S.ventasCustom||{}; insSpecAd='insights.time_range({"since":"'+(cr.from||isoDate(new Date()))+'","until":"'+(cr.to||isoDate(new Date()))+'"})'; }
      else { insSpecAd='insights.date_preset(maximum)'; }
      insSpecAd+='.limit(1)';
      const fieldsAd='id,name,campaign_id,'+insSpecAd+'{spend,actions}';
      let urlAd='https://graph.facebook.com/v25.0/'+actId+'/ads?fields='+encodeURIComponent(fieldsAd)+'&limit=300&access_token='+c.metaToken;
      let pagesAd=0;
      while(urlAd && pagesAd<8){
        const resAd=await fetch(urlAd);
        const dataAd=await resAd.json();
        if(dataAd.error) break; // si falla el nivel ads, no rompemos el resto
        (dataAd.data||[]).forEach(function(ad){
          const included=sk.excluded.indexOf(ad.campaign_id)===-1;
          if(!included) return;
          const ins=(ad.insights&&ad.insights.data&&ad.insights.data[0])||null;
          if(!ins) return;
          const v=parseFloat(ins.spend||0);
          let lv=0;
          (ins.actions||[]).forEach(function(a){ if(a.action_type==='landing_page_view') lv+=parseInt(a.value||0); });
          if(ad.id){ byAdId[String(ad.id)]=(byAdId[String(ad.id)]||0)+v; }
          const nm=_n(ad.name||'');
          if(nm){ byAd[nm]=(byAd[nm]||0)+v; vByAd[nm]=(vByAd[nm]||0)+lv; }
        });
        urlAd=dataAd.paging&&dataAd.paging.next;
        pagesAd++;
      }
    }catch(e){ /* nivel ads opcional: si falla, la vista por anuncio queda sin costo segmentado */ }

    c._metaSpend[sk.key]={spend:spend,views:views,byCampaign:byCamp,viewsByCampaign:vByCamp,byCountry:byCountry,viewsByCountry:vByCountry,byCampCountry:byCampCountry,vByCampCountry:vByCampCountry,countriesByCamp:countriesByCamp,byAd:byAd,byAdId:byAdId,vByAd:vByAd,at:Date.now()};
    save();
    return c._metaSpend[sk.key];
  }catch(e){
    c._metaSpend[sk.key]={spend:null,at:Date.now(),error:e.message};
    return c._metaSpend[sk.key];
  }finally{
    _metaSpendInFlight[fk]=false;
  }
}

// Traduce el error crudo de Meta a algo accionable. El caso mas comun no es un bug
// del tracker sino una credencial invalida: la app o el token dejaron de existir.
function _metaErrCorto(msg){
  var m=String(msg||'');
  if(/Application has been deleted/i.test(m)) return 'Meta: la app del token fue eliminada \u2014 hay que cargar un token nuevo';
  if(/Session has expired|access token/i.test(m)) return 'Meta: el token expiro \u2014 hay que renovarlo';
  if(/permission|OAuth/i.test(m)) return 'Meta: al token le faltan permisos sobre esta cuenta';
  if(/no conectado/i.test(m)) return 'Meta no conectado para este cliente';
  if(/rate limit|too many/i.test(m)) return 'Meta: limite de pedidos alcanzado, reintenta en un rato';
  return 'Meta: '+(m.length>60?m.slice(0,60)+'\u2026':m);
}

// Nombres de campana / adset / anuncio que vinieron de Meta para ese rango.
// Si hay uno solo se muestra; si hay varios, el de mayor gasto y cuantos mas hubo.
function _metaNombres(l, clave){
  var arr=(l&&l.meta&&l.meta[clave])||[];
  if(!arr.length) return null;
  var det=arr.map(function(x){return x.nombre+' \u2014 $'+x.gasto;}).join('\n');
  if(arr.length===1) return '<span title="'+esc(det)+'">'+esc(arr[0].nombre)+'</span>';
  return '<span title="'+esc(det)+'" style="border-bottom:1px dotted var(--border2);cursor:help">'
    +esc(arr[0].nombre)+' <span style="color:var(--text3)">+'+(arr.length-1)+'</span></span>';
}
function _metAd(id){ return ALARM_AD_METRICS.find(function(m){return m.id===id;})||{label:id,fmt:'num'}; }

// ---- Cual es "el resultado" de una campana ----
// Ads Manager NO muestra "el evento de conversion mas fuerte": muestra el evento
// POR EL QUE EL CONJUNTO ESTA OPTIMIZADO. Son dos cosas distintas, y esa
// diferencia es la que hacia que el tracker mostrara 11 donde Meta mostraba 48:
// la campana de cliente AL optimiza por Lead (48 leads), pero el orden fijo de
// `extractIns` agarraba primero otra conversion de 11 y se quedaba con esa.
//
// La meta de optimizacion ya la pedimos a la API (`optimization_goal` y
// `promoted_object` del conjunto), asi que esto no agrega ni una llamada.
//
// Devuelve {clave, nombre} o null. null = no sabemos cual es el objetivo, y
// entonces se usa el orden de siempre: es preferible un numero aproximado a un
// cero inventado.
var _META_EV_BALDE={
  LEAD:'leads', PURCHASE:'compras', COMPLETE_REGISTRATION:'registros',
  SCHEDULE:'agendas', CONTACT:'contactos', SUBMIT_APPLICATION:'solicitudes'
};
var _META_OPT_BALDE={
  LEAD_GENERATION:{clave:'leads',      nombre:'Clientes potenciales'},
  QUALITY_LEAD:   {clave:'leads',      nombre:'Clientes potenciales de calidad'},
  CONVERSATIONS:  {clave:'mensajes',   nombre:'Conversaciones iniciadas'},
  LINK_CLICKS:    {clave:'clics',      nombre:'Clics en el enlace'},
  LANDING_PAGE_VIEWS:{clave:'landing', nombre:'Visitas a la pagina de destino'},
  THRUPLAY:       {clave:'thruplays',  nombre:'ThruPlays'},
  IMPRESSIONS:    {clave:'impresiones',nombre:'Impresiones'},
  REACH:          {clave:'alcance',    nombre:'Alcance'}
};
function _metaObjetivoResultado(as){
  if(!as) return null;
  // `optimization_goal` es el nombre crudo de la API; `optGoal` el que queda
  // guardado despues del map. Se aceptan los dos.
  var og=String(as.optimization_goal||as.optGoal||'').toUpperCase();
  var po=as.promoted_object||null;
  // Conversiones fuera del sitio (y VALUE, que es lo mismo optimizando por importe):
  // la meta sola no alcanza, el evento concreto vive en promoted_object.
  if(og==='OFFSITE_CONVERSIONS'||og==='VALUE'){
    if(po&&po.custom_conversion_id)
      return {clave:'custom:'+po.custom_conversion_id, nombre:'Conversion personalizada'};
    if(po&&po.custom_event_type){
      var ev=String(po.custom_event_type).toUpperCase();
      // Evento que no sabemos leer: devolvemos null a proposito. Inventar un
      // balde vacio mostraria 0 y eso es peor que el numero aproximado de antes.
      return _META_EV_BALDE[ev]?{clave:_META_EV_BALDE[ev], nombre:_cfgEs(_EV_ES,ev)}:null;
    }
    // Sin evento pero con pagina: es un formulario nativo de Meta.
    if(po&&po.page_id) return {clave:'leads', nombre:'Clientes potenciales'};
    return null;
  }
  return _META_OPT_BALDE[og]||null;
}
// El objetivo de la CAMPANA sale de sus conjuntos. Si todos optimizan por lo
// mismo, ese es el resultado de la campana. Si no coinciden, Meta tampoco puede
// mostrar una sola columna limpia, asi que devolvemos null y cae al orden viejo.
function _metaObjCampana(camp){
  var ads=(camp&&camp.adsets)||[];
  var uno=null;
  for(var i=0;i<ads.length;i++){
    /* ⚠️  SE LEE `objResultado`, NO SE RECALCULA. El conjunto que llega aca ya
       paso por el map que lo guarda, y ese map NO conserva `promoted_object`
       ni `optimization_goal`: solo `optGoal` y el nombre del evento traducido.
       Recalcular sobre esa forma da siempre null, y la campana terminaba
       cayendo al orden viejo aunque el conjunto de abajo tuviera el numero
       bien. Se veia exactamente asi: el conjunto "Argentina" mostraba 48 y la
       campana de arriba 11. */
    var o=ads[i].objResultado||_metaObjetivoResultado(ads[i]);
    if(!o) return null;
    if(!uno) uno=o;
    else if(uno.clave!==o.clave) return null;
  }
  return uno;
}
// Un PUT con tags pisa la lista entera, asi que se manda completa.
async function quizMarcarMeta(clientId, leadId, btn){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  var cfg=c&&_quizCfg(c); if(!cfg) return;
  var d=_QUIZ[clientId]; var l=(d&&d.leads||[]).filter(function(x){return x.id===leadId;})[0];
  if(!l) return;
  if(btn){ btn.disabled=true; btn.textContent='...'; }
  try{
    var tags=(l.tags||[]).slice();
    if(tags.indexOf('api-califica-meta')<0) tags.push('api-califica-meta');
    var r=await fetch('https://services.leadconnectorhq.com/contacts/'+leadId,{
      method:'PUT', headers:{Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',
        'Version':'2021-07-28'}, body:JSON.stringify({tags:tags})});
    if(r.status>=400) throw new Error('HTTP '+r.status);
    l.tags=tags;
    dibujarQuiz(c);
    toast('Marcado para Meta.');
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='A Meta'; }
    toast('No se pudo marcar: '+e.message,'red');
  }
}
async function fetchMetaMensual(clientId){
  const c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c||!c.metaToken||!c.metaAccountId) return null;
  if(c._metaMensual){ delete c._metaMensual; save(); }   // limpiar el cache viejo que quedo en disco
  const al=getActiveLine(c.conversionLines||[]);
  const excl=((al&&al.excludedCampaigns)||[]).map(String);
  // v3: se sumo reach a los campos pedidos. Con la clave vieja, una respuesta
  // cacheada sin alcance dejaba la fila de frecuencia vacia hasta recargar.
  // v4: se sumo el desglose por campana y los pasos del embudo. Con la clave
  // vieja, una respuesta cacheada sin esos campos dejaba el embudo vacio.
  const cacheKey='v4|'+excl.slice().sort().join(',');
  const prev=_mmCache[clientId];
  if(prev && prev.key===cacheKey && (Date.now()-prev.at)<10*60*1000) return prev;

  const hoy=new Date();
  const desde=new Date(hoy.getFullYear(), hoy.getMonth()-11, 1);
  const tr='{"since":"'+isoDate(desde)+'","until":"'+isoDate(hoy)+'"}';
  // campaign_name: el selector del embudo tiene que mostrar nombres y no ids.
  const campos='campaign_id,campaign_name,spend,impressions,clicks,actions,reach';
  var url='https://graph.facebook.com/v25.0/act_'+c.metaAccountId+'/insights'
    +'?level=campaign&time_increment=monthly'
    +'&time_range='+encodeURIComponent(tr)
    +'&fields='+encodeURIComponent(campos)
    +'&limit=500&access_token='+c.metaToken;

  const meses={};
  // Ademas del mes a mes, el total por campana: es lo que permite mirar el
  // embudo de una campana sola sin volver a preguntarle nada a Meta.
  const porCampana={};
  var paginas=0;
  while(url && paginas<10){
    paginas++;
    const resp=await fetch(url);
    const data=await resp.json();
    if(data.error) throw new Error(data.error.message||'Meta no respondio');
    (data.data||[]).forEach(function(row){
      if(excl.indexOf(String(row.campaign_id))>=0) return;   // campanas destildadas en Ads
      // Meta manda 'YYYY-MM-DD' pelado. new Date() lo toma como UTC y, con offset
      // negativo, getMonth() devuelve el mes anterior: todos los meses quedaban
      // corridos uno hacia atras. Se parte el string a mano.
      const p=String(row.date_start||'').split('-');
      if(p.length<2) return;
      const y=parseInt(p[0],10), mes=parseInt(p[1],10)-1;
      if(isNaN(y)||isNaN(mes)) return;
      const k=y+'-'+mes;
      const m=meses[k]||(meses[k]={spend:0,impressions:0,clicks:0,leads:0,landing:0,results:0,reach:0});
      const a=_mmActions(row);
      m.spend+=parseFloat(row.spend||0)||0;
      m.impressions+=parseInt(row.impressions||0)||0;
      m.clicks+=parseInt(row.clicks||0)||0;
      // Ojo: el alcance no se suma limpio entre campanas. La misma persona puede
      // estar en dos, y Meta lo deduplica solo a nivel cuenta. Sumado queda mas
      // alto que el real, asi que la frecuencia que sale de aca es un piso.
      m.reach+=parseInt(row.reach||0)||0;
      m.leads+=a.leads; m.landing+=a.landing; m.results+=a.results;
      const cid=String(row.campaign_id||'');
      const pc=porCampana[cid]||(porCampana[cid]={nombre:row.campaign_name||cid,
        spend:0, lead:0, apply:0, schedule:0, reg:0, compra:0, eventos:{}});
      if(row.campaign_name) pc.nombre=row.campaign_name;
      pc.spend+=parseFloat(row.spend||0)||0;
      pc.lead+=a.leads; pc.apply+=a.apply; pc.schedule+=a.schedule;
      pc.reg+=a.reg; pc.compra+=a.compra;
      /* ⚠️  LOS EVENTOS CRUDOS SE GUARDAN, no se tiran. Hasta ahora esta
         funcion calculaba los cinco escalones conocidos y descartaba el
         resto, asi que una cuenta que mide con una CONVERSION PERSONALIZADA
         —que en Ads Manager aparece con el nombre que le puso el cliente—
         mostraba el embudo entero en cero y no habia forma de saber por que
         sin abrir la consola del navegador.
         Medido el 2026-09-22: cliente C tiene 31 resultados y `leads` en 0, o
         sea que sus 31 no son ninguno de los cinco.
         Con el mapa crudo, el embudo puede mostrar una fila por evento que
         EXISTA, con su nombre, en vez de cinco casilleros fijos. */
      pc.eventos=pc.eventos||{};
      (row.actions||[]).forEach(function(ac){
        var t=String(ac.action_type||''); if(!t) return;
        var v=parseInt(ac.value||0)||0; if(!v) return;
        pc.eventos[t]=(pc.eventos[t]||0)+v;
      });
    });
    url=(data.paging&&data.paging.next)||null;
  }
  _mmCache[clientId]={key:cacheKey, at:Date.now(), meses:meses, porCampana:porCampana};
  return _mmCache[clientId];
}


function openMetaConfig(clientId){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c) return;
  var modal=document.getElementById('modal-root');
  modal.innerHTML='<div class="modal-overlay"><div class="modal" style="max-width:700px">'
    +'<div class="modal-title" style="margin-bottom:16px">Conectar Meta Ads</div>'
    +'<div style="font-size:12px;color:var(--text2);margin-bottom:16px;line-height:1.6">'
    +'Necesitas un token de usuario del sistema con permiso <strong>ads_read</strong> y el ID de la cuenta publicitaria.</div>'
    +'<div style="display:flex;flex-direction:column;gap:10px">'
    +'<div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Token de acceso</div>'
    +'<input id="meta-token-input" value="'+esc(c.metaToken||'')+'" placeholder="EAATs4n8..." style="width:100%;font-size:11px;font-family:var(--mono)">'
    +'</div>'
    +'<div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px">ID de cuenta publicitaria (sin act_)</div>'
    +'<input id="meta-account-input" value="'+esc(c.metaAccountId||'')+'" placeholder="940497335594870" style="width:100%">'
    +'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">'
    +'<button class="btn btn-sm" onclick="closeModal()">Cancelar</button>'
    +'<button class="btn btn-sm btn-primary" onclick="saveMetaConfig('+clientId+')">Guardar y sincronizar</button>'
    +'</div></div></div>';
}

function saveMetaConfig(clientId){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c) return;
  var token=document.getElementById('meta-token-input').value.trim();
  var accountId=document.getElementById('meta-account-input').value.trim().replace('act_','');
  if(!token||!accountId){toast('Completa los dos campos','red');return;}
  c.metaToken=token;
  c.metaAccountId=accountId;
  save();
  closeModal();
  renderTab();
  syncMetaAds(clientId);
}

// Mismo modal que usa Conversion de ventas, pero aplicado al rango de Meta en Ads & Guiones.
// El anterior eran dos inputs sueltos que, si completabas solo uno, no hacian nada en silencio.
// ---- Selector de rango: un solo control ----
// Antes eran dos piezas que decian casi lo mismo ("Rango personalizado" al lado
// de las fechas). Ahora manda la fecha, y el modo va debajo en chico.
var META_DIAS_ES={7:'ultimos 7 dias',14:'ultimos 14 dias',30:'ultimos 30 dias',
  60:'ultimos 60 dias',90:'ultimos 90 dias',max:'maximo (36 meses)',custom:'rango personalizado'};
// Si el rango cae dentro del mismo anio, el anio se dice una sola vez.
function metaRangoTexto(al){
  var d=al&&al.metaDays;
  if(d==='custom'){
    var a=al.metaSince||'', b=al.metaUntil||'';
    if(!a||!b) return 'Elegir fechas';
    var mismoAnio=String(a).slice(0,4)===String(b).slice(0,4);
    return _fechaCorta(a,!mismoAnio)+' \u2013 '+_fechaCorta(b,true);
  }
  if(d==='max') return 'Todo el historico';
  return 'Ultimos '+(d||30)+' dias';
}
function metaModoTexto(al){
  var d=(al&&al.metaDays)||30;
  return META_DIAS_ES[d]||META_DIAS_ES[String(d)]||('ultimos '+d+' dias');
}
// El <select> real queda encima, invisible: conserva el menu nativo del sistema
// (teclado, lectores de pantalla) sin tener que reimplementarlo.
// Dias que cubre el rango, para poder comparar periodos de distinto largo.
// "1 jun - 30 jun" se cuenta solo; "15 may - 3 jul" no.
function metaRangoDias(al){
  var d=al&&al.metaDays;
  if(d==='max') return '';
  if(d!=='custom') return '';   // el preset ya dice los dias en el propio texto
  var a=String(al.metaSince||''), b=String(al.metaUntil||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)) return '';
  var t=Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000)+1;  // ambas puntas incluidas
  if(!isFinite(t)||t<1) return '';
  return t+(t===1?' dia':' dias');
}
function metaRangoControl(c, al){
  var opciones=[7,14,30,60,90,'max','custom'].map(function(v){
    var sel=(String(al.metaDays||30)===String(v))?' selected':'';
    return '<option value="'+v+'"'+sel+'>'+META_DIAS_ES[v]+'</option>';
  }).join('');
  var dias=metaRangoDias(al);
  // Con rango propio, tocar la fecha abre el calendario; el resto del control
  // abre el menu de presets. Asi no hace falta un lapiz aparte.
  var editable=(al.metaDays==='custom');
  return '<span style="position:relative;display:inline-flex;align-items:center;gap:9px;'
    +'border:0.5px solid var(--border2);border-radius:99px;padding:6px 13px">'
    +'<span'+(editable?' onclick="event.stopPropagation();openMetaRangeModal('+c.id+')" title="Editar las fechas"':'')
      +' style="position:relative;z-index:1;font-size:12.5px;color:var(--text)'+(editable?';cursor:pointer':'')+'">'
      +esc(metaRangoTexto(al))+'</span>'
    +(dias?'<span style="font-size:11px;color:var(--text3);position:relative;z-index:1">'+esc(dias)+'</span>':'')
    +'<span style="font-size:9px;color:var(--text3)">&#9660;</span>'
    +'<select id="meta-days-select" onchange="changeMetaDays('+c.id+',this.value)" '
      +'aria-label="Rango de fechas" '
      +'style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;'
      +'font-family:var(--font)">'+opciones+'</select>'
    +'</span>';
}

function openMetaRangeModal(clientId){
  const c=DB.clients.find(function(x){return x.id===clientId;}); if(!c) return;
  const al=getActiveLine(c.conversionLines||[]); if(!al) return;
  const today=isoDate(new Date());
  document.getElementById('modal-root').innerHTML=''
    +'<div class="modal-overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="max-width:610px;width:92%">'
    +'<div style="font-size:15px;font-weight:600;color:var(--strong);margin-bottom:4px">Rango personalizado</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:16px">Filtra las metricas de Meta entre dos fechas: campanas, conjuntos y anuncios. No afecta al bloque de Tiempo real, que siempre muestra los ultimos 7 dias.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">'
    +'<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">Desde</div>'
    +'<input type="date" id="mr-from" value="'+(al.metaSince||'')+'" max="'+today+'" style="width:100%;padding:8px 11px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--bg3);color:var(--text);font-size:12.5px"></div>'
    +'<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">Hasta</div>'
    +'<input type="date" id="mr-to" value="'+(al.metaUntil||today)+'" max="'+today+'" style="width:100%;padding:8px 11px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--bg3);color:var(--text);font-size:12.5px"></div>'
    +'</div>'
    +'<div id="mr-err" style="font-size:11px;color:var(--redx);margin-bottom:12px;min-height:14px"></div>'
    +'<div style="display:flex;justify-content:flex-end;gap:8px">'
    +'<button class="btn btn-sm" onclick="closeModal()">Cancelar</button>'
    +'<button class="btn btn-sm btn-primary" onclick="applyMetaRange('+clientId+')">Aplicar y sincronizar</button>'
    +'</div></div></div>';
}
function applyMetaRange(clientId){
  const c=DB.clients.find(function(x){return x.id===clientId;}); if(!c) return;
  const al=getActiveLine(c.conversionLines||[]); if(!al) return;
  const from=(document.getElementById('mr-from')||{}).value||'';
  const to=(document.getElementById('mr-to')||{}).value||'';
  const err=document.getElementById('mr-err');
  if(!from||!to){ if(err) err.textContent='Elegi ambas fechas'; return; }
  if(new Date(from)>new Date(to)){ if(err) err.textContent='La fecha "desde" no puede ser posterior a "hasta"'; return; }
  al.metaDays='custom'; al.metaSince=from; al.metaUntil=to;
  save(); closeModal(); syncMetaAds(clientId);
}

function changeMetaDays(clientId, days){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c) return;
  var activeLine=c.conversionLines&&getActiveLine(c.conversionLines);
  if(!activeLine) return;
  if(days==='custom'){
    if(!activeLine.metaSince){
      var now=new Date();
      activeLine.metaUntil=now.toISOString().slice(0,10);
      activeLine.metaSince=new Date(now-30*24*60*60*1000).toISOString().slice(0,10);
    }
    openMetaRangeModal(clientId);
    return;
  }
  activeLine.metaDays=(days==='max')?'max':parseInt(days);
  save();
  syncMetaAds(clientId);
}

function changeMetaCustomRange(clientId){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c) return;
  var activeLine=c.conversionLines&&getActiveLine(c.conversionLines);
  if(!activeLine) return;
  var since=document.getElementById('meta-since-input').value;
  var until=document.getElementById('meta-until-input').value;
  if(!since||!until) return;
  activeLine.metaSince=since;
  activeLine.metaUntil=until;
  save();
  syncMetaAds(clientId);
}

var _metaOpen={camp:null,adset:null};

function toggleMetaCamp(idx){
  _metaOpen.camp=_metaOpen.camp===idx?null:idx;
  _metaOpen.adset=null;
  renderTab();
}

function toggleMetaAdset(ci, asi){
  var key=ci+'-'+asi;
  _metaOpen.adset=_metaOpen.adset===key?null:key;
  renderTab();
}

var META_METRIC_COLS=[
  {key:'spend',     l:'Importe gastado',      w:100, fmt:function(v){return '$'+Number(v||0).toFixed(2);}, color:true, money:true},
  // El sufijo sale del dato, no fijo: un presupuesto total mostrado como '/dia'
  // hace parecer que se gasta treinta veces mas de lo que se gasta.
  {key:'budget',    l:'Presupuesto',          w:90,
   fmt:function(v,obj){
     if(!(v>0)) return '-';
     var t=obj&&obj.budgetTipo;
     return '$'+Number(v).toFixed(2)+(t==='diario'?'/dia':(t==='total'?' total':''));
   }, money:true},
  {key:'reach',     l:'Alcance',              w:90,  fmt:function(v){return (v||0).toLocaleString();}},
  {key:'impressions',l:'Impresiones',         w:100, fmt:function(v){return (v||0).toLocaleString();}},
  {key:'cpm',       l:'CPM',                  w:80,  fmt:function(v){return '$'+Number(v).toFixed(2);}, money:true},
  {key:'frequency', l:'Frecuencia',           w:90,  fmt:function(v){return v||'-';}},
  {key:'clicks',    l:'Clics en enlace',      w:100, fmt:function(v){return (v||0).toLocaleString();}},
  {key:'cpc',       l:'CPC',                  w:80,  fmt:function(v){return '$'+Number(v).toFixed(2);}, money:true},
  {key:'ctr',       l:'CTR unico',            w:90,  fmt:function(v){return (v===undefined||v===null||v==='')?'-':(v+'%');}},
  {key:'thruPlays', l:'ThruPlays',            w:90,  fmt:function(v){return v||'-';}},
  {key:'costPerThruPlay',l:'Costo/ThruPlay',  w:110, fmt:function(v){return v?'$'+Number(v).toFixed(2):'-';}, money:true},
  {key:'avgWatch',  l:'Tiempo prom.',         w:100, fmt:function(v){return v?Number(v).toFixed(1)+'s':'-';}},
  {key:'ret25',     l:'Ret. 25%',             w:85,  fmt:function(v){return v?v+'%':'-';}},
  {key:'ret50',     l:'Ret. 50%',             w:85,  fmt:function(v){return v?v+'%':'-';}},
  {key:'ret100',    l:'Ret. 100%',            w:90,  fmt:function(v){return v?v+'%':'-';}},
  {key:'landingViews',l:'Visitas pag. destino',w:130,fmt:function(v){return v||'-';}},
  {key:'costPerLanding',l:'Costo/visita',     w:110, fmt:function(v){return v?'$'+Number(v).toFixed(2):'-';}, money:true, color:true},
  // `obj` es la fila entera: asi la celda puede decir de que evento habla.
  {key:'results',   l:'Resultados',           w:90,  bold:true,
   fmt:function(v,obj){
     if(!v) return '-';
     var e=obj&&obj.resultsEvento;
     if(!e) return String(v);
     // Punteado = estimado: no supimos cual es la meta de optimizacion del
     // conjunto y el numero sale del orden de prioridad, asi que puede no
     // coincidir con Ads Manager. Sin punteado = es el evento optimizado.
     var est=(obj.resultsFuente==='estimado');
     var t=est?('Aproximado: mostramos '+e+', el evento mas fuerte. No pudimos determinar por que evento optimiza (o sus conjuntos optimizan por eventos distintos), asi que puede no coincidir con Meta.')
              :(e+' \u2014 es el evento por el que optimiza el conjunto, igual que la columna Resultados de Meta.');
     return '<span title="'+esc(t)+'"'+(est?' style="border-bottom:1px dotted #777"':'')+'>'+v+'</span>';
   }},
  {key:'costPerResult',l:'Costo/resultado',   w:110, fmt:function(v){return v?'$'+Number(v).toFixed(2):'-';}, money:true, color:true, bold:true},
  {key:'igFollows', l:'Seg. Instagram',       w:110, fmt:function(v){return v||'-';}},
  {key:'igProfileVisits',l:'Visitas perfil IG',w:120,fmt:function(v){return v||'-';}},
  // Solo tienen sentido en video: en estaticos quedan vacias, no en cero.
  {key:'hookRate',  l:'Hook rate',             w:90,  fmt:function(v){return v?v+'%':'-';}},
  {key:'holdRate',  l:'Hold rate',             w:90,  fmt:function(v){return v?v+'%':'-';}},
  // Diagnosticas de relevancia. Meta no las calcula bajo 500 impresiones.
  {key:'rQual',     l:'Calidad',               w:120, fmt:_rankCelda},
  {key:'rEng',      l:'Interaccion',           w:120, fmt:_rankCelda},
  {key:'rConv',     l:'Conversion',            w:120, fmt:_rankCelda}
];
// Los rankings vienen como texto de Meta. Se traducen y se colorean con el mismo
// criterio del resto: verde arriba del promedio, rojo abajo.
function _rankCelda(v){
  var k=String(v||'').toLowerCase();
  if(!k||k==='unknown') return '<span style="color:var(--text3)">-</span>';
  var mapa={
    above_average:{n:'sobre prom.', c:'var(--accent)'},
    average:{n:'promedio', c:'var(--text2)'},
    below_average_10_percent:{n:'bajo 10%', c:'var(--amberx)'},
    below_average_20_percent:{n:'bajo 20%', c:'var(--amberx)'},
    below_average_35_percent:{n:'bajo 35%', c:'var(--redx)'}
  };
  var r=mapa[k]||{n:k.replace(/_/g,' '), c:'var(--text2)'};
  return '<span style="color:'+r.c+'">'+r.n+'</span>';
}

function metaRowLeft(name, expandable, open, onclick, active, nivel, thumb, adId, actId, isWinner, winData, extra){
  var rowH=52;
  // La fila de campana lleva un checkbox delante (14px + 8 de margen) que corre
  // su contenido. Los hijos no lo tienen, asi que hay que sumarlo o el conjunto
  // termina arrancando A LA IZQUIERDA de su campana.
  var _n=Number(nivel)||0;
  var sangria=12+_n*13+(_n>0?22:0);
  var arrow=expandable?'<span style="font-size:10px;color:var(--text3);transition:transform .15s;display:inline-block;'+(open?'transform:rotate(90deg)':'')+';margin-right:6px">&#9654;</span>':'';
  var thumbHtml='';
  if(thumb!==undefined){
    thumbHtml=thumb?'<img src="'+thumb+'" style="width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;margin-right:8px">':'<div style="width:32px;height:32px;background:var(--bg3);border-radius:4px;flex-shrink:0;margin-right:8px"></div>';
  }
  var clickAttr=onclick?' onclick="'+onclick+'" style="cursor:pointer"':(adId?' onclick="openAdPreview(\'\',\''+adId+'\',\''+(actId||'')+'\')" style="cursor:pointer"':'');
  var winBadge='';
  if(isWinner&&winData){
    var wtxt=winData.cierres>0?(winData.cierres+' cierre'+(winData.cierres>1?'s':'')):(winData.calif+' calif.');
    winBadge='<span style="font-size:9px;font-weight:600;color:var(--accent);background:rgba(200,255,71,0.18);border-radius:20px;padding:1px 6px;white-space:nowrap">GANADOR &middot; '+wtxt+'</span>';
  }
  var statusLine=adId!==undefined?'<div style="font-size:10px;color:'+(active?'var(--accent)':'var(--text3)')+';overflow:hidden;white-space:nowrap">'+(winBadge||((active?'activo':'pausado')+(adId?' <span style="color:var(--text3)">Ver en Meta &rarr;</span>':'')))+'</div>':'';
  var winBg=isWinner?'background:rgba(200,255,71,0.09);':'';
  return '<div class="fila-viva" style="flex-shrink:0;width:210px;display:flex;align-items:center;padding:0 12px 0 '+sangria+'px;height:'+rowH+'px;border-right:0.5px solid var(--border);border-bottom:0.5px solid var(--border);'+winBg+(isWinner?'box-shadow:inset 3px 0 0 var(--accent);':'')+'"'+clickAttr+'>'
    +(active?'<span class="fila-viva-sweep"></span>':'')
    +(thumb!==undefined?thumbHtml:'')
    +'<div style="min-width:0;flex:1;position:relative">'
    +'<div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(isWinner?'<span style="color:var(--accent);margin-right:3px">&#9733;</span>':'')+arrow+name+'</div>'
    +statusLine
    +(adId===undefined?'<div style="font-size:10px;color:'+(active?'var(--accent)':'var(--text3)')+'">'+(active?'activa':'pausada')+'</div>':'')
    +'</div>'+(extra||'')+'</div>';
}

// Indice de todo el arbol de Meta: id -> nombre, para anuncios, adsets y campanas.
// Sirve para los clientes donde el utm_ad se cargo con el ID numerico del anuncio
// en vez de su nombre (o quedo apuntando al adset / campana).
// Recorre TODAS las lineas, no solo la activa: las oportunidades viejas referencian
// anuncios de lineas anteriores.
function metaAdIndex(c){
  var idx={ads:{},adsets:{},camps:{}};
  (c.conversionLines||[]).forEach(function(l){
    ((l.metaCampaigns)||[]).forEach(function(cp){
      if(cp&&cp.id&&cp.name) idx.camps[String(cp.id)]=cp.name;
      ((cp.adsets)||[]).forEach(function(as){
        if(as&&as.id&&as.name) idx.adsets[String(as.id)]=as.name;
        ((as.ads)||[]).forEach(function(ad){
          if(ad&&ad.id&&ad.name) idx.ads[String(ad.id)]=ad.name;
        });
      });
    });
  });
  return idx;
}

// Modo compacto de la tabla de Meta: dibuja solo las campanas tildadas.
// Es una preferencia de vista, no toca las exclusiones ni las metricas.
function metaSoloIncluidas(){
  if(S._metaSoloIncl===undefined){
    try{ S._metaSoloIncl=localStorage.getItem('evold-meta-solo-incl')==='1'; }catch(e){ S._metaSoloIncl=false; }
  }
  return !!S._metaSoloIncl;
}
function toggleMetaSoloIncluidas(){
  S._metaSoloIncl=!metaSoloIncluidas();
  try{ localStorage.setItem('evold-meta-solo-incl', S._metaSoloIncl?'1':'0'); }catch(e){}
  renderTab();
}
function metaSoloIncluidasBtn(activeLine){
  var camps=(activeLine&&activeLine.metaCampaigns)||[];
  var excl=(activeLine&&activeLine.excludedCampaigns)||[];
  var fuera=camps.filter(function(x){return excl.indexOf(x.id)!==-1;}).length;
  // Antes salia solo si ya habia alguna campana destildada, y era imposible
  // llegar: para destildar la primera hacia falta este boton, y este boton no
  // aparecia hasta que hubiera una destildada. Como el checkbox de cada fila se
  // saco, no quedaba ninguna puerta. Con una sola campana si sobra: no hay nada
  // que elegir.
  if(camps.length<2) return '';
  var on=metaSoloIncluidas();
  var filtrando=(fuera>0);
  var etiqueta=!filtrando ? String(camps.length)
    : (on?String(fuera):((camps.length-fuera)+'/'+camps.length));
  var col=(on&&filtrando)?'var(--accent)':'var(--text3)';
  return '<span onclick="event.stopPropagation();abrirFiltroCampanas('+_cfgClienteId()+')" '
    +'title="Elegir que campanas cuentan en las metricas" '
    +'style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;'
    +'border:0.5px solid '+((on&&filtrando)?'var(--accent)':'var(--border2)')+';border-radius:99px;padding:1px 7px;color:'+col+'">'
    +'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>'
    +'<span style="font-size:10px;font-weight:400">'+etiqueta+'</span></span>';
}

function metaBenchFila(obj){
  var c=(typeof DB!=='undefined'&&S&&S.clientId)?DB.clients.find(function(x){return x.id===S.clientId;}):null;
  if(!c||typeof effectiveAlarmRules!=='function') return {};
  var reglas;
  try{ reglas=effectiveAlarmRules(c)||[]; }catch(e){ return {}; }
  var out={};
  reglas.forEach(function(r){
    if(!r||!r.metric) return;
    // Solo las reglas de una sola condicion: las compuestas ("inversion Y sin
    // agendas") hablan de la cuenta, no de un anuncio suelto.
    if(r.metric2) return;
    var col=null;
    for(var k in _MB_MAP){ if(_MB_MAP[k]===r.metric){ col=k; break; } }
    if(!col) return;
    var v=Number(obj[col]);
    if(!isFinite(v)) return;
    var lim=Number(r.value);
    if(!isFinite(lim)) return;
    var mal=(r.op==='lt') ? (v<lim) : (v>lim);
    if(!mal) return;
    var met=(typeof ALARM_METRICS!=='undefined')
      ? (ALARM_METRICS.find(function(m){return m.id===r.metric;})||{label:r.metric,fmt:'num'})
      : {label:r.metric,fmt:'num'};
    var f=function(x){ return met.fmt==='money'?('$'+Number(x).toFixed(2)):(met.fmt==='pct'?(x+'%'):String(x)); };
    out[col]={ label:met.label, limite:(r.op==='lt'?'min ':'max ')+f(lim) };
  });
  return out;
}

function metaRowMetrics(obj, isWinner){
  // _fxC lo setea el render de Ads: si el cliente tiene tasa cargada, las
  // columnas de dinero se muestran en USD igual que las tarjetas de arriba.
  var _c=window._fxC;
  var _mbFuera=metaBenchFila(obj);
  return META_METRIC_COLS.map(function(col){
    var v=obj[col.key];
    if(col.money && _c && typeof fxActiva==='function' && fxActiva(_c)){
      var n=Number(v);
      if(isFinite(n) && n!==0) v=n/Number(getFx(_c).rate);
    }
    // Se le pasa la fila entera: la columna de Resultados la necesita para
    // poder decir de que evento de Meta esta hablando.
    var disp=col.fmt(v, obj);
    var style='flex-shrink:0;width:'+col.w+'px;height:52px;display:flex;align-items:center;padding:0 10px;border-left:0.5px solid var(--border);border-bottom:0.5px solid var(--border);font-size:12px';
    if(isWinner) style+=';background:rgba(200,255,71,0.06)';
    if(col.color&&disp!=='-') style+=';color:var(--accent)';
    if(col.bold) style+=';font-weight:500';
    var _f=_mbFuera&&_mbFuera[col.key];
    var _cls=_f?' class="mb-mal" title="'+esc(_f.label+': '+_f.limite)+'"':'';
    return '<div'+_cls+' style="'+style+'">'+disp+(_f?'<span class="mb-sig">!</span>':'')+'</div>';
  }).join('');
}

// Etiqueta legible de un movimiento de Meta. Vive afuera porque la usan tanto el
// cartel de avisos como la bitacora semanal.
var _NV_META={campana:'Campana',conjunto:'Conjunto',anuncio:'Anuncio'};
function metaEtiqueta(mv){
  var n=_NV_META[mv.nivel||'anuncio']||'Anuncio';
  if(mv.tipo==='alta') return n+' nuevo';
  if(mv.tipo==='pausado') return n+' pausado';
  if(mv.tipo==='pausado_probable') return n+' pausado (probable)';
  if(mv.tipo==='reactivado') return n+' reactivado';
  if(mv.tipo==='baja') return n+' eliminado';
  if(mv.tipo==='subio_presupuesto') return 'Presupuesto aumentado';
  if(mv.tipo==='bajo_presupuesto') return 'Presupuesto reducido';
  if(mv.tipo==='segmentacion') return 'Segmentacion modificada';
  if(mv.tipo==='optimizacion') return 'Objetivo de optimizacion cambiado';
  if(mv.tipo==='creativo') return n+': creativo reemplazado';
  if(mv.tipo==='renombrado') return n+' renombrado';
  if(mv.tipo==='rechazado'||mv.tipo==='rechazado_vigente') return n+' RECHAZADO por Meta';
  if(mv.tipo==='revision') return n+' en revision';
  if(mv.tipo==='aprobado') return n+' aprobado';
  if(mv.tipo==='utms') return 'UTMs modificados \u2014 revisa la atribucion';
  if(mv.tipo==='destino') return 'URL de destino cambiada';
  if(mv.tipo==='sin_entrega') return n+' activo sin entregar';
  if(mv.tipo==='aprendizaje'||mv.tipo==='aprendizaje_vigente') return 'Conjunto en aprendizaje limitado';
  if(mv.tipo==='puja') return 'Estrategia de puja cambiada';
  if(mv.tipo==='objetivo') return 'Objetivo de campana cambiado';
  return 'Cambio en '+n.toLowerCase();
}

// ================= MOVIMIENTOS DE ANUNCIOS =================
// Dos fuentes, porque Meta no informa lo mismo para cada caso:
//  - Alta de un anuncio: viene con created_time, asi que se detecta sola desde el primer sync.
//  - Pausa o reactivacion: Meta no dice cuando cambio el estado, solo cual es hoy. Se detecta
//    comparando cada sincronizacion contra la foto de la anterior, igual que las novedades de GHL.
function computeMetaChanges(c, camps){
  c._metaSnapshot=c._metaSnapshot||null;
  var prev=c._metaSnapshot;
  var ahora=new Date().toISOString();
  var foto={};
  var cambios=[];
  var num=function(v){ var n=parseFloat(v); return isNaN(n)?0:n; };

  // Recorremos los tres niveles con la misma logica: estado y presupuesto.
  // Los anuncios no tienen presupuesto propio, se controlan desde el conjunto.
  var registrar=function(nivel, obj, donde){
    var st=String(obj.status||'').toUpperCase();
    var bud=num(obj.budget);
    foto[nivel+':'+obj.id]={st:st, bud:bud, name:obj.name||'', nivel:nivel, donde:donde,
      seg:obj.seg||null, optGoal:obj.optGoal||'', creativeId:obj.creativeId||'',
      eff:String(obj.effectiveStatus||'').toUpperCase(), urlTags:obj.urlTags||'',
      destLink:obj.destLink||'', bid:obj.bidStrategy||'', objetivo:obj.objective||'',
      learning:String(obj.learning||'').toUpperCase()};
    if(!prev) return; // primer sync: solo tomamos la foto
    var p=prev[nivel+':'+obj.id];
    if(!p){
      if(!obj.createdTime) cambios.push({ts:ahora,tipo:'alta',nivel:nivel,ad:obj.name||nivel,donde:donde});
      return;
    }
    if(p.st!==st){
      if(st==='ACTIVE') cambios.push({ts:ahora,tipo:'reactivado',nivel:nivel,ad:obj.name||nivel,donde:donde});
      else if(p.st==='ACTIVE') cambios.push({ts:ahora,tipo:'pausado',nivel:nivel,ad:obj.name||nivel,donde:donde});
    }
    // Segmentacion: comparamos campo por campo para poder decir QUE cambio,
    // no solo que algo cambio.
    if(p.seg && obj.seg){
      var difs=[];
      var lista=function(a,b,etq){
        var A=(a||[]).join(', '), B=(b||[]).join(', ');
        if(A!==B) difs.push(etq+': '+(A||'ninguno')+' \u2192 '+(B||'ninguno'));
      };
      lista(p.seg.lugares, obj.seg.lugares, 'ubicacion');
      lista(p.seg.plataformas, obj.seg.plataformas, 'plataformas');
      if(p.seg.edad!==obj.seg.edad) difs.push('edad: '+p.seg.edad+' \u2192 '+obj.seg.edad);
      if(p.seg.generos!==obj.seg.generos) difs.push('genero: '+p.seg.generos+' \u2192 '+obj.seg.generos);
      if((p.seg.intereses||[]).join('|')!==(obj.seg.intereses||[]).join('|')){
        var antes=(p.seg.intereses||[]).length, despues=(obj.seg.intereses||[]).length;
        difs.push('intereses: '+antes+' \u2192 '+despues);
      }
      if(p.seg.publicos!==obj.seg.publicos) difs.push('publicos guardados: '+p.seg.publicos+' \u2192 '+obj.seg.publicos);
      if(p.seg.excluidos!==obj.seg.excluidos) difs.push('exclusiones: '+p.seg.excluidos+' \u2192 '+obj.seg.excluidos);
      if(difs.length){
        cambios.push({ts:ahora,tipo:'segmentacion',nivel:nivel,ad:obj.name||nivel,donde:donde,
          detalle:difs.slice(0,3).join(' \u00b7 ')+(difs.length>3?' \u00b7 +'+(difs.length-3):'')});
      }
    }
    if(p.optGoal && obj.optGoal && p.optGoal!==obj.optGoal){
      cambios.push({ts:ahora,tipo:'optimizacion',nivel:nivel,ad:obj.name||nivel,donde:donde,
        detalle:p.optGoal+' \u2192 '+obj.optGoal});
    }
    // Rechazo o revision: el anuncio figura activo en la tabla pero no entrega.
    var eff=String(obj.effectiveStatus||'').toUpperCase();
    if(p.eff!==eff){
      if(eff==='DISAPPROVED'||eff==='WITH_ISSUES'){
        cambios.push({ts:ahora,tipo:'rechazado',nivel:nivel,ad:obj.name||nivel,donde:donde,detalle:''});
      } else if(eff==='PENDING_REVIEW'||eff==='IN_PROCESS'){
        cambios.push({ts:ahora,tipo:'revision',nivel:nivel,ad:obj.name||nivel,donde:donde,detalle:''});
      } else if((p.eff==='DISAPPROVED'||p.eff==='PENDING_REVIEW')&&eff==='ACTIVE'){
        cambios.push({ts:ahora,tipo:'aprobado',nivel:nivel,ad:obj.name||nivel,donde:donde,detalle:''});
      }
    }
    // UTMs: si se rompen, los leads siguen entrando pero dejan de atribuirse al anuncio.
    if(p.urlTags!==(obj.urlTags||'')){
      cambios.push({ts:ahora,tipo:'utms',nivel:nivel,ad:obj.name||nivel,donde:donde,
        detalle:(obj.urlTags?'ahora: '+String(obj.urlTags).slice(0,70):'quedaron vacios')});
    }
    if(p.destLink && obj.destLink && p.destLink!==obj.destLink){
      cambios.push({ts:ahora,tipo:'destino',nivel:nivel,ad:obj.name||nivel,donde:donde,
        detalle:String(obj.destLink).slice(0,70)});
    }
    // Fase de aprendizaje del conjunto
    var lrn=String(obj.learning||'').toUpperCase();
    if(p.learning!==lrn && lrn==='LEARNING_LIMITED'){
      cambios.push({ts:ahora,tipo:'aprendizaje',nivel:nivel,ad:obj.name||nivel,donde:donde,detalle:''});
    }
    if(p.bid && obj.bidStrategy && p.bid!==obj.bidStrategy){
      cambios.push({ts:ahora,tipo:'puja',nivel:nivel,ad:obj.name||nivel,donde:donde,
        detalle:p.bid+' \u2192 '+obj.bidStrategy});
    }
    if(p.objetivo && obj.objective && p.objetivo!==obj.objective){
      cambios.push({ts:ahora,tipo:'objetivo',nivel:nivel,ad:obj.name||nivel,donde:donde,
        detalle:p.objetivo+' \u2192 '+obj.objective});
    }
    if(p.creativeId && obj.creativeId && p.creativeId!==obj.creativeId){
      cambios.push({ts:ahora,tipo:'creativo',nivel:nivel,ad:obj.name||nivel,donde:donde,detalle:''});
    }
    if(p.name && obj.name && p.name!==obj.name){
      cambios.push({ts:ahora,tipo:'renombrado',nivel:nivel,ad:obj.name,donde:donde,
        detalle:'antes: '+p.name});
    }
    // Presupuesto: solo si habia uno antes y hay uno ahora. Pasar de 0 a X suele ser
    // que Meta empezo a reportarlo, no que vos lo hayas cambiado.
    if(p.bud>0 && bud>0 && p.bud!==bud){
      var pct=Math.round((bud-p.bud)/p.bud*100);
      cambios.push({ts:ahora, tipo:bud>p.bud?'subio_presupuesto':'bajo_presupuesto',
        nivel:nivel, ad:obj.name||nivel, donde:donde,
        detalle:'$'+p.bud+' \u2192 $'+bud+(pct?' ('+(pct>0?'+':'')+pct+'%)':'')});
    }
  };

  var excl=(function(){
    var al=(typeof getActiveLine==='function')?getActiveLine(c.conversionLines||[]):null;
    return (al&&al.excludedCampaigns)||[];
  })();
  (camps||[]).forEach(function(cp){
    if(excl.indexOf(cp.id)!==-1) return; // campana destildada: no se vigila
    registrar('campana', cp, '');
    (cp.adsets||[]).forEach(function(as){
      registrar('conjunto', as, cp.name||'');
      (as.ads||[]).forEach(function(ad){
        registrar('anuncio', ad, as.name||'');
      });
    });
  });

  // Lo que estaba en la foto anterior y ya no aparece
  if(prev){
    Object.keys(prev).forEach(function(k){
      if(foto[k]) return;
      var p=prev[k];
      cambios.push({ts:ahora,tipo:'baja',nivel:p.nivel||'anuncio',ad:p.name||'Anuncio',donde:p.donde||''});
    });
  }

  c._metaSnapshot=foto;
  if(cambios.length) c.metaChanges=cambios.concat(c.metaChanges||[]).slice(0,200);
  return cambios.length;
}

// Movimientos de los ultimos N dias, mezclando las altas que reporta Meta
// con los cambios de estado que detectamos nosotros.
function metaMovimientos(c, dias){
  dias=dias||7;
  var desde=Date.now()-dias*86400000;
  var out=[];
  var al=(typeof getActiveLine==='function')?getActiveLine(c.conversionLines||[]):null;
  ((al&&al.metaCampaigns)||[]).forEach(function(cp){
    (cp.adsets||[]).forEach(function(as){
      (as.ads||[]).forEach(function(ad){
        if(!ad.createdTime) return;
        var t=new Date(ad.createdTime).getTime();
        if(isNaN(t)||t<desde) return;
        out.push({ts:t, tipo:'alta', ad:ad.name||'Anuncio', donde:as.name||'', nivel:'anuncio', detalle:''});
      });
    });
  });
  // Pausas anteriores a la primera foto: no las tenemos registradas, pero Meta guarda
  // updated_time. Si un anuncio esta pausado y se toco hace poco, casi seguro fue eso.
  // Es una inferencia, no un hecho: updated_time tambien cambia al editar presupuesto,
  // creativo o segmentacion. Por eso se marca aparte como "probable".
  ((al&&al.metaCampaigns)||[]).forEach(function(cp){
    (cp.adsets||[]).forEach(function(as){
      (as.ads||[]).forEach(function(ad){
        if(String(ad.status||'').toUpperCase()==='ACTIVE') return;
        if(!ad.updatedTime) return;
        var t=new Date(ad.updatedTime).getTime();
        if(isNaN(t)||t<desde) return;
        // si ya lo detectamos con la foto, no lo repetimos
        if((c.metaChanges||[]).some(function(ch){return ch.ad===ad.name&&new Date(ch.ts).getTime()>=desde;})) return;
        out.push({ts:t, tipo:'pausado_probable', ad:ad.name||'Anuncio', donde:as.name||'', nivel:'anuncio', detalle:''});
      });
    });
  });
  // Estados que no son "cambios" sino condiciones vigentes: se evaluan cada vez.
  var _excl=(al&&al.excludedCampaigns)||[];
  ((al&&al.metaCampaigns)||[]).forEach(function(cp){
    // Solo las campanas tildadas en Ads & Guiones: las destildadas son historia que no se mira.
    if(_excl.indexOf(cp.id)!==-1) return;
    var _campActiva=String(cp.status||'').toUpperCase()==='ACTIVE';
    (cp.adsets||[]).forEach(function(as){
      if(String(as.learning||'').toUpperCase()==='LEARNING_LIMITED' && _campActiva){
        out.push({ts:Date.now(),tipo:'aprendizaje_vigente',ad:as.name||'Conjunto',donde:cp.name||'',nivel:'conjunto',detalle:''});
      }
      (as.ads||[]).forEach(function(ad){
        var eff=String(ad.effectiveStatus||'').toUpperCase();
        if(eff==='DISAPPROVED'){
          if(_campActiva) out.push({ts:Date.now(),tipo:'rechazado_vigente',ad:ad.name||'Anuncio',donde:as.name||'',nivel:'anuncio',detalle:''});
          return;
        }
        // Activo, con el conjunto activo, creado hace mas de 2 dias y sin una sola impresion.
        // Un anuncio activo dentro de una campana o conjunto pausado no entrega,
        // y eso no es una anomalia: es lo esperado. No hay nada que avisar.
        if(!_campActiva) return;
        if(String(ad.status||'').toUpperCase()!=='ACTIVE') return;
        if(String(as.status||'').toUpperCase()!=='ACTIVE') return;
        if(Number(ad.impressions)>0) return;
        if(!ad.createdTime) return;
        var edad=Date.now()-new Date(ad.createdTime).getTime();
        if(isNaN(edad)||edad<2*86400000) return;
        out.push({ts:Date.now(),tipo:'sin_entrega',ad:ad.name||'Anuncio',donde:as.name||'',nivel:'anuncio',detalle:'activo y sin impresiones'});
      });
    });
  });
  (c.metaChanges||[]).forEach(function(ch){
    var t=new Date(ch.ts).getTime();
    if(isNaN(t)||t<desde) return;
    if(ch.tipo==='alta' && out.some(function(x){return x.tipo==='alta'&&x.ad===ch.ad;})) return;
    out.push({ts:t, tipo:ch.tipo, ad:ch.ad, donde:ch.donde, nivel:ch.nivel||'anuncio', detalle:ch.detalle||''});
  });
  var peso={rechazado:0,rechazado_vigente:0,utms:1,destino:1,sin_entrega:2,aprendizaje_vigente:3,aprendizaje:3};
  out.sort(function(a,b){
    var pa=(peso[a.tipo]!==undefined)?peso[a.tipo]:9, pb=(peso[b.tipo]!==undefined)?peso[b.tipo]:9;
    if(pa!==pb) return pa-pb;
    return b.ts-a.ts;
  });
  return out;
}

function metaAvisos(c){
  var al=(typeof getActiveLine==='function')?getActiveLine(c.conversionLines||[]):null;
  if(!al) return [];
  var out=[], vistos={};
  var push=function(tipo,titulo,detalle,donde,adId,accion){
    var k=tipo+'|'+titulo+'|'+donde;
    if(vistos[k]) return; vistos[k]=true;
    out.push({tipo:tipo,titulo:titulo,detalle:detalle,donde:donde,adId:adId||'',accion:accion||''});
  };
  (al.metaCampaigns||[]).forEach(function(cp){
    if((al.excludedCampaigns||[]).indexOf(cp.id)>=0) return;
    (cp.issues||[]).forEach(function(i){ push('issue',i.titulo,i.detalle,cp.name); });
    (cp.adsets||[]).forEach(function(as){
      (as.issues||[]).forEach(function(i){ push('issue',i.titulo,i.detalle,as.name); });
      var lb=_learningLabel(as.learning);
      if(lb) push(as.learning==='LEARNING_LIMITED'?'issue':'info',lb,
        as.learning==='LEARNING_LIMITED'
          ? 'Meta no consigue suficientes conversiones para salir del aprendizaje: el conjunto va a entregar peor y mas caro.'
          : 'El conjunto todavia esta optimizando. Los numeros de estos dias no son representativos.',
        as.name);
      (as.ads||[]).forEach(function(ad){
        (ad.issues||[]).forEach(function(i){ push('issue',i.titulo,i.detalle,ad.name,ad.id); });
      });
    });
  });
  // Que se movio en la semana: altas, pausas y reactivaciones de anuncios.
  var movs=metaMovimientos(c,7);
  var etiqueta=metaEtiqueta;
  movs.slice(0,8).forEach(function(mv){
    var cuando=Math.max(0,Math.floor((Date.now()-mv.ts)/86400000));
    var det=String(mv.ad||'')+(mv.detalle?' \u00b7 '+String(mv.detalle):'')
      +(cuando===0?' \u00b7 hoy':' \u00b7 hace '+cuando+' dia'+(cuando>1?'s':''));
    push('mov',etiqueta(mv),det,mv.donde,mv.adId||'');
  });
  // Sync viejo: no viene de Meta pero es igual de importante
  if(al.metaSyncAt){
    var dias=Math.floor((Date.now()-new Date(al.metaSyncAt).getTime())/86400000);
    if(dias>=3) push('info','Datos desactualizados','Ultima sincronizacion hace '+dias+' dias.','','','sync');
  }
  return out;
}
function metaAvisosHtml(c){
  // Ya lo viste al entrar: pasa a ser una tarjeta en la fila de metricas.
  if(_avisosYaVisto(c.id)) return '';
  var av=metaAvisos(c);
  if(!av.length) return '';
  var graves=av.filter(function(a){return a.tipo==='issue';});
  var col=graves.length?'var(--amberx)':'var(--text2)';
  var bg=graves.length?'rgba(240,138,40,0.08)':'var(--bg2)';
  var bd=graves.length?'rgba(240,138,40,0.3)':'var(--border)';
  return '<div style="background:'+bg+';border:1px solid '+bd+';border-radius:var(--radius-lg);padding:13px 16px;margin-bottom:16px">'
    +'<div style="font-size:11px;color:'+col+';text-transform:uppercase;letter-spacing:0.06em;margin-bottom:9px">'
    +'Avisos de Meta &middot; '+av.length+'</div>'
    +av.slice(0,10).map(function(a){
      return '<div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0">'
        +'<span style="color:'+(a.tipo==='issue'?'var(--amberx)':a.tipo==='mov'?'var(--bluex,#378add)':'var(--text3)')+';font-size:13px;line-height:1.3">&bull;</span>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12.5px;color:var(--strong)">'+esc(a.titulo)
        +(a.donde?' <span style="color:var(--text3);font-weight:400">&middot; '+esc(a.donde)+'</span>':'')+'</div>'
        +(a.detalle?'<div style="font-size:11.5px;color:var(--text3);line-height:1.5;margin-top:2px">'+esc(a.detalle)+'</div>':'')
        +'</div></div>';
    }).join('')
    +(av.length>10?'<div style="font-size:11px;color:var(--text3);margin-top:6px">y '+(av.length-10)+' mas</div>':'')
    +'</div>';
}

function _metaIssues(obj){
  var arr=(obj&&obj.issues_info)||[];
  return arr.map(function(i){
    return {
      titulo:i.error_summary||i.error_type||'Aviso',
      detalle:i.error_message||'',
      nivel:i.level||''
    };
  }).slice(0,3);
}

// Velo de carga sobre la tabla de campanas. Se difumina lo que se va a
// reemplazar, asi queda claro que esos numeros son los viejos y estan por
// cambiar. Las metricas de arriba siguen legibles.
function metaVelo(texto){
  var cont=document.getElementById('meta-tabla')||document.getElementById('meta-data-container');
  if(!cont) return;
  cont.style.position='relative';
  var v=document.getElementById('meta-velo');
  if(!v){
    v=document.createElement('div');
    v.id='meta-velo';
    v.className='carga-velo';
    cont.appendChild(v);
  }
  v.innerHTML='<span class="carga-spin"></span><span class="carga-txt">'+esc(texto||'Actualizando campanas')+'</span>';
  v.classList.add('on');
}
function metaVeloOff(){
  var v=document.getElementById('meta-velo');
  if(v) v.classList.remove('on');
}
// La tabla se redibuja al terminar y el velo se va con ella, pero si el render
// tarda queda visible: por eso tambien se apaga a mano.

// `callado` lo usa la rotacion de segundo plano: hace lo mismo pero sin
// avisar. Los avisos son para cuando uno aprieta el boton y esta esperando.
async function syncMetaAds(clientId, callado){
  var c=DB.clients.find(function(x){return x.id===clientId;});
  if(!c||!c.metaToken||!c.metaAccountId) return;
  var btn=document.getElementById('meta-sync-btn');
  if(btn){btn.disabled=true;btn.textContent='Sincronizando...';}
  metaVelo('Actualizando campanas');

  var token=c.metaToken;
  var actId='act_'+c.metaAccountId;
  var activeLine=c.conversionLines&&getActiveLine(c.conversionLines);
  // If no line exists, create a temporary meta-only line
  if(!activeLine){
    if(!c.conversionLines) c.conversionLines=[];
    activeLine={id:'meta-'+Date.now(),version:'Meta Ads',status:'activa',adsets:[],metaDays:30,metrics:{adSpent:null,pageViews:null,cpm:null,cpc:null,optIn:null,cpl:null,registros:null,sql:null}};
    c.conversionLines.push(activeLine);
    save();
  }

  // Date range from activeLine.metaDays
  var days=activeLine.metaDays||30;
  var now=new Date();
  var since, until;
  if(days==='custom'&&activeLine.metaSince&&activeLine.metaUntil){
    since=activeLine.metaSince;
    until=activeLine.metaUntil;
  } else if(days==='max'){
    // Meta rechaza fechas de inicio de mas de 37 meses (error #3018), asi que se pide
    // el maximo permitido: 36 meses hacia atras, con un dia de margen.
    var _max=new Date(now); _max.setMonth(_max.getMonth()-36); _max.setDate(_max.getDate()+1);
    since=_max.toISOString().slice(0,10);
    until=now.toISOString().slice(0,10);
  } else {
    days=parseInt(days)||30;
    since=new Date(now-days*24*60*60*1000).toISOString().slice(0,10);
    until=now.toISOString().slice(0,10);
  }
  var timeRange='{"since":"'+since+'","until":"'+until+'"}';

  try{
    // Moneda de la cuenta publicitaria. Meta la devuelve en el objeto de la cuenta,
    // asi que no hay que adivinarla mirando la magnitud de los numeros.
    try{
      var accResp=await fetch('https://graph.facebook.com/v25.0/'+actId
        +'?fields=currency,name,timezone_name&access_token='+token);
      var accData=await accResp.json();
      if(accData && accData.currency){
        c.metaCurrency=accData.currency;
        c.metaAccountName=accData.name||'';
        save();
      }
    }catch(e){ /* si falla, seguimos: la moneda es informativa */ }

    // Fetch campaigns with insights
    // Los tres rankings son las "ad relevance diagnostics". Meta no los calcula
    // por debajo de 500 impresiones: en ese caso vienen vacios o 'unknown'.
    var insFields='spend,reach,impressions,frequency,clicks,cpc,ctr,cpm,actions,cost_per_action_type'
      +',quality_ranking,engagement_rate_ranking,conversion_rate_ranking'
      +',video_thruplay_watched_actions,cost_per_thruplay,video_play_actions,video_avg_time_watched_actions'
      +',video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions';
    // `start_time` y `created_time` no se pedian, asi que no habia forma de
    // saber hace cuanto corre una campana. Son dos campos, no cuestan otra
    // llamada.
    var fieldsStr='id,name,status,effective_status,issues_info,objective,start_time,created_time,daily_budget,lifetime_budget,insights.time_range('+timeRange+'){'+insFields+'}';
    var url='https://graph.facebook.com/v25.0/'+actId+'/campaigns'
      +'?fields='+encodeURIComponent(fieldsStr)
      +'&access_token='+token
      +'&limit=50';
    var resp=await fetch(url);
    var data=await resp.json();
    console.log('Meta campaigns response:', JSON.stringify(data).slice(0,500));
    if(data.error) throw new Error(data.error.message);

    var campaigns=data.data||[];
    if(!campaigns.length){if(!callado)toast('Sin campanas en ese periodo');metaVeloOff();if(btn){btn.disabled=false;btn.textContent='Sincronizar Meta';}return;}

    // Fetch adsets + ads for each campaign
    for(var ci=0;ci<campaigns.length;ci++){
      try{
        var adsetFieldsStr='id,name,status,effective_status,issues_info,learning_stage_info,daily_budget,lifetime_budget,targeting,optimization_goal,promoted_object,bid_strategy,insights.time_range('+timeRange+'){'+insFields+'}';
        var adsetUrl='https://graph.facebook.com/v25.0/'+campaigns[ci].id+'/adsets'
          +'?fields='+encodeURIComponent(adsetFieldsStr)
          +'&access_token='+token
          +'&limit=20';
        var asResp=await fetch(adsetUrl);
        var asData=await asResp.json();
        var adsets=asData.data||[];

        // Fetch ads for each adset
        for(var ai=0;ai<adsets.length;ai++){
          try{
            var adsFieldsStr='id,name,status,effective_status,issues_info,created_time,updated_time,creative{id,name,thumbnail_url,url_tags,object_story_spec{link_data{link}}},insights.time_range('+timeRange+'){'+insFields+'}';
            var adsUrl='https://graph.facebook.com/v25.0/'+adsets[ai].id+'/ads'
              +'?fields='+encodeURIComponent(adsFieldsStr)
              +'&access_token='+token
              +'&limit=20';
            var adsResp=await fetch(adsUrl);
            var adsData=await adsResp.json();
            var adsList=(adsData.data||[]).map(function(ad){
              var ins=ad.insights&&ad.insights.data&&ad.insights.data[0];
              var m=extractIns(ins, 0, _metaObjetivoResultado(adsets[ai]));
              return {
                id:ad.id,name:ad.name,status:ad.status,previewUrl:'',
                createdTime:ad.created_time||null,updatedTime:ad.updated_time||null,
                effectiveStatus:ad.effective_status||'', issues:_metaIssues(ad),
                thumbnail:ad.creative&&ad.creative.thumbnail_url||'',
                creativeId:(ad.creative&&ad.creative.id)||'',
                urlTags:(ad.creative&&ad.creative.url_tags)||'',
                destLink:(ad.creative&&ad.creative.object_story_spec&&ad.creative.object_story_spec.link_data&&ad.creative.object_story_spec.link_data.link)||'',
                spend:m.spend,impressions:m.impressions,reach:m.reach,frequency:m.frequency,
                clicks:m.clicks,ctr:m.ctr,cpc:m.cpc,cpm:m.cpm,
                leads:m.leads,cpl:m.cpl,
                landingViews:m.landingViews,costPerLanding:m.costPerLanding,
                thruPlays:m.thruPlays,costPerThruPlay:m.costPerThruPlay,videoPlays:m.videoPlays,avgWatch:m.avgWatch,ret25:m.ret25,ret50:m.ret50,ret75:m.ret75,ret100:m.ret100,
                hookRate:m.hookRate,holdRate:m.holdRate,rQual:m.rQual,rEng:m.rEng,rConv:m.rConv,
                results:m.results,costPerResult:m.costPerResult,
                 resultsEvento:m.resultsEvento,resultsFuente:m.resultsFuente,
                igFollows:m.igFollows,igProfileVisits:m.igProfileVisits
              };
            });
            // Fetch preview URL for each ad
            for(var di=0;di<adsList.length;di++){
              try{
                var prevUrl='https://graph.facebook.com/v25.0/'+adsList[di].id+'/previews'
                  +'?ad_format=DESKTOP_FEED_STANDARD'
                  +'&access_token='+token;
                var prevResp=await fetch(prevUrl);
                var prevData=await prevResp.json();
                var iframe=(prevData.data&&prevData.data[0]&&prevData.data[0].body)||'';
                var match=iframe.match(/src="([^"]+fb\.me\/adspreview[^"]+)"/);
                if(match) adsList[di].previewUrl=match[1].replace(/&amp;/g,'&');
              }catch(e){}
            }
            adsets[ai].ads=adsList;
          }catch(e){ console.log('ads fetch error:',e.message); adsets[ai].ads=[]; }
        }
        console.log('adsets before map:', JSON.stringify(adsets.map(function(a){return {id:a.id,name:a.name,adsLen:a.ads&&a.ads.length};})));
        campaigns[ci].adsets=adsets.map(function(as){
          var ins=as.insights&&as.insights.data&&as.insights.data[0];
          // Se calcula con el conjunto CRUDO, que es el unico momento en que
          // `promoted_object` existe, y se guarda para que la campana lo use.
          var _obj=_metaObjetivoResultado(as);
          var m=extractIns(ins, 0, _obj);
          var bud=as.daily_budget||as.lifetime_budget||0;
          return {
            id:as.id,name:as.name,status:as.status,
            effectiveStatus:as.effective_status||'', issues:_metaIssues(as),
            learning:(as.learning_stage_info&&as.learning_stage_info.status)||'',
            seg:_resumenSegmentacion(as.targeting),
            // Como esta armado: explica los numeros de la fila. Antes esto solo
            // existia en Analisis de mercado y habia que ir a buscarlo alla.
            optim:_cfgEs(_OPT_ES, as.optimization_goal),
            evento:_cfgEvento(as).evento,
            pixelId:_cfgEvento(as).pixel,
            geo:_cfgGeo(as.targeting).texto,
            geoExcluye:_cfgGeo(as.targeting).excluye,
            // Ubicaciones declaradas. Vacio = Meta las elige (Advantage+).
            ubicaciones:(as.targeting&&as.targeting.publisher_platforms)||[],
            edad:(as.targeting&&(as.targeting.age_min||as.targeting.age_max))
              ?((as.targeting.age_min||18)+'-'+(as.targeting.age_max||65)):'',
            advantage:_cfgAdvantage(as, campaigns[ci]),
            budgetTipo:(as.daily_budget?'diario':(as.lifetime_budget?'total':'')),
            optGoal:as.optimization_goal||'', bidStrategy:as.bid_strategy||'',
            objResultado:_obj,
            endTime:as.end_time||null,
            spend:m.spend,budget:parseFloat(bud/100||0).toFixed(0),
            impressions:m.impressions,reach:m.reach,frequency:m.frequency,
            clicks:m.clicks,ctr:m.ctr,cpc:m.cpc,cpm:m.cpm,
            leads:m.leads,cpl:m.cpl,
            landingViews:m.landingViews,costPerLanding:m.costPerLanding,
            thruPlays:m.thruPlays,costPerThruPlay:m.costPerThruPlay,videoPlays:m.videoPlays,avgWatch:m.avgWatch,ret25:m.ret25,ret50:m.ret50,ret75:m.ret75,ret100:m.ret100,
                hookRate:m.hookRate,holdRate:m.holdRate,rQual:m.rQual,rEng:m.rEng,rConv:m.rConv,
            results:m.results,costPerResult:m.costPerResult,
             resultsEvento:m.resultsEvento,resultsFuente:m.resultsFuente,
            igFollows:m.igFollows,igProfileVisits:m.igProfileVisits,
            ads:(as.ads||[])
          };
        });
        console.log('Adsets saved for camp '+campaigns[ci].id+':', campaigns[ci].adsets.map(function(a){return {id:a.id,name:a.name,ads:a.ads&&a.ads.length};}));
      }catch(e){ campaigns[ci].adsets=[]; }
    }

    // Helper to extract metrics from insights
    function extractIns(ins, budget, obj){
      if(!ins) return {spend:0,impressions:0,reach:0,frequency:0,clicks:0,ctr:'0',cpc:'0',cpm:'0',leads:0,cpl:'',landingViews:0,thruPlays:0,costPerThruPlay:'',videoPlays:0,avgWatch:'',ret25:'',ret50:'',ret75:'',ret100:'',results:0,costPerResult:'',hookRate:'',holdRate:'',rQual:'',rEng:'',rConv:'',igFollows:0,igProfileVisits:0};
      var actions=ins.actions||[];
      function getAction(type){ var a=actions.find(function(x){return x.action_type===type;}); return a?parseInt(a.value||0):0; }
      function getActionF(type){ var a=actions.find(function(x){return x.action_type===type;}); return a?parseFloat(a.value||0):0; }
      // Meta reporta el MISMO lead bajo varios action_type a la vez ('lead', 'onsite_web_lead',
      // 'offsite_conversion.fb_pixel_lead', 'offsite_lead_add_20_s_calls'...). Sumarlos multiplica
      // el numero por la cantidad de alias. Se toma el maximo, que es el conteo real del evento.
      function maxAction(){
        var m=0;
        for(var i=0;i<arguments.length;i++){ var v=getAction(arguments[i]); if(v>m) m=v; }
        return m;
      }
      var leads=maxAction('lead','onsite_web_lead','onsite_conversion.lead_grouped',
        'offsite_conversion.fb_pixel_lead','offsite_lead_add_20_s_calls','onsite_conversion.messaging_first_reply');
      var landingViews=getAction('landing_page_view');
      // ThruPlays no viene dentro de 'actions': es un campo propio de insights,
      // un array donde el valor util suele estar en el primer elemento.
      var thruPlays=(function(){
        var arr=ins.video_thruplay_watched_actions;
        if(!arr||!arr.length) return 0;
        var vv=arr.find(function(x){return x.action_type==='video_view';});
        return parseInt((vv||arr[0]).value||0)||0;
      })();
      // Metricas de video. Todas vienen como arrays propios de insights, no dentro
      // de 'actions'. Se lee el elemento con action_type 'video_view' y si no, el primero.
      function vidNum(campo){
        var arr=ins[campo];
        if(!arr||!arr.length) return 0;
        var vv=arr.find(function(x){return x.action_type==='video_view';});
        return parseFloat((vv||arr[0]).value||0)||0;
      }
      var videoPlays=vidNum('video_play_actions');
      var avgWatch=vidNum('video_avg_time_watched_actions');
      var p25=vidNum('video_p25_watched_actions');
      var p50=vidNum('video_p50_watched_actions');
      var p75=vidNum('video_p75_watched_actions');
      var p100=vidNum('video_p100_watched_actions');
      // La retencion se mide contra las reproducciones, que es como la muestra Meta.
      var pct=function(n){ return videoPlays>0?(n/videoPlays*100).toFixed(1):''; };
      var igFollows=getAction('follow')+getAction('onsite_conversion.post_save');
      var igProfileVisits=getAction('onsite_conversion.messaging_first_reply');
      var spend=parseFloat(ins.spend||0);
      // "Resultados" = evento de conversion real (como en Ads Manager), NUNCA las visitas.
      // Se prioriza el evento de conversion mas fuerte presente; si no hay ninguno, queda vacio.
      // Mismo criterio que arriba: cada bloque son alias del mismo evento, se toma el maximo.
      // Y 'leads' ya incluye el lead del pixel, asi que no se vuelve a sumar aparte.
      var _reg=maxAction('complete_registration','offsite_conversion.fb_pixel_complete_registration','onsite_conversion.complete_registration');
      var _purch=maxAction('purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase');
      var _msgConv=maxAction('onsite_conversion.messaging_conversation_started_7d','onsite_conversion.total_messaging_connection');
      // Programaciones / agendas (evento Schedule). Meta cambia el prefijo segun de donde
      // venga el evento (pixel, sitio, CRM), asi que ademas de los alias conocidos se barren
      // todos los action_type que contengan 'schedule'. Sin esto, una campana optimizada por
      // Programacion mostraba 0 o el numero de otro evento suelto.
      var _sched=(function(){
        var mx=maxAction('schedule','onsite_conversion.schedule','onsite_web_schedule','offsite_conversion.fb_pixel_schedule');
        actions.forEach(function(a){
          if(/schedule/i.test(a.action_type||'')){ var v=parseInt(a.value||0)||0; if(v>mx) mx=v; }
        });
        return mx;
      })();
      // Conversiones personalizadas: en Ads Manager aparecen con el nombre que les puso
      // el cliente ("Programaciones en el sitio", etc.), pero en la API llegan como
      // offsite_conversion.fb_pixel_custom o offsite_conversion.custom.<id> segun el caso.
      // Se barre cualquier action_type que contenga 'custom' para no depender del prefijo.
      var _custom=(function(){
        var mx=0;
        actions.forEach(function(a){
          if(/custom/i.test(a.action_type||'')){ var v=parseInt(a.value||0)||0; if(v>mx) mx=v; }
        });
        return mx;
      })();
      // DIAGNOSTICO: lista los action_type crudos que devuelve Meta para esta fila.
      // Sirve para ver con que nombre viene el evento que Ads Manager llama "Resultados".
      try{ if(actions.length) console.log('[META action_types]', actions.map(function(a){return a.action_type+'='+a.value;}).join(' | ')); }catch(e){}
      // Lee el balde que pide la meta de optimizacion del conjunto.
      // Devuelve null si la clave no la sabemos leer, para poder distinguir
      // "el evento dio cero" de "no supimos buscarlo".
      function _balde(clave){
        if(!clave) return null;
        // Conversion personalizada: Meta la reporta como
        // 'offsite_conversion.custom.<id>'. Se busca ESA, no cualquier custom:
        // una cuenta puede tener varias y la de al lado no es el resultado.
        if(clave.indexOf('custom:')===0){
          var id=clave.slice(7), exacto=0, generico=0;
          actions.forEach(function(a){
            var t=String(a.action_type||''), n=parseInt(a.value||0)||0;
            if(t.indexOf(id)>=0){ if(n>exacto) exacto=n; }
            else if(/custom/i.test(t) && n>generico) generico=n;
          });
          // Si la id no aparece (Meta a veces la reporta sin el sufijo), se cae
          // al barrido generico antes que devolver cero.
          return exacto||generico;
        }
        switch(clave){
          case 'leads':       return leads;
          case 'compras':     return _purch;
          case 'registros':   return _reg;
          case 'agendas':     return _sched;
          case 'mensajes':    return _msgConv;
          case 'contactos':   return maxAction('contact','offsite_conversion.fb_pixel_contact','onsite_conversion.contact');
          case 'solicitudes': return maxAction('submit_application','offsite_conversion.fb_pixel_submit_application');
          case 'clics':       return parseInt(ins.clicks||0)||0;
          case 'landing':     return landingViews;
          case 'thruplays':   return thruPlays;
          case 'impresiones': return parseInt(ins.impressions||0)||0;
          case 'alcance':     return parseInt(ins.reach||0)||0;
        }
        return null;
      }
      var _delObjetivo = obj ? _balde(obj.clave) : null;
      var results, resultsEvento, resultsFuente;
      if(_delObjetivo!==null){
        // Igual que Ads Manager: el numero es el del evento optimizado, aunque
        // de cero. Un cero aca es un dato real ("optimiza por Agendamiento y no
        // hubo ninguno"), no un error.
        results=_delObjetivo; resultsEvento=obj.nombre; resultsFuente='objetivo';
      }else{
        /* ⚠️  SIN META DE OPTIMIZACION CONOCIDA se vuelve al orden fijo de
           antes: el primero que no sea cero se lleva el numero. Es aproximado y
           puede no coincidir con Meta, por eso se marca como 'estimado' y la
           celda lo aclara al pasar el mouse. */
        results=_purch||_sched||_reg||_custom||leads||_msgConv||0;
        resultsEvento=_purch?'Compras'
                     :_sched?'Programaciones'
                     :_reg?'Registros completados'
                     :_custom?'Conversion personalizada'
                     :leads?'Clientes potenciales'
                     :_msgConv?'Conversaciones iniciadas':'';
        resultsFuente=resultsEvento?'estimado':'';
      }
      // Costo por resultado. Si no hubo resultados queda vacio: el fallback anterior
      // agarraba el primer cost_per_action_type (costo por clic, por vista de landing...)
      // y mostraba cosas como "Resultados: - / Costo/resultado: $0.05", que no significan nada.
      var cpr='';
      if(results>0) cpr=(spend/results).toFixed(2);
      return {
        spend:spend,
        resultsEvento:resultsEvento,
        resultsFuente:resultsFuente||'',
        impressions:parseInt(ins.impressions||0),
        reach:parseInt(ins.reach||0),
        frequency:parseFloat(ins.frequency||0).toFixed(2),
        clicks:parseInt(ins.clicks||0),
        ctr:parseFloat(ins.ctr||0).toFixed(2),
        cpc:parseFloat(ins.cpc||0).toFixed(2),
        cpm:parseFloat(ins.cpm||0).toFixed(2),
        leads:leads,
        cpl:leads>0?(spend/leads).toFixed(2):'',
        landingViews:landingViews,
        costPerLanding:landingViews>0?(spend/landingViews).toFixed(2):'',
        thruPlays:thruPlays,
        costPerThruPlay:(function(){
          var arr=ins.cost_per_thruplay;
          if(arr&&arr.length){ var v=parseFloat(arr[0].value||0); if(v>0) return v.toFixed(2); }
          return thruPlays>0?(spend/thruPlays).toFixed(2):'';
        })(),
        videoPlays:videoPlays,
        avgWatch:avgWatch?avgWatch.toFixed(1):'',
        ret25:pct(p25), ret50:pct(p50), ret75:pct(p75), ret100:pct(p100),
        results:results,
        costPerResult:cpr,
        // Hook: de los que vieron el anuncio, cuantos arrancaron el video.
        // Hold: de los que arrancaron, cuantos llegaron al ThruPlay.
        hookRate:(function(){
          var imp=parseInt(ins.impressions||0);
          return (imp>0&&videoPlays>0)?(videoPlays/imp*100).toFixed(1):'';
        })(),
        holdRate:(videoPlays>0&&thruPlays>0)?(thruPlays/videoPlays*100).toFixed(1):'',
        rQual:ins.quality_ranking||'',
        rEng:ins.engagement_rate_ranking||'',
        rConv:ins.conversion_rate_ranking||'',
        igFollows:igFollows,
        igProfileVisits:igProfileVisits,
        budget:budget||0
      };
    }

    // Store campaigns with adsets included
    console.log('Saving campaigns:', campaigns.map(function(c){return {id:c.id,adsets:c.adsets&&c.adsets.length,ads:c.adsets&&c.adsets[0]&&c.adsets[0].ads&&c.adsets[0].ads.length};}));
    activeLine.metaCampaigns=campaigns.map(function(camp){
      var ins=camp.insights&&camp.insights.data&&camp.insights.data[0];
      var m=extractIns(ins, 0, _metaObjCampana(camp));
      var bud=camp.daily_budget||camp.lifetime_budget||0;
      return {
        id:camp.id,name:camp.name,status:camp.status,
        effectiveStatus:camp.effective_status||'', issues:_metaIssues(camp),
        objective:camp.objective||'',
        objetivo:_cfgEs(_OBJ_ES, camp.objective),   // traducido, para la columna
        startTime:camp.start_time||null,
        createdTime:camp.created_time||null,
        spend:m.spend,budget:parseFloat(bud/100||0).toFixed(0),
        budgetTipo:(camp.daily_budget?'diario':(camp.lifetime_budget?'total':'')),
        impressions:m.impressions,reach:m.reach,frequency:m.frequency,
        clicks:m.clicks,ctr:m.ctr,cpc:m.cpc,cpm:m.cpm,
        leads:m.leads,cpl:m.cpl,
        landingViews:m.landingViews,costPerLanding:m.costPerLanding,
        thruPlays:m.thruPlays,costPerThruPlay:m.costPerThruPlay,videoPlays:m.videoPlays,avgWatch:m.avgWatch,ret25:m.ret25,ret50:m.ret50,ret75:m.ret75,ret100:m.ret100,
                hookRate:m.hookRate,holdRate:m.holdRate,rQual:m.rQual,rEng:m.rEng,rConv:m.rConv,
        results:m.results,costPerResult:m.costPerResult,
         resultsEvento:m.resultsEvento,resultsFuente:m.resultsFuente,
        igFollows:m.igFollows,igProfileVisits:m.igProfileVisits,
        adsets:(camp.adsets||[])
      };
    });
    activeLine.metaSyncAt=new Date().toISOString();
    // Comparar contra la foto del sync anterior para saber que se pauso o se reactivo.
    var _nMov=0;
    try{ _nMov=computeMetaChanges(c, activeLine.metaCampaigns); }catch(e){ console.warn('diff Meta',e); }
    save();
    renderTab();
    if(!callado) toast('Meta sincronizado - '+campaigns.length+' campanas'+(_nMov?' \u00b7 '+_nMov+' movimiento'+(_nMov>1?'s':''):''));
  }catch(e){
    if(!callado) toast('Error Meta: '+e.message,'red');
  }
  metaVeloOff();
  if(btn){btn.disabled=false;btn.textContent='Sincronizar Meta';}
}
