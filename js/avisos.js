/* ── Avisos y tareas del cliente → al CSM (Angie, 19/10/2026) ─────────────
   «Todo lo que sea aviso a clientes tiene que tenerlo Santiago como tarea,
   que es el CSM, pero que igual me figure a mí. Todo lo que sea tarea de
   clientes también Santi tiene que estar al tanto.»

   Las rutinas (llamadas y reportes de campañas) marcan esos cambios propuestos
   con `para:'csm'` y `tipo:'aviso'` (hay que decirle algo al cliente) o
   `tipo:'cliente'` (algo que tiene que hacer el cliente). Acá se convierten
   solos en ticket:
   - responsable: el CSM, la persona con rolId 'csm' (no un mail fijo);
   - `tambien`: quienes lo ven igual: las socias (personas con socioId);
   - la decisión queda guardada como cualquier «Crear ticket», así no se repite.

   Solo declaraciones: todo lo de la app se usa recién al correr. */

function _csmMail(){
  var p=(DB.personas||[]).filter(function(x){ return x && x.rolId==='csm' && x.email; })[0];
  return p?String(p.email).toLowerCase():'';
}
/* Quiénes lo ven igual: las socias (personas con socioId). Se probó guardarlo
   en DB.agencia y en la persona, y esa configuración no viaja a la nube con el
   guardado común: se perdía al recargar. socioId ya está en la base. */
function _avisosCopia(){
  var a=(DB.agencia && DB.agencia.avisosCopia) || [];
  a=(Array.isArray(a)?a:[]).map(function(x){ return String(x||'').toLowerCase().trim(); }).filter(Boolean);
  if(a.length) return a;
  return (DB.personas||[]).filter(function(p){ return p && p.socioId && p.email && p.rolId!=='csm'; })
    .map(function(p){ return String(p.email).toLowerCase(); });
}
// Quien figura en «también lo ve» cuenta como si fuera suyo (bienvenida, cartera).
function _tkTambienYo(t){
  var me=String((typeof SB==='object' && SB.email)||'').toLowerCase();
  return !!me && Array.isArray(t && t.tambien) && t.tambien.some(function(x){ return String(x||'').toLowerCase()===me; });
}
function _soyCsm(){
  var me=String((typeof SB==='object' && SB.email)||'').toLowerCase();
  return !!me && me===_csmMail();
}

function avisosACsm(){
  if(typeof SB!=='object' || !SB.listo) return 0;
  var csm=_csmMail(); if(!csm) return 0;
  var copia=_avisosCopia().filter(function(m){ return m!==csm; });
  var n=0, act=0, ahora=new Date();
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    var dec=c.cambiosDecisiones||{};
    ((c.cambiosPropuestos||{}).items||[]).forEach(function(it){
      var _llam=(it && it.crear==='ticket');   // nace de una llamada: ticket directo (Angie, 20/10/2026)
      if(!it || !it.id || !it.texto || (it.para!=='csm' && !_llam)) return;
      /* Si el aviso ya tiene ticket abierto y la rutina le cambió el texto (los
         nombres de los leads, por ejemplo), el ticket se actualiza en vez de
         quedarse con el del primer día (pedido 4, 26/10/2026). */
      var _abierto=(c.tasks||[]).filter(function(t){ return t && t.desdeCambio===it.id && !t.done && !t.deleted; })[0];
      if(_abierto && !_llam){
        var _txt=(it.tipo!=='cliente'?'Avisarle al cliente: ':'Seguir con el cliente: ')+it.texto+(it.porque?(' — '+it.porque):'');
        if(_abierto.text!==_txt){ _abierto.textoAnterior=_abierto.text; _abierto.text=_txt; _abierto.textoAt=ahora.toISOString(); act++; }
      }
      if(dec[it.id] && dec[it.id].estado && dec[it.id].estado!=='pendiente') return;
      // Cinturón: si ya hay un ticket que salió de este cambio, no se crea otro
      // (dos navegadores abiertos a la vez pueden llegar antes que la decisión).
      if((c.tasks||[]).some(function(t){ return t && t.desdeCambio===it.id; })) return;
      var aviso=(it.tipo!=='cliente');
      var venc=new Date(ahora.getTime()); venc.setDate(venc.getDate()+(aviso?2:7));
      var t;
      if(_llam){
        /* De una llamada: el ticket sale directo, a nombre de quien la tomó la llamada
           (nombre o mail en `responsable`); si no se reconoce, el responsable del cliente
           y, al final, el CSM. Vence en `vence` (AAAA-MM-DD) o a los 3 días. */
        var q=String(it.responsable||'').toLowerCase().trim(), resp='';
        if(q){ var pp=(DB.personas||[]).filter(function(x){ return x && x.email && (String(x.email).toLowerCase()===q || (x.nombre && String(x.nombre).toLowerCase().split(' ')[0]===q.split(' ')[0])); })[0]; if(pp) resp=String(pp.email).toLowerCase(); }
        if(!resp){ try{ resp=String(responsableDe(c)||'').toLowerCase(); }catch(e){} }
        if(!resp) resp=csm;
        var v3=new Date(ahora.getTime()); v3.setDate(v3.getDate()+3);
        var due=/^\d{4}-\d{2}-\d{2}$/.test(String(it.vence||''))?String(it.vence):rvISO(v3);
        t={ id:Date.now()+Math.floor(Math.random()*100000)+n,
          text:String(it.texto)+(it.porque?(' — '+it.porque):''),
          responsible:resp, tambien:copia.filter(function(m){ return m!==resp; }), done:false,
          source:'Llamada', due:due, delegated:true, delegatedAt:ahora.toISOString(),
          ticket:'#'+nextTicketFromApp(), desdeCambio:it.id };
      } else {
      t={ id:Date.now()+Math.floor(Math.random()*100000)+n,
        text:(aviso?'Avisarle al cliente: ':'Seguir con el cliente: ')+it.texto+(it.porque?(' — '+it.porque):''),
        responsible:csm, tambien:copia, done:false,
        source:aviso?'Aviso al cliente':'Tarea del cliente', due:rvISO(venc),
        delegated:true, delegatedAt:ahora.toISOString(),
        ticket:'#'+nextTicketFromApp(), desdeCambio:it.id };
      }
      c.tasks=c.tasks||[]; c.tasks.unshift(t);
      c.cambiosDecisiones=c.cambiosDecisiones||{};
      c.cambiosDecisiones[it.id]={estado:'tarea', at:ahora.toISOString(), por:(_llam?'automático · llamada':'automático · CSM'), taskId:t.id};
      dec=c.cambiosDecisiones;
      n++;
    });
    /* Un aviso o tarea del cliente cuyo ítem la rutina sacó de la lista ya no
       corresponde y su ticket se cierra (pedido 4). Si salió porque se HIZO, lo
       cierra hechosAplicar con «hecho y verificado», así que acá se saltea lo
       que figura en maquina.hechos. Guarda: la lista tiene que ser posterior al
       ticket, para no cerrar todo si la pestaña todavía no bajó la máquina. */
    var _cp=c.cambiosPropuestos||{};
    if(Array.isArray(_cp.items) && _cp.at){
      var _vivos={}; _cp.items.forEach(function(x){ if(x && x.id) _vivos[x.id]=1; });
      var _hechos={}; (((c.hechos||{}).items)||[]).forEach(function(h){ if(h && h.id) _hechos[h.id]=1; });
      (c.tasks||[]).forEach(function(t){
        if(!t || t.done || t.deleted || !t.desdeCambio || t.source==='Llamada') return;
        if(t.source!=='Aviso al cliente' && t.source!=='Tarea del cliente') return;
        if(_vivos[t.desdeCambio] || _hechos[t.desdeCambio]) return;
        if(!t.delegatedAt || !(new Date(_cp.at) > new Date(t.delegatedAt))) return;
        t.done=true; t.doneAt=ahora.toISOString(); t.cierre='ya no corresponde (la rutina lo sacó de la lista)'; act++;
      });
    }
  });
  if(n || act){
    save();
    if(n && typeof toast==='function') toast(n+' aviso'+(n===1?'':'s')+' al cliente pasado'+(n===1?'':'s')+' a tickets del CSM');
    try{ if(S.view==='tickets' && typeof showTickets==='function') showTickets(); }catch(e){}
  }
  return n;
}
/* Las tareas que tiene que hacer el CLIENTE (ownerCliente) generan UN ticket de
   seguimiento por cliente para el CSM, «Seguimiento a <cliente>», con la lista
   de lo que le falta (Angie, 19/10/2026; pedido 4, aprobado el 26/10/2026).
   Antes había uno por tarea y Santi llegó a tener 6 por cliente. Cada ciclo
   rehace la lista: si cambia, se actualiza el texto (sin tocar número ni
   vencimiento); si no queda nada, se cierra solo. Los individuales que había de
   antes se cierran una vez con «agrupado en #N». */
function _segLinea(t){
  var quien=String(t.responsible||'').split('@')[0].split(' ')[0];
  return (quien?quien+': ':'')+String(t.text||'').replace(/\s+/g,' ').trim().slice(0,90);
}
function seguimientosCsm(){
  if(typeof SB!=='object' || !SB.listo) return 0;
  var csm=_csmMail(); if(!csm) return 0;
  var copia=_avisosCopia().filter(function(m){ return m!==csm; });
  var n=0, cambios=0, ahora=new Date();
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    c.tasks=c.tasks||[];
    var ts=c.tasks;
    var pend=ts.filter(function(t){ return t && t.ownerCliente && !t.done && !t.deleted && !t.archivada; });
    // El agrupado: se busca antes de crear para que dos pestañas no armen dos.
    var g=ts.filter(function(f){ return f && f.seguimientoCliente && !f.done && !f.deleted; })[0];
    var viejos=ts.filter(function(f){ return f && f.seguimientoDe!=null && !f.seguimientoCliente && !f.done && !f.deleted; });
    if(!pend.length){
      if(g){ g.done=true; g.doneAt=ahora.toISOString(); g.cierre='el cliente cumplió todo'; cambios++; }
      viejos.forEach(function(f){ f.done=true; f.doneAt=ahora.toISOString(); f.cierre='el cliente cumplió todo'; cambios++; });
      return;
    }
    var ids=pend.map(function(t){ return t.id; });
    var texto='Seguimiento a '+String(c.name||'el cliente')+': '+pend.map(_segLinea).join(' · ');
    if(!g){
      var due='';
      pend.forEach(function(t){ if(t.followUpDue){ var d=new Date(t.followUpDue); if(!isNaN(d)){ var s=rvISO(d); if(!due || s<due) due=s; } } });
      if(!due){ var v=new Date(ahora.getTime()); v.setDate(v.getDate()+3); due=rvISO(v); }
      g={ id:Date.now()+Math.floor(Math.random()*100000)+n,
        text:texto, responsible:csm, tambien:copia, done:false, source:'Seguimiento al cliente', due:due,
        delegated:true, delegatedAt:ahora.toISOString(), ticket:'#'+nextTicketFromApp(),
        seguimientoCliente:true, seguimientoDe:ids };
      ts.unshift(g); n++;
    } else if(g.text!==texto || JSON.stringify(g.seguimientoDe||[])!==JSON.stringify(ids)){
      g.textoAnterior=g.text; g.text=texto; g.textoAt=ahora.toISOString(); g.seguimientoDe=ids; cambios++;
    }
    viejos.forEach(function(f){ f.done=true; f.doneAt=ahora.toISOString(); f.cierre='agrupado en '+g.ticket; cambios++; });
  });
  if(n || cambios){
    save();
    if(n && typeof toast==='function') toast(n+' seguimiento'+(n===1?'':'s')+' al cliente para el CSM');
    try{ if(S.view==='tickets' && typeof showTickets==='function') showTickets(); }catch(e){}
  }
  return n;
}
/* Acciones sobre tickets que llegan de afuera (Angie, 20/10/2026): el Claude de Santi
   (conector evolve-mcp) y las rutinas dejan en maquina.accionesTickets pedidos de
   «cerrar» o «reabrir» un ticket por su numero (migracion 045). Se aplican UNA vez
   (el id queda en `accionesAplicadas`) y dejan constancia en el ticket: quien lo
   pidio y cuando. No se borra nada y se puede revertir a mano. */
function accionesTicketsAplicar(){
  if(typeof SB!=='object' || !SB.listo) return 0;
  var n=0, ahora=new Date();
  (DB.clients||[]).forEach(function(c){
    if(!c) return;
    var L=(c.accionesTickets&&c.accionesTickets.items)||[];
    if(!L.length) return;
    c.accionesAplicadas=c.accionesAplicadas||{};
    L.forEach(function(a){
      if(!a || !a.id || c.accionesAplicadas[a.id]) return;
      var num=String(a.ticket||'').replace(/[^0-9]/g,'');
      var t=(c.tasks||[]).filter(function(x){ return x && !x.deleted && String(x.ticket||'').replace(/[^0-9]/g,'')===num; })[0];
      c.accionesAplicadas[a.id]=ahora.toISOString();   // aunque no se encuentre: no se reintenta para siempre
      if(!t) return;
      var por=String(a.por||'su Claude');
      if(a.accion==='cerrar' && !t.done){
        t.done=true; t.doneAt=ahora.toISOString();
        t.cierre='hecho por '+por+' desde su Claude'+(a.nota?(' — '+a.nota):''); n++;
      } else if(a.accion==='reabrir' && t.done){
        t.done=false; delete t.doneAt; t.cierre=''; t.reabiertoPor=por; n++;
      }
    });
  });
  if(n){
    save();
    if(typeof toast==='function') toast(n+' ticket'+(n===1?'':'s')+' actualizado'+(n===1?'':'s')+' desde afuera');
    try{ if(S.view==='tickets' && typeof showTickets==='function') showTickets(); }catch(e){}
  }
  return n;
}
/* Lo hecho (pedidos 3 y 6, aprobados el 26/10/2026). Las rutinas de revisión y
   Claude, cuando terminan algo de un cliente, lo suman a maquina.hechos con
   rpc/agregar_hechos (migración 051). Acá, una sola vez por hecho:
   - si hay un ticket abierto que es ese trabajo (por taskId, número de ticket o
     el cambio propuesto del que salió), se cierra con la evidencia;
   - si no hay ninguno, se crea uno ya cerrado, así «Buenas noches» lo cuenta.
     Solo para hechos de los últimos 7 días, para no llenar Tickets de golpe.
   No se cierra lo que se descartó, y si alguien reabre el ticket después, no se
   vuelve a cerrar (el id queda en hechosAplicados). */
function _hechoPersona(por, c){
  var q=String(por||'').toLowerCase().trim();
  if(q){
    var pp=(DB.personas||[]).filter(function(x){ return x && x.email && (String(x.email).toLowerCase()===q
      || String(x.email).toLowerCase().split('@')[0]===q
      || (x.nombre && String(x.nombre).toLowerCase().split(' ')[0]===q.split(' ')[0])); })[0];
    if(pp) return String(pp.email).toLowerCase();
  }
  var r=''; try{ r=String(responsableDe(c)||'').toLowerCase(); }catch(e){}
  return r || String((typeof SB==='object' && SB.email)||'').toLowerCase();
}
function hechosAplicar(){
  if(typeof SB!=='object' || !SB.listo) return 0;
  var cerrados=0, creados=0, ahora=new Date(), hoy=rvISO(ahora);
  var tope=new Date(ahora.getTime()); tope.setDate(tope.getDate()-7); var desde=rvISO(tope);
  (DB.clients||[]).forEach(function(c){
    if(!c) return;
    var L=((c.hechos||{}).items)||[];
    if(!L.length) return;
    c.hechosAplicados=c.hechosAplicados||{};
    var dec=c.cambiosDecisiones||{};
    L.forEach(function(h){
      if(!h || !h.id || c.hechosAplicados[h.id]) return;
      var ts=c.tasks||[];
      var num=String(h.ticket||'').replace(/[^0-9]/g,'');
      var t=ts.filter(function(x){ return x && !x.deleted && (
             (h.taskId && String(x.id)===String(h.taskId))
          || (num && String(x.ticket||'').replace(/[^0-9]/g,'')===num)
          || x.desdeCambio===h.id || x.hechoDe===h.id); })[0];
      var origen=(h.origen==='claude')?'claude':'rutina';
      var cierre=(origen==='claude')?'hecho con Claude':'hecho y verificado (rutina)';
      if(dec[h.id] && dec[h.id].estado==='descartado'){ c.hechosAplicados[h.id]=ahora.toISOString(); return; }
      if(t){
        if(!t.done){
          t.done=true; t.doneAt=ahora.toISOString(); t.cierre=cierre;
          if(h.evidencia) t.hechoEvidencia=String(h.evidencia);
          t.cerradoPorHecho=h.id; cerrados++;
        }
        c.hechosAplicados[h.id]=ahora.toISOString();
        return;
      }
      if(h.corrida==='limpieza manual' || String(h.fecha||'')<desde){ c.hechosAplicados[h.id]=ahora.toISOString(); return; }
      c.tasks=c.tasks||[];
      c.tasks.unshift({ id:Date.now()+Math.floor(Math.random()*100000)+creados,
        text:String(h.texto), responsible:_hechoPersona(h.por, c), done:true,
        doneAt:(h.fecha===hoy?ahora.toISOString():String(h.fecha)+'T12:00:00'),
        source:(origen==='claude'?'Hecho con Claude':'Hecho (rutina)'), due:String(h.fecha),
        ticket:'#'+nextTicketFromApp(), hechoDe:h.id, cierre:cierre,
        hechoEvidencia:String(h.evidencia||'') });
      c.hechosAplicados[h.id]=ahora.toISOString();
      creados++;
    });
  });
  if(cerrados || creados){
    save();
    if(typeof toast==='function'){
      var m=[];
      if(cerrados) m.push(cerrados+' ticket'+(cerrados===1?'':'s')+' cerrado'+(cerrados===1?'':'s')+': ya estaba'+(cerrados===1?'':'n')+' hecho'+(cerrados===1?'':'s'));
      if(creados) m.push(creados+' trabajo'+(creados===1?'':'s')+' hecho'+(creados===1?'':'s')+' sumado'+(creados===1?'':'s')+' como ticket cerrado');
      toast(m.join(' · '));
    }
    try{ if(S.view==='tickets' && typeof showTickets==='function') showTickets(); }catch(e){}
  }
  return cerrados+creados;
}
function _avisosCiclo(){ try{ hechosAplicar(); }catch(e){} try{ csmHechosAplicar(); }catch(e){} try{ avisosACsm(); }catch(e){} try{ seguimientosCsm(); }catch(e){} try{ accionesTicketsAplicar(); }catch(e){} }
function avisosArrancar(){
  if(window._avisosT) return;
  setTimeout(_avisosCiclo, 2500);
  window._avisosT=setInterval(_avisosCiclo, 5*60000);
}
