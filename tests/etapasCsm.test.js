// Tareas del CSM por etapa (js/etapas-csm.js, 28/10/2026).
// Se carga el módulo solo, con lo mínimo de la app, y se prueba lo que ve el
// equipo: la tarea de agendar se tilda sola con una cita de verdad y NUNCA con
// una adivinada (CLAUDE.md: agendada ≠ hecha, y una adivinada menos), lo
// tildado guarda quién y cuándo, y las que se repiten valen por ese día.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'js/etapas-csm.js'), 'utf8');

function app(clients, etapa) {
  const ctx = vm.createContext({
    DB: { clients },
    SB: { email: 'santi@x.com' },
    S: {},
    guardados: 0,
    _p360Etapa: () => (etapa ? { l: etapa } : null),
    _ruta: () => [],
    esc: (s) => String(s ?? ''),
    Date, Math, JSON, String, Array, Object, isNaN,
  });
  ctx.save = () => { ctx.guardados++; };
  vm.runInContext(codigo, ctx);
  return ctx;
}
const enDias = (n) => new Date(Date.now() + n * 86400000).toISOString();

describe('tareas del CSM por etapa', () => {
  it('la etapa sale de la columna del tablero, aunque la ruta se llame distinto', () => {
    const a = app([], null);
    expect(a.csmEtapaDeLabel('Pago / onboarding').k).toBe('onboarding');
    expect(a.csmEtapaDeLabel('Sistemas y Montado del Embudo').k).toBe('sistemas');
    expect(a.csmEtapaDeLabel('Estrategia 2').k).toBe('estrategia');
    expect(a.csmEtapaDeLabel('Recurrente').k).toBe('recurrente');
    expect(a.csmEtapaDeLabel('Proceso Comercial')).toBe(null);
  });

  it('agendar se tilda sola con una cita de GHL o cargada a mano', () => {
    const c = { id: 1, citas: { Onboarding: { inicio: enDias(2), estado: 'confirmed', como: 'calendario' } } };
    const a = app([c], 'Onboarding');
    const def = a.csmEtapaDef('onboarding');
    const st = a.csmTareaEstado(c, def.tareas[0], def);
    expect(st.ok).toBe(true);
    expect(st.auto).toBe(true);
    expect(a.csmCita(c, def).estado).toBe('agendada');
  });

  it('una cita adivinada o cancelada no tilda nada', () => {
    const adiv = { id: 1, citas: { Estrategia: { inicio: enDias(1), estado: 'confirmed', como: 'adivinada' } } };
    const canc = { id: 2, citas: { Estrategia: { inicio: enDias(1), estado: 'cancelled', como: 'mano' } } };
    const a = app([adiv, canc], 'Estrategia');
    const def = a.csmEtapaDef('estrategia');
    const agendar = def.tareas.find((t) => t.agenda);
    expect(a.csmTareaEstado(adiv, agendar, def).ok).toBe(false);
    expect(a.csmCita(adiv, def).estado).toBe('adivinada');
    expect(a.csmTareaEstado(canc, agendar, def).ok).toBe(false);
    expect(a.csmCita(canc, def).estado).toBe('cancelada');
  });

  it('tildar guarda quién y cuándo en la fila del cliente, y destildar lo saca', () => {
    const c = { id: 7 };
    const a = app([c], 'Onboarding');
    a.csmTildar(7, 'onb-factura', true);
    expect(c.csmTareas['onb-factura'].ok).toBe(true);
    expect(c.csmTareas['onb-factura'].por).toBe('santi@x.com');
    expect(c.csmTareas['onb-factura'].at).toBeTruthy();
    a.csmTildar(7, 'onb-factura', false);
    expect(c.csmTareas['onb-factura']).toBeUndefined();
    expect(a.guardados).toBe(2);
  });

  it('el mensaje diario tildado ayer hoy vuelve a faltar', () => {
    const c = { id: 1, csmTareas: { 'rec-diario': { ok: true, at: enDias(-1), por: 'santi@x.com' } } };
    const a = app([c], 'Recurrente');
    const def = a.csmEtapaDef('recurrente');
    expect(a.csmTareaEstado(c, def.tareas[0], def).ok).toBe(false);
    c.csmTareas['rec-diario'].at = new Date().toISOString();
    expect(a.csmTareaEstado(c, def.tareas[0], def).ok).toBe(true);
  });

  it('el bloqueante guarda texto, quién y para cuándo, y se borra al destrabarse', () => {
    const c = { id: 3 };
    const a = app([c], 'Estrategia');
    a.csmTrabaSet(3, 'estrategia', 't', 'Falta el acceso a Meta');
    a.csmTrabaSet(3, 'estrategia', 'quien', 'cliente');
    a.csmTrabaSet(3, 'estrategia', 'para', '2026-11-02');
    expect(c.etapaTraba.estrategia).toMatchObject({ t: 'Falta el acceso a Meta', quien: 'cliente', para: '2026-11-02', por: 'santi@x.com' });
    a.csmTrabaSet(3, 'estrategia', 'otro', 'x');   // un campo que no existe no entra
    expect(c.etapaTraba.estrategia.otro).toBeUndefined();
    a.csmTrabaQuitar(3, 'estrategia');
    expect(c.etapaTraba.estrategia).toBeUndefined();
  });

  it('la ficha dibuja las tareas de la etapa de ahora con el 📅 en la de agendar', () => {
    const c = { id: 1, citas: { Onboarding: { inicio: enDias(2), estado: 'confirmed', como: 'mano' } } };
    const a = app([c], 'Onboarding');
    const h = a._csmEtapaHtml(c);
    expect(h.replace(/<[^>]+>/g, '')).toContain('Agendar la llamada de bienvenida');
    expect(h).toContain('📅');
    expect(h).toContain('agendada para el');
    expect(h).toContain('Sin bloqueante');
  });
});
