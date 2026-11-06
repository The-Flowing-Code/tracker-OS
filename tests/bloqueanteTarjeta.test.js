// El bloqueante abajo del nombre en la tarjeta del Panel 360 (Angie, 04/11/2026).
// Manda el de la etapa; si no hay, el ticket «Bloqueante: …» mientras siga
// abierto. Uno descartado o con el ticket cerrado ya no frena a nadie.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['esc', 'CSM_QUIEN', 'csmBloqueante', 'csmProgresoHtml', 'csmBloqueanteHtml'];
const app = (etapa, tareas, hechas = []) => cargar(FUNCS, {
  csmEtapaActual: () => (etapa ? { k: etapa, n: 'Sistemas', tareas } : null),
  csmTareaEstado: (c, t) => ({ ok: hechas.includes(t.id) }),
});

describe('bloqueante en la tarjeta', () => {
  const item = { id: 'bloqueante-0411-01', texto: 'Bloqueante: Conseguir el acceso a Meta' };

  it('muestra el ticket de bloqueante abierto, sin el prefijo', () => {
    const a = app('sistemas');
    const c = { cambiosPropuestos: { items: [item] }, cambiosDecisiones: { [item.id]: { estado: 'tarea', taskId: 9 } }, tasks: [{ id: 9 }] };
    expect(a.csmBloqueante(c).t).toBe('Conseguir el acceso a Meta');
    expect(a.csmBloqueanteHtml(c)).toContain('p3ktraba');
  });

  it('la primera tarea sin hacer de la etapa, con quien la tiene', () => {
    const tareas = [{ id: 'a', t: 'Dar los accesos de Meta', quien: 'cliente' }, { id: 'b', t: 'Montar el embudo', quien: 'delivery' }];
    const a = app('sistemas', tareas, ['a']);
    expect(a.csmBloqueante({}).t).toBe('Montar el embudo');
    expect(a.csmBloqueanteHtml({})).toContain('Delivery · Montar el embudo');
  });

  it('delante van las tareas de la etapa en chico: hecha, donde se quedo y lo que falta', () => {
    const tareas = [{ id: 'a', t: 'Dar los accesos', quien: 'cliente' }, { id: 'b', t: 'Montar el embudo', quien: 'delivery' },
      { id: 'c', t: 'Prueba', quien: 'delivery' }, { id: 'd', t: 'Diario', quien: 'csm', cada: 'dia' }];
    const h = app('sistemas', tareas, ['a']).csmBloqueanteHtml({});
    expect(h).toContain('Sistemas: 1 de 3 tareas hechas');
    expect(h).toContain('class="csmpg ok"');
    expect(h).toContain('Acá se quedó: Montar el embudo');
    expect((h.match(/class="csmpg /g) || []).length).toBe(3);
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
