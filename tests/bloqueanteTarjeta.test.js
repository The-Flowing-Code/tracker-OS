// El bloqueante abajo del nombre en la tarjeta del Panel 360 (Angie, 04/11/2026).
// Manda el de la etapa; si no hay, el ticket «Bloqueante: …» mientras siga
// abierto. Uno descartado o con el ticket cerrado ya no frena a nadie.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['esc', 'csmBloqueante', 'csmBloqueanteHtml'];
const app = (etapa) => cargar(FUNCS, { csmEtapaActual: () => (etapa ? { k: etapa } : null) });

describe('bloqueante en la tarjeta', () => {
  const item = { id: 'bloqueante-0411-01', texto: 'Bloqueante: Conseguir el acceso a Meta' };

  it('muestra el ticket de bloqueante abierto, sin el prefijo', () => {
    const a = app('sistemas');
    const c = { cambiosPropuestos: { items: [item] }, cambiosDecisiones: { [item.id]: { estado: 'tarea', taskId: 9 } }, tasks: [{ id: 9 }] };
    expect(a.csmBloqueante(c).t).toBe('Conseguir el acceso a Meta');
    expect(a.csmBloqueanteHtml(c)).toContain('p3ktraba');
  });

  it('el de la etapa le gana al ticket', () => {
    const a = app('sistemas');
    const c = { etapaTraba: { sistemas: { t: 'Falta el pixel', quien: 'cliente' } }, cambiosPropuestos: { items: [item] } };
    expect(a.csmBloqueante(c).t).toBe('Falta el pixel');
  });

  it('descartado o con el ticket cerrado no se muestra', () => {
    const a = app('sistemas');
    expect(a.csmBloqueante({ cambiosPropuestos: { items: [item] }, cambiosDecisiones: { [item.id]: { estado: 'descartado' } } })).toBe(null);
    expect(a.csmBloqueante({ cambiosPropuestos: { items: [item] }, cambiosDecisiones: { [item.id]: { estado: 'tarea', taskId: 9 } }, tasks: [{ id: 9, done: true }] })).toBe(null);
    expect(a.csmBloqueanteHtml({})).toBe('');
  });
});
