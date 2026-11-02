// Lo hecho y los seguimientos agrupados (pedidos 3, 4 y 6, 26/10/2026).
// Se carga js/avisos.js en un contexto con lo mínimo de la app (DB, SB, save,
// nextTicketFromApp, rvISO) y se prueba lo que ve el equipo: el ticket que ya
// está hecho se cierra una sola vez, lo hecho sin ticket aparece como ticket
// cerrado, y el cliente tiene UN seguimiento con la lista al día.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'js/avisos.js'), 'utf8');

function app(clients) {
  let tk = 100;
  const ctx = vm.createContext({
    DB: { clients, personas: [{ email: 'santi@x.com', rolId: 'csm', nombre: 'Santi' }, { email: 'angie@x.com', nombre: 'Angie', socioId: 1 }] },
    SB: { listo: true, email: 'angie@x.com' },
    S: { view: 'x' },
    guardados: 0,
    rvISO: (d) => d.toISOString().slice(0, 10),
    responsableDe: (c) => c.owner || '',
    Date, Math, JSON, String, Array, Number, isNaN,
  });
  ctx.save = () => { ctx.guardados++; };
  ctx.nextTicketFromApp = () => ++tk;
  vm.runInContext(codigo, ctx);
  return ctx;
}
const hoy = new Date().toISOString().slice(0, 10);

describe('hechosAplicar', () => {
  it('cierra el ticket abierto que es ese trabajo, una sola vez', () => {
    const c = { id: 1, name: 'A', tasks: [{ id: 555, text: 'x', done: false, ticket: '#7' }],
      hechos: { items: [{ id: 'h1', texto: 'Se hizo', evidencia: 'visto en GHL', fecha: hoy, taskId: '555' }] } };
    const ctx = app([c]);
    expect(ctx.hechosAplicar()).toBe(1);
    expect(c.tasks[0].done).toBe(true);
    expect(c.tasks[0].cierre).toBe('hecho y verificado (rutina)');
    c.tasks[0].done = false;            // alguien lo reabre
    expect(ctx.hechosAplicar()).toBe(0); // no se vuelve a cerrar
    expect(c.tasks[0].done).toBe(false);
  });

  it('lo hecho con Claude sin ticket se suma como ticket cerrado de hoy', () => {
    const c = { id: 1, name: 'A', owner: 'angie@x.com', tasks: [],
      hechos: { items: [{ id: 'h2', texto: 'Landing publicada', fecha: hoy, origen: 'claude', por: 'angie' }] } };
    const ctx = app([c]);
    ctx.hechosAplicar();
    ctx.hechosAplicar();
    expect(c.tasks.length).toBe(1);
    expect(c.tasks[0]).toMatchObject({ done: true, hechoDe: 'h2', source: 'Hecho con Claude', responsible: 'angie@x.com' });
    expect(c.tasks[0].doneAt.slice(0, 10)).toBe(hoy);
  });

  it('no cierra lo descartado ni crea tickets de hechos viejos', () => {
    const c = { id: 1, name: 'A', tasks: [{ id: 9, text: 'y', done: false, desdeCambio: 'h3' }],
      cambiosDecisiones: { h3: { estado: 'descartado' } },
      hechos: { items: [{ id: 'h3', texto: 'z', fecha: hoy }, { id: 'h4', texto: 'viejo', fecha: '2026-01-01' }] } };
    const ctx = app([c]);
    expect(ctx.hechosAplicar()).toBe(0);
    expect(c.tasks.length).toBe(1);
    expect(c.tasks[0].done).toBe(false);
  });
});

describe('seguimientosCsm agrupado', () => {
  it('un solo ticket por cliente, que se achica y se cierra', () => {
    const t1 = { id: 1, text: 'subir videos', responsible: 'juan@c.com', ownerCliente: true, done: false };
    const t2 = { id: 2, text: 'mandar logo', responsible: 'juan@c.com', ownerCliente: true, done: false };
    const viejo = { id: 3, text: 'Seguimiento viejo', seguimientoDe: 1, done: false };
    const c = { id: 1, name: 'Cliente', tasks: [t1, t2, viejo] };
    const ctx = app([c]);
    ctx.seguimientosCsm();
    const g = () => c.tasks.filter((t) => t.seguimientoCliente);
    expect(g().length).toBe(1);
    expect(g()[0].text).toContain('subir videos');
    expect(g()[0].text).toContain('mandar logo');
    expect(viejo.done).toBe(true);
    expect(viejo.cierre).toMatch(/^agrupado en #/);
    t1.done = true;
    ctx.seguimientosCsm();
    expect(g().length).toBe(1);
    expect(g()[0].text).not.toContain('subir videos');
    t2.done = true;
    ctx.seguimientosCsm();
    expect(g()[0].done).toBe(true);
  });
});
