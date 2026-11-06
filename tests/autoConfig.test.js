// La fecha de inicio de la linea y las reglas de etapas salen solas (Angie, 04/11/2026):
// la fecha, del arranque de las campañas de Meta; las reglas, del nombre de cada
// etapa de GHL. Lo cargado a mano manda siempre.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['_n', 'isoDate', '_lineaInicioMeta', 'getActiveLine', 'GHL_AUTO', '_ghlReglasAuto', 'getGhlRules'];

describe('configuracion automatica', () => {
  it('la linea sin fecha toma el arranque de la campaña mas vieja incluida', () => {
    const a = cargar(FUNCS);
    const l = { metaCampaigns: [{ id: 'x', startTime: '2026-10-07T10:00:00-0300' }, { id: 'y', startTime: '2026-09-01T10:00:00-0300' }], excludedCampaigns: ['y'] };
    const al = a.getActiveLine([l]);
    expect(al).toBe(l);
    expect(l.dateStart).toBe('2026-10-07');
    expect(l.dateStartAuto).toBe(true);
  });

  it('una fecha cargada a mano no se pisa', () => {
    const a = cargar(FUNCS);
    const l = { dateStart: '2026-10-01', metaCampaigns: [{ id: 'x', startTime: '2026-10-07T10:00:00-0300' }] };
    a.getActiveLine([l]);
    expect(l.dateStart).toBe('2026-10-01');
  });

  it('las reglas salen del nombre de las etapas, y las cargadas mandan', () => {
    const a = cargar(FUNCS);
    const c = { ghl: { opportunities: [
      { pipelineStage: 'Nuevo registro' }, { pipelineStage: '1ra llamada programada' },
      { pipelineStage: 'Asistió a 1ra llamada' }, { pipelineStage: 'No asistió a 1ra llamada' }, { pipelineStage: 'Compró' },
    ] } };
    const r = a.getGhlRules(c);
    expect(r.agendas).toEqual(['1ra llamada programada', 'asistio a 1ra llamada', 'compro', 'no asistio a 1ra llamada']);
    expect(r.llamadaEnVivo).toEqual(['asistio a 1ra llamada', 'compro']);
    expect(r.noShows).toEqual(['no asistio a 1ra llamada']);
    expect(r.ganado).toEqual(['compro']);
    c.ghlRules = { agendas: ['agendo'] };
    expect(a.getGhlRules(c).agendas).toEqual(['agendo']);
  });

  it('con solo un no show, igual hay agenda', () => {
    const a = cargar(FUNCS);
    const c = { ghl: { opportunities: [{ pipelineStage: 'Nuevo registro' }, { pipelineStage: 'No asistió a 1ra llamada' }] } };
    expect(a.getGhlRules(c).agendas).toEqual(['no asistio a 1ra llamada']);
  });
});

describe('tasa del dia', () => {
  const FX = ['_fxHoy', 'getFx', 'fxActiva', 'aUsd'];
  it('sin tasa cargada usa la del dia; la cargada a mano manda', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const a = cargar(FX.concat(['fxAutoCargar']), { FX_AUTO: { fecha: hoy, tasas: { ARS: 2000 }, arsCasa: 'tarjeta' }, _fxPidiendo: false });
    const c = { metaCurrency: 'ARS' };
    expect(a.fxActiva(c)).toBe(true);
    expect(a.aUsd(c, 4000)).toBe(2);
    expect(c.fx.rate).toBe(null); // no se escribe en el cliente
    c.fx = { rate: 1000 };
    expect(a.aUsd(c, 4000)).toBe(4);
  });
});

describe('falta configurar: reglas de etapas', () => {
  const F = ['_n', 'GHL_AUTO', '_ghlReglasAuto', 'getGhlRules', '_incDe'];
  it('si todos estan antes de la agenda, no falta nada', () => {
    const a = cargar(F, { getActiveLine: () => null });
    const c = { ghl: { opportunities: [{ pipelineStage: 'Nuevo registro' }, { pipelineStage: 'Respondió' }] } };
    expect(a._incDe(c).map((x) => x.q)).not.toContain('sin reglas de etapas');
  });
  it('si hay etapas mas adelante que no se leen, se avisa', () => {
    const a = cargar(F, { getActiveLine: () => null });
    const c = { ghl: { opportunities: [{ pipelineStage: 'Nuevo registro' }, { pipelineStage: 'Reunión con Pablo' }] } };
    expect(a._incDe(c).map((x) => x.q)).toContain('sin reglas de etapas');
  });
});
