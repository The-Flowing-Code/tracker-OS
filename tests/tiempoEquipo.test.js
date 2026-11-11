// La rueda del tiempo del equipo en el Dashboard (Angie, 11/11/2026).
// Se prueba lo que ve el equipo: solo entra lo medido (tiempo con Claude que
// reportó cada máquina y llamadas grabadas), el filtro de persona y fechas
// recorta las dos fuentes, una llamada repetida en dos clientes cuenta una
// vez, y quien no reportó figura «sin datos», no con cero.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['esc', 'TQ_TIPOS', 'TQ_ESPERADOS', '_tqIso', '_tqLunes', '_tqSlug', '_tqFechaLlamada', '_tqMinutos',
  'tqTipoLlamada', '_tqPersonaLlamada', 'tqDatos', '_tqHoras', '_tqNombre', '_tqRueda', 'tiempoEquipoHtml'];

const personas = [
  { email: 'angie@x.com', nombre: 'Angie Rodríguez Herrera' },
  { email: 'santi@x.com', nombre: 'Santi' },
];
const interno = { id: 1, name: 'Evolve', tiempoEquipo: { dias: [
  { persona: 'angie', fecha: '2026-11-10', estrategia: 30, optimizacion: 15, implementacion: 200, sin_clasificar: 40, at: '2026-11-11T22:00:00Z' },
  { persona: 'angie', fecha: '2026-11-03', estrategia: 999, optimizacion: 0, implementacion: 0, sin_clasificar: 0, at: '2026-11-04T22:00:00Z' },
] } };
const llamada = { id: 'f1', title: 'Switcho - Estrategia', date: '10/11/2026', duration: '1h 6m', grabo: 'angie@x.com' };
const clientes = [
  interno,
  { id: 2, name: 'A', fathomCalls: [llamada, { id: 'f2', title: 'Impromptu Google Meet Meeting', date: '11/11/2026', duration: '20 min', grabo: 'santi@x.com' }] },
  { id: 3, name: 'B', fathomCalls: [llamada] },
];

function app(S = {}) {
  return cargar(FUNCS, { DB: { clients: clientes, personas }, S, showTickets: () => {} });
}

describe('rueda del tiempo del equipo', () => {
  it('suma Claude y llamadas del rango, una llamada repetida cuenta una vez', () => {
    const { tqDatos } = app();
    const r = tqDatos(clientes, personas, '2026-11-09', '2026-11-11', '');
    expect(r.porTipo.estrategia).toBe(30 + 66);
    expect(r.porTipo.implementacion).toBe(200);
    expect(r.porTipo.sin_clasificar).toBe(40 + 20);
    expect(r.nLlamadas).toBe(2);
  });

  it('el filtro de persona recorta las dos fuentes', () => {
    const { tqDatos } = app();
    const r = tqDatos(clientes, personas, '2026-11-09', '2026-11-11', 'santi');
    expect(r.claude.estrategia).toBe(0);
    expect(r.llamadas.sin_clasificar).toBe(20);
    expect(r.reportaron.santi).toBeUndefined();
  });

  it('lee la duración y el tipo de una llamada como los escribe Fathom', () => {
    const { _tqMinutos, tqTipoLlamada, _tqFechaLlamada } = app();
    expect(_tqMinutos('28 min')).toBe(28);
    expect(_tqMinutos('1h')).toBe(60);
    expect(_tqMinutos('1h 6m')).toBe(66);
    expect(tqTipoLlamada('Metrodev - Onboarding')).toBe('estrategia');
    expect(tqTipoLlamada('Switcho <> Catchup')).toBe('optimizacion');
    expect(tqTipoLlamada('Marce y Martin')).toBe('sin_clasificar');
    expect(_tqFechaLlamada('9/11/2026')).toBe('2026-11-09');
  });

  it('quien no reportó dice sin datos, no cero', () => {
    const { tiempoEquipoHtml } = app({ tq: { desde: '2026-11-09', hasta: '2026-11-11' } });
    const h = tiempoEquipoHtml();
    expect(h).toContain('Sin datos de Claude en estas fechas: Ashtyn, Santi');
    expect(h).toContain('Midieron: Angie');
  });

  it('la semana arranca el lunes', () => {
    const { _tqLunes, _tqIso } = app();
    expect(_tqIso(_tqLunes(new Date(2026, 10, 11)))).toBe('2026-11-09');
    expect(_tqIso(_tqLunes(new Date(2026, 10, 9)))).toBe('2026-11-09');
    expect(_tqIso(_tqLunes(new Date(2026, 10, 15)))).toBe('2026-11-09');
  });
});
