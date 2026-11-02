// Tickets y tareas de etapa (Angie, 02/11/2026): las tareas son las mismas para
// todos los clientes; lo que sale de una llamada y ya es una tarea de etapa no
// crea ticket, se anota en la tarea. Y un ticket viejo que repetía una tarea se
// cierra como «ya no corresponde» sin tildar la tarea.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const etapas = fs.readFileSync(path.join(RAIZ, 'js/etapas-csm.js'), 'utf8');
const avisos = fs.readFileSync(path.join(RAIZ, 'js/avisos.js'), 'utf8');

function app(clients, etapa = 'Sistemas') {
  let tk = 100;
  const ctx = vm.createContext({
    DB: { clients, personas: [{ email: 'santi@x.com', rolId: 'csm', nombre: 'Santi' }] },
    SB: { listo: true, email: 'angie@x.com' },
    S: { view: 'x' },
    guardados: 0,
    _p360Etapa: () => ({ l: etapa }),
    _ruta: () => [],
    rvISO: (d) => d.toISOString().slice(0, 10),
    responsableDe: () => '',
    esc: (s) => String(s ?? ''),
    Date, Math, JSON, String, Array, Number, Object, isNaN,
  });
  ctx.save = () => { ctx.guardados++; };
  ctx.nextTicketFromApp = () => ++tk;
  vm.runInContext(etapas, ctx);
  vm.runInContext(avisos, ctx);
  return ctx;
}
const hoy = new Date().toISOString().slice(0, 10);

describe('tickets que repiten una tarea de etapa', () => {
  it('se cierran como «ya no corresponde» y el detalle queda como nota, sin tildar', () => {
    const c = { id: 1, name: 'A', tasks: [{ id: 555, text: 'Angie hace los estáticos de seguridad privada', done: false, delegated: true, ticket: '#7' }],
      hechos: { items: [{ id: 'd1', texto: 'Estáticos de seguridad privada', fecha: hoy, origen: 'claude', taskId: '555', csmTarea: 'sis-estaticos', soloNota: true }] } };
    const ctx = app([c]);
    const id = ctx.CSM_ETAPAS.flatMap((e) => e.tareas).find((t) => /^Estáticos creados/.test(t.t)).id;
    c.hechos.items[0].csmTarea = id;
    ctx.hechosAplicar();
    ctx.csmHechosAplicar();
    expect(c.tasks.length).toBe(1);
    expect(c.tasks[0].done).toBe(true);
    expect(c.tasks[0].cierre).toMatch(/^ya no corresponde/);
    expect(c.csmNotas[id][0].t).toBe('Estáticos de seguridad privada');
    expect((c.csmTareas || {})[id]).toBeUndefined();
    ctx.csmHechosAplicar();
    expect(c.csmNotas[id].length).toBe(1);
  });

  it('lo que sale de una llamada con csmTarea no crea ticket: va como nota', () => {
    const c = { id: 1, name: 'A', tasks: [], cambiosPropuestos: { at: new Date().toISOString(), items: [
      { id: 'cp1', crear: 'ticket', texto: 'La línea nueva de WhatsApp puede tardar un par de días', csmTarea: 'X' },
      { id: 'cp2', crear: 'ticket', texto: 'Algo que ninguna tarea cubre' }] } };
    const ctx = app([c]);
    const id = ctx.CSM_ETAPAS.flatMap((e) => e.tareas).find((t) => /^Conectó su WhatsApp/.test(t.t)).id;
    c.cambiosPropuestos.items[0].csmTarea = id;
    ctx.avisosACsm();
    expect(c.tasks.length).toBe(1);
    expect(c.tasks[0].desdeCambio).toBe('cp2');
    expect(c.csmNotas[id][0].t).toMatch(/línea nueva/);
    expect(c.cambiosDecisiones.cp1.estado).toBe('nota');
  });

  it('antes de Recurrente no se arma el ticket de seguimiento al cliente', () => {
    const c = { id: 1, name: 'A', tasks: [{ id: 9, text: 'Mandar el logo', ownerCliente: true, done: false }] };
    const ctx = app([c], 'Sistemas');
    ctx.seguimientosCsm();
    expect(c.tasks.filter((t) => t.seguimientoCliente).length).toBe(0);
  });
});
