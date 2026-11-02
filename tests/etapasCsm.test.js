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
    expect(a.csmEtapaDeLabel('Proceso Comercial').k).toBe('estrategia');
    // Las que estaban sin etapa o en la equivocada (01/11/2026)
    expect(a.csmEtapaDeLabel('Alta Cliente').k).toBe('onboarding');
    expect(a.csmEtapaDeLabel('Documento dataset').k).toBe('estrategia');
    expect(a.csmEtapaDeLabel('Sprint de lanzamiento').k).toBe('sistemas');
    expect(a.csmEtapaDeLabel('Lanzamiento').k).toBe('lanzamiento');
    expect(a.csmEtapaDeLabel('Diagnostico')).toBe(null);
    expect(a.csmEtapaDeLabel('Presentacion / venta')).toBe(null);
  });

  it('agendar se tilda sola con una cita de GHL o cargada a mano', () => {
    const c = { id: 1, citas: { Estrategia: { inicio: enDias(2), estado: 'confirmed', como: 'calendario' } } };
    const a = app([c], 'Estrategia');
    const def = a.csmEtapaDef('estrategia');
    const st = a.csmTareaEstado(c, def.tareas.find((t) => t.agenda), def);
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
    const c = { id: 1, citas: { Estrategia: { inicio: enDias(2), estado: 'confirmed', como: 'mano' } } };
    const a = app([c], 'Estrategia');
    const h = a._csmEtapaHtml(c);
    expect(h.replace(/<[^>]+>/g, '')).toContain('Chequear que agendó la llamada de estrategia');
    expect(h).toContain('📅');
    expect(h).toContain('agendada para el');
    expect(h).toContain('Sin bloqueante');
  });

  it('el onboarding no tiene llamada: se manda el link de bienvenida', () => {
    const a = app([], null);
    const def = a.csmEtapaDef('onboarding');
    expect(def.llamada).toBe('');
    expect(def.tareas.some((t) => t.agenda)).toBe(false);
    expect(def.tareas.map((t) => t.id)).toContain('onb-link');
  });

  it('los ids son únicos y cada tarea dice de quién depende', () => {
    const a = app([], null);
    const ids = a.CSM_ETAPAS.flatMap((e) => e.tareas.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    a.CSM_ETAPAS.forEach((e) => e.tareas.forEach((t) => expect(['csm', 'delivery', 'claude', 'cliente']).toContain(t.quien)));
  });

  it('arrastrar la tarjeta no cuenta como llamada hecha ni tilda agendar', () => {
    const c = { id: 1, rutaMovida: { Estrategia: true } };
    const ctx = app([c], 'Sistemas');
    ctx._ruta = () => [{ l: 'Estrategia', estado: 'hecho', manual: false, aMano: true }];
    const def = ctx.csmEtapaDef('estrategia');
    expect(ctx.csmCita(c, def).estado).toBe('sin');
    expect(ctx.csmTareaEstado(c, def.tareas.find((t) => t.agenda), def).ok).toBe(false);
    // con la grabación de Fathom (no a mano) sí cuenta
    ctx._ruta = () => [{ l: 'Estrategia', estado: 'hecho', manual: false, aMano: false }];
    expect(ctx.csmCita(c, def).estado).toBe('hecha');
  });

  it('las mensuales valen por el mes', () => {
    const c = { id: 1, csmTareas: { 'rec-creativos': { ok: true, at: new Date().toISOString() } } };
    const a = app([c], 'Recurrente');
    const def = a.csmEtapaDef('recurrente');
    const t = def.tareas.find((x) => x.id === 'rec-creativos');
    expect(a.csmTareaEstado(c, t, def).ok).toBe(true);
    c.csmTareas['rec-creativos'].at = new Date(Date.now() - 40 * 86400000).toISOString();
    expect(a.csmTareaEstado(c, t, def).ok).toBe(false);
  });

  it('el tilde va por el guardado que mezcla con la nube', () => {
    const c = { id: 7 };
    const a = app([c], 'Onboarding');
    const nube = {};
    a._cliEditarEnNube = (ap) => { ap['7'](nube); return Promise.resolve([]); };
    a.csmTildar(7, 'onb-factura', true);
    expect(c.csmTareas['onb-factura'].ok).toBe(true);
    expect(nube.csmTareas['onb-factura'].por).toBe('santi@x.com');
    a.csmTildar(7, 'onb-factura', false);
    expect(nube.csmTareas['onb-factura']).toBeUndefined();
  });
});
