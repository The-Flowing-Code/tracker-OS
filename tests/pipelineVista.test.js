// Contactos como pipeline (Angie, 06/11/2026): columnas por etapa, en el orden
// del pipeline de GHL cuando se conoce, y por el recorrido del embudo si no.
import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['esc', '_ghlEtapaRango', 'ghlEtapasOrden', 'GHL_PIPES', 'ghlPipelineHtml'];
const ops = [
  { id: 'a', pipelineStage: 'No asistió a 1ra llamada', createdAt: '2026-11-01' },
  { id: 'b', pipelineStage: 'Nuevo registro', createdAt: '2026-11-05', contactName: 'Lead B' },
  { id: 'c', pipelineStage: 'Nuevo registro', createdAt: '2026-11-04' },
];

describe('vista de pipeline', () => {
  it('sin el pipeline de GHL, ordena por el recorrido del embudo', () => {
    const a = cargar(FUNCS);
    expect(a.ghlEtapasOrden({ id: 1 }, ops)).toEqual(['Nuevo registro', 'No asistió a 1ra llamada']);
  });
  it('con el pipeline de GHL, usa su orden y muestra las etapas vacias', () => {
    const a = cargar(FUNCS);
    a.GHL_PIPES[1] = { pipelines: [{ stages: [{ name: 'Nuevo registro' }, { name: 'Llamada propuesta' }, { name: 'No asistió a 1ra llamada' }] }] };
    expect(a.ghlEtapasOrden({ id: 1 }, ops)).toEqual(['Nuevo registro', 'Llamada propuesta', 'No asistió a 1ra llamada']);
  });
  it('dibuja una columna por etapa con sus contactos', () => {
    const a = cargar(FUNCS, { deriveEstado: () => ({ color: '#fff', label: 'open' }), S: {} });
    const html = a.ghlPipelineHtml({ id: 2 }, ops);
    expect(html).toContain('Nuevo registro');
    expect(html).toContain('Lead B');
    expect(html.indexOf('Lead B')).toBeLessThan(html.indexOf('No asistió'));
  });
});
