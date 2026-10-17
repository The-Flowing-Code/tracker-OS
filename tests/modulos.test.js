// Cada js/*.js que carga index.html tiene que poder CARGARSE solo.
//
// Se cargan antes que el script principal (ver CLAUDE.md, "La app"): si una
// variable de un modulo usara al cargar algo del principal -una funcion, una
// constante-, en el navegador daria ReferenceError y la app no arrancaria.
// Paso cerca el 17/10/2026 con META_METRIC_COLS, que nombra _rankCelda: por
// eso _rankCelda viajo con Meta. Este test lo agarra antes de publicar.
//
// Se ejecuta cada modulo en un contexto vacio, sin nada de la app: solo
// declaraciones tienen que entrar sin explotar.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const mods = [...html.matchAll(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]);

describe('modulos de js/', () => {
  it('index.html carga al menos un modulo', () => {
    expect(mods.length).toBeGreaterThan(0);
  });

  for (const m of mods) {
    it(`${m} carga solo, sin nada del script principal`, () => {
      const codigo = fs.readFileSync(path.join(RAIZ, m), 'utf8');
      expect(() => vm.runInContext(codigo, vm.createContext({}), { filename: m })).not.toThrow();
    });
  }

  it('los modulos se cargan antes que el script principal', () => {
    const principal = html.search(/^<script>\s*$/m);
    for (const m of mods) expect(html.indexOf(`src="${m}`)).toBeLessThan(principal);
  });
});
