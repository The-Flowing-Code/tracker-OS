// Una sola subida a la nube a la vez (28/10/2026).
// Con la base lenta, save() arrancaba subidas nuevas encima de la que seguia
// corriendo y cada una volvia a mandar todos los clientes: ~800 escrituras por
// minuto desde una pestaña. Esto comprueba que mientras hay una subida en curso
// no arranca otra, que lo pedido en el medio corre despues, y que la espera
// crece cuando la subida falla.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cargar } from './cargar.js';

function armar(subirUnaVez) {
  const stubs = {
    _sbSubirUnaVez: subirUnaVez,
    _sbPendiente: null,
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
  };
  const app = cargar(['_sbEnCurso', '_sbOtraVez', '_sbEspera', 'sbSubir', '_sbUltimoMal'], stubs);
  return app;
}

describe('sbSubir: una sola subida a la vez', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('no arranca otra mientras una sigue corriendo', async () => {
    let corriendo = 0, maximo = 0, llamadas = 0, soltar;
    const app = armar(() => {
      llamadas++; corriendo++; maximo = Math.max(maximo, corriendo);
      return new Promise((r) => { soltar = () => { corriendo--; r(); }; });
    });
    app.sbSubir(); app.sbSubir(); app.sbSubir();
    expect(llamadas).toBe(1);
    soltar();
    await vi.advanceTimersByTimeAsync(0);
    // Lo pedido en el medio corre una sola vez, despues de la espera.
    await vi.advanceTimersByTimeAsync(2000);
    expect(llamadas).toBe(2);
    expect(maximo).toBe(1);
  });

  it('si la subida falla, la proxima espera mas', async () => {
    let llamadas = 0;
    let app;
    app = armar(async () => { llamadas++; app.ctx._sbUltimoMal = true; });
    app.sbSubir();
    app.sbSubir();                       // queda anotada para despues
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(llamadas).toBe(1);            // a los 2 s todavia no: fallo y espera mas
    await vi.advanceTimersByTimeAsync(8000);
    expect(llamadas).toBe(2);            // a los 10 s si
  });
});
