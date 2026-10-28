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
  var n=0, ahora=new Date();
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    var dec=c.cambiosDecisiones||{};
    ((c.cambiosPropuestos||{}).items||[]).forEach(function(it){
      var _llam=(it && it.crear==='ticket');   // nace de una llamada: ticket directo (Angie, 20/10/2026)
      if(!it || !it.id || !it.texto || (it.para!=='csm' && !_llam)) return;
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
  });
  if(n){
    save();
    if(typeof toast==='function') toast(n+' aviso'+(n===1?'':'s')+' al cliente pasado'+(n===1?'':'s')+' a tickets del CSM');
    try{ if(S.view==='tickets' && typeof showTickets==='function') showTickets(); }catch(e){}
  }
  return n;
}
/* Una tarea que tiene que hacer el CLIENTE (ownerCliente) genera un ticket de
   seguimiento para el CSM (Angie, 19/10/2026): la del cliente queda como está,
   y el CSM tiene la suya para perseguirla. Cuando la del cliente se tilda, el
   seguimiento se cierra solo; si se borra, también. */
function seguimientosCsm(){
  if(typeof SB!=='object' || !SB.listo) return 0;
  var csm=_csmMail(); if(!csm) return 0;
  var copia=_avisosCopia().filter(function(m){ return m!==csm; });
  var n=0, cerradas=0, ahora=new Date();
  (DB.clients||[]).forEach(function(c){
    if(!c || c.archived) return;
    var ts=c.tasks||[];
    var porOrigen={};
    ts.forEach(function(f){ if(f && f.seguimientoDe!=null) porOrigen[String(f.seguimientoDe)]=f; });
    ts.slice().forEach(function(t){
      if(!t || !t.ownerCliente) return;
      var f=porOrigen[String(t.id)];
      if(t.done || t.deleted || t.archivada){
        if(f && !f.done && !f.deleted){
          f.done=true; f.doneAt=ahora.toISOString();
          f.cierre=t.done?'el cliente la cumplió':'se sacó la tarea del cliente'; cerradas++;
        }
        return;
      }
      if(f) return;
      var due='';
      if(t.followUpDue){ var d=new Date(t.followUpDue); if(!isNaN(d)) due=rvISO(d); }
      if(!due){ var v=new Date(ahora.getTime()); v.setDate(v.getDate()+3); due=rvISO(v); }
      c.tasks.unshift({ id:Date.now()+Math.floor(Math.random()*100000)+n,
        text:'Seguimiento: que '+String(t.responsible||'el cliente')+' haga: '+String(t.text||''),
        responsible:csm, tambien:copia, done:false, source:'Seguimiento al cliente', due:due,
        delegated:true, delegatedAt:ahora.toISOString(), ticket:'#'+nextTicketFromApp(), seguimientoDe:t.id });
      n++;
    });
  });
  if(n || cerradas){
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
function _avisosCiclo(){ try{ csmHechosAplicar(); }catch(e){} try{ avisosACsm(); }catch(e){} try{ seguimientosCsm(); }catch(e){} try{ accionesTicketsAplicar(); }catch(e){} }
function avisosArrancar(){
  if(window._avisosT) return;
  setTimeout(_avisosCiclo, 2500);
  window._avisosT=setInterval(_avisosCiclo, 5*60000);
}
