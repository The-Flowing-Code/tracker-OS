// Mes contra mes del servicio en el Dashboard (Angie, 04/11/2026).
// Se prueba lo que ve el equipo: cada registro cuenta en el mes en que entro
// con lo que le paso despues, las pruebas no suman, las bajas y su tasa salen
// de los archivados, y un paso tildado el mismo dia que el anterior no es un
// tiempo de etapa.

import { describe, it, expect } from 'vitest';
import { cargar } from './cargar.js';

const FUNCS = ['esc', '_n', 'isoDate', 'MENS_TEST', 'MENS_AGEND', 'MENS_ASIST', 'MENS_NOASIST', 'MENS_COMPRO',
  'MENS_NOMBRES', 'MENS_PASOS', 'MENS_GASTO', 'MENS_PIDIENDO', '_mensRepintar', 'mensMeses', '_mensFecha', '_mensEn',
  '_mensDia', '_mensDias', '_mensProm', '_mensReglas', 'mensClasificar', '_mensCliente', '_mensEsPrueba', 'mensGasto',
  'mensCalcular', '_mensUsd', '_mensDiasTxt', '_mensPct', '_mensCambio', 'dashMensualHtml'];

const HOY = new Date(2026, 10, 4, 12);
const op = (fecha, etapa, extra = {}) => ({ createdAt: fecha + 'T12:00:00Z', pipelineStage: etapa, status: 'open', contactName: 'Lead', ...extra });

function app(clients) {
  const r = cargar(FUNCS, {
    DB: { clients }, S: {}, fetch: () => new Promise(() => {}),
    esAgencia: () => false, esProspecto: () => false, setTimeout: () => 0, clearTimeout: () => {},
  });
  return r;
}

describe('mes contra mes', () => {
  const clienteA = {
    id: 1, name: 'Cliente A', altaAt: '2026-08-19', contractValue: 9600,
    rutaHechas: { Onboarding: '11/09/2026', Estrategia: '02/10/2026', 'Sistemas': '20/10/2026', Lanzamiento: '24/10/2026' },
    ghl: { opportunities: [
      op('2026-10-03', 'Nuevo registro'),
      op('2026-10-05', '1ra llamada programada'),
      op('2026-10-06', 'Asistió a 1ra llamada'),
      op('2026-10-07', 'No asistió a 1ra llamada'),
      op('2026-10-08', 'Compró'),
      op('2026-10-09', 'Asistió a 1ra llamada', { contactName: 'Prueba Test' }),
      op('2026-11-02', 'Nuevo registro'),
    ] },
  };
  const clienteB = { id: 2, name: 'Cliente B', altaAt: '2026-08-14', archived: true, archivedAt: '2026-10-27T17:00:00Z', contractValue: 1000,
    rutaHechas: { Onboarding: '18/09/2026', Estrategia: '18/09/2026' } };
  const nuevo = { id: 3, name: 'Nuevo', altaAt: '2026-10-20T10:00:00Z', contractValue: 3000,
    pagos: [{ monto: '1500', pagadoAt: '2026-10-20' }, { monto: 1500, pagadoAt: '' }] };

  it('arma octubre contra noviembre', () => {
    const a = app([clienteA, clienteB, nuevo]);
    const [sep, oct, nov] = a.mensMeses(HOY);
    expect(sep.ym).toBe('2026-09');
    expect(oct.ym).toBe('2026-10');
    expect(nov.ym).toBe('2026-11');
    expect(nov.enCurso).toBe(true);
    const R = a.mensCalcular(oct, [clienteA, clienteB, nuevo], [clienteA]);
    // La prueba no suma: 5 registros, no 6.
    expect(R.f.reg.total).toBe(5);
    expect(R.f.agenda.total).toBe(4);   // programada, asistio, no asistio, compro
    expect(R.f.vivo.total).toBe(2);     // asistio y compro
    expect(R.f.compro.total).toBe(1);   // «Compró» abierto cuenta aunque no este marcada como ganada
    expect(R.nuevos).toBe(1);
    expect(R.ticket).toBe(3000);
    // Solo lo pagado: el pago sin fecha de cobro no suma.
    expect(R.ltv).toBe(1500);
    expect(R.cobrado).toBe(1500);
    expect(R.bajas.map((c) => c.name)).toEqual(['Cliente B']);
    expect(R.alInicio).toBe(2);
    expect(R.tasaBaja).toBe(0.5);
    // Onboarding → estrategia de el cliente B se tildo el mismo dia: no es un tiempo.
    expect(R.pasos[1].n).toBe(1);
    expect(R.pasos[1].prom).toBe(21);
    expect(R.diasLanz).toBe(66);
  });

  it('dibuja el cuadro aunque Meta no haya contestado', () => {
    const a = app([clienteA, clienteB, nuevo]);
    const html = a.dashMensualHtml([clienteA]);
    expect(html).toContain('mes contra mes');
    expect(html).toContain('Clientes que abandonaron');
    expect(html).toContain('Cliente B');
  });

  it('un archivado sin contrato ni pagos no es un abandono', () => {
    const a = app([]);
    expect(a._mensCliente({ archived: true })).toBe(false);
    expect(a._mensCliente({ archived: true, contractValue: 1000 })).toBe(true);
    expect(a._mensCliente({})).toBe(true);
  });

  it('el cambio pinta bien o mal segun la metrica', () => {
    const a = app([]);
    expect(a._mensCambio(100, 50, true)).toContain('var(--accent)');
    expect(a._mensCambio(100, 50)).toContain('#FF8A4C');
    expect(a._mensCambio(0, 0)).toContain('igual');
  });
});
