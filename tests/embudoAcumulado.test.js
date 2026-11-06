// El embudo cuenta acumulado (Angie, 06/11/2026). Con Segundo Lavenas salian
// 9 agendas y 12 llamadas en vivo: cada etapa miraba solo la etapa de HOY de la
// oportunidad, y quien agendo y despues asistio o compro dejaba de ser agenda.
// La llamada en vivo salia mas barata que la agenda, que no puede ser.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['_n', 'GHL_AUTO', '_ghlReglasAuto', 'getGhlRules', 'GHL_POSTERIORES', 'ghlReglasAcum', 'ghlFunnelForRange'];

const op = (etapa, extra = {}) => ({ createdAt: '2026-10-15T12:00:00Z', pipelineStage: etapa, status: 'open', ...extra });

// Reglas cargadas a mano, como las de un cliente que las configuro: cada
// lista nombra solo su propia etapa.
const REGLAS = {
  agendas: ['llamada programada'],
  noShows: ['no asistio'],
  llamadaEnVivo: ['asistio', 'tomando decision'],
  presentaciones: ['propuesta enviada'],
  ganado: ['compro'],
};

function segundo() {
  const ops = [];
  for (let i = 0; i < 9; i++) ops.push(op('Llamada programada'));
  for (let i = 0; i < 2; i++) ops.push(op('No asistió'));
  for (let i = 0; i < 8; i++) ops.push(op('Asistió'));
  for (let i = 0; i < 2; i++) ops.push(op('Tomando decisión'));
  ops.push(op('Propuesta enviada'));
  for (let i = 0; i < 2; i++) ops.push(op('Compró', { status: 'won' }));
  for (let i = 0; i < 5; i++) ops.push(op('Nuevo registro'));
  return { ghlRules: REGLAS, ghl: { opportunities: ops } };
}

describe('embudo acumulado', () => {
  it('el caso de Segundo: las agendas incluyen a los que asistieron y compraron', () => {
    const a = cargar(FUNCS);
    const f = a.ghlFunnelForRange(segundo(), '2026-10-01', '2026-10-31');
    // 9 programadas + 2 no show + 10 en vivo + 1 propuesta + 2 compraron
    expect(f.agendas).toBe(24);
    // 10 en vivo + 1 propuesta + 2 compraron
    expect(f.enVivo).toBe(13);
    expect(f.agendas).toBeGreaterThanOrEqual(f.enVivo);
    expect(f.enVivo).toBeGreaterThanOrEqual(f.ganados);
  });

  it('cada etapa contiene a las posteriores, y las que no la tocan no', () => {
    const a = cargar(FUNCS);
    const r = a.ghlReglasAcum(a.getGhlRules(segundo()));
    expect(r.agendas).toEqual(['llamada programada', 'no asistio', 'asistio', 'tomando decision', 'propuesta enviada', 'compro']);
    expect(r.llamadaEnVivo).toEqual(['asistio', 'tomando decision', 'propuesta enviada', 'compro']);
    expect(r.presentaciones).toEqual(['propuesta enviada', 'compro']);
    // Un no show no asistio: no sube a en vivo ni se le suma nada.
    expect(r.noShows).toEqual(['no asistio']);
    expect(r.ganado).toEqual(['compro']);
  });

  it('sin regla de agendas no se adivinan agendas', () => {
    const a = cargar(FUNCS);
    const c = segundo();
    c.ghlRules = { ...REGLAS, agendas: [] };
    // Sin agendas cargadas, las automaticas salen de los nombres; si ningun
    // nombre dice agenda, la lista queda vacia y el embudo muestra «configurar».
    c.ghl.opportunities = c.ghl.opportunities.filter((o) => o.pipelineStage === 'Nuevo registro');
    const r = a.ghlReglasAcum(a.getGhlRules(c));
    expect(r.agendas).toEqual([]);
    expect(a.ghlFunnelForRange(c, '2026-10-01', '2026-10-31').agendas).toBe(null);
  });

  it('con las reglas automaticas sigue igual (ya eran acumuladas)', () => {
    const a = cargar(FUNCS);
    const c = segundo();
    delete c.ghlRules;
    const f = a.ghlFunnelForRange(c, '2026-10-01', '2026-10-31');
    expect(f.agendas).toBeGreaterThanOrEqual(f.enVivo);
    expect(f.enVivo).toBeGreaterThanOrEqual(f.ganados);
  });
});
