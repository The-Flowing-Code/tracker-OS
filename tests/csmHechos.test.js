// Un hecho de maquina.hechos con `csmTarea` tilda la tarea del CSM
// (js/etapas-csm.js, 28/10/2026). Las rutinas no pueden escribir `datos`, así
// que la app hace el pase. Se prueba lo que importa para no pisar a nadie:
// lo manual manda, se aplica una sola vez (aunque después la destilden a mano)
// y queda a nombre de Claude con la evidencia y la fecha del hecho.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'js/etapas-csm.js'), 'utf8');

function app(clients) {
  const ctx = vm.createContext({
    DB: { clients },
    SB: { email: 'santi@x.com', listo: true },
    S: {},
    guardados: 0,
    _p360Etapa: () => ({ l: 'Onboarding' }),
    _ruta: () => [],
    esc: (s) => String(s ?? '').replace(/"/g, '&quot;'),
    Date, Math, JSON, String, Array, Object, isNaN,
  });
  ctx.save = () => { ctx.guardados++; };
  vm.runInContext(codigo, ctx);
  return ctx;
}
const hecho = (extra) => ({ id: 'h1', texto: 'Factura verificada', evidencia: 'CUIT ok en el formulario',
  fecha: '2026-10-27', origen: 'claude', csmTarea: 'onb-factura', ...extra });

describe('hechos que tildan tareas del CSM', () => {
  it('tilda a nombre de Claude con la evidencia y la fecha del hecho', () => {
    const c = { id: 1, hechos: { items: [hecho()] } };
    const a = app([c]);
    expect(a.csmHechosAplicar()).toBe(1);
    expect(a.guardados).toBe(1);
    const m = c.csmTareas['onb-factura'];
    expect(m.ok).toBe(true);
    expect(m.por).toBe('claude');
    expect(m.evidencia).toBe('CUIT ok en el formulario');
    // A las 12 locales: el día del hecho, no el anterior por la zona horaria.
    expect(new Date(m.at).getDate()).toBe(27);
    const html = a._csmEtapaHtml(c);
    expect(html).toContain('por Claude');
    expect(html).toContain('title="CUIT ok en el formulario"');
  });

  it('lo manual manda: si ya estaba tildada a mano no se pisa', () => {
    const manual = { ok: true, at: '2026-10-20T15:00:00.000Z', por: 'santi@x.com' };
    const c = { id: 1, csmTareas: { 'onb-factura': { ...manual } }, hechos: { items: [hecho()] } };
    const a = app([c]);
    expect(a.csmHechosAplicar()).toBe(0);
    expect(c.csmTareas['onb-factura']).toEqual(manual);
    // Igual se guarda que el hecho ya se vio: si la destildan, no vuelve.
    expect(a.guardados).toBe(1);
    a.csmTildar(1, 'onb-factura', false);
    expect(a.csmHechosAplicar()).toBe(0);
    expect(c.csmTareas['onb-factura']).toBeUndefined();
  });

  it('se aplica una sola vez: destildada a mano después, no se vuelve a tildar', () => {
    const c = { id: 1, hechos: { items: [hecho()] } };
    const a = app([c]);
    expect(a.csmHechosAplicar()).toBe(1);
    a.csmTildar(1, 'onb-factura', false);
    const g = a.guardados;
    expect(a.csmHechosAplicar()).toBe(0);
    expect(c.csmTareas['onb-factura']).toBeUndefined();
    expect(a.guardados).toBe(g);
  });

  it('sin csmTarea, con un id que no existe o sin la nube bajada no hace nada', () => {
    const c = { id: 1, hechos: { items: [hecho({ id: 'h2', csmTarea: undefined }), hecho({ id: 'h3', csmTarea: 'no-existe' })] } };
    const a = app([c]);
    expect(a.csmHechosAplicar()).toBe(0);
    expect(c.csmTareas).toBeUndefined();
    const c2 = { id: 2, hechos: { items: [hecho()] } };
    const b = app([c2]);
    b.SB.listo = false;
    expect(b.csmHechosAplicar()).toBe(0);
    expect(c2.csmTareas).toBeUndefined();
  });
});
