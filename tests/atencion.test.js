// Etiqueta de atencion por cliente: Urgente / Monitoreo (Angie, 03/11/2026).
// Se prueba lo que ve el equipo: poner, cambiar y sacar la etiqueta deja el
// cliente como corresponde (con fecha y quien), el chip sale en la ficha y en
// la tarjeta del tablero, y los urgentes suben primero sin desordenar el resto.

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { cargar, rutaHtml } from './cargar.js';

const FUNCS = ['esc', 'ATENCION', 'atencionDe', 'atencionSet', '_atnOrdenar', '_atnChip'];

function app(clients, email = 'santi@x.com') {
  const stubs = { DB: { clients }, SB: { email }, guardados: 0, repintados: 0 };
  const r = cargar(FUNCS, stubs);
  r.ctx.save = () => { r.ctx.guardados++; };
  r.ctx.p360Repintar = () => { r.ctx.repintados++; };
  r.ctx.atnMenuCerrar = () => {};
  return r;
}

describe('etiqueta de atencion', () => {
  it('poner, cambiar y sacar', () => {
    const c = { id: 7, name: 'Cliente X' };
    const a = app([c]);
    a.atencionSet(7, 'urgente');
    expect(c.atencion).toBe('urgente');
    expect(c.atencionPor).toBe('santi@x.com');
    expect(c.atencionAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.ctx.guardados).toBe(1);

    a.atencionSet(7, 'monitoreo');
    expect(c.atencion).toBe('monitoreo');
    expect(a.ctx.guardados).toBe(2);

    // La misma otra vez no guarda ni cambia la fecha.
    const at = c.atencionAt;
    a.atencionSet(7, 'monitoreo');
    expect(a.ctx.guardados).toBe(2);
    expect(c.atencionAt).toBe(at);

    a.atencionSet(7, '');
    expect('atencion' in c).toBe(false);
    expect('atencionAt' in c).toBe(false);
    expect('atencionPor' in c).toBe(false);
    expect(a.ctx.guardados).toBe(3);
  });

  it('un valor que no existe no toca nada', () => {
    const c = { id: 1, atencion: 'urgente' };
    const a = app([c]);
    a.atencionSet(1, 'importante');
    expect(c.atencion).toBe('urgente');
    expect(a.ctx.guardados).toBe(0);
  });

  it('el chip: en la tarjeta solo con etiqueta, en la ficha siempre', () => {
    const a = app([]);
    expect(a._atnChip({ id: 1 }, false)).toBe('');
    expect(a._atnChip({ id: 1 }, true)).toContain('atn sin');
    const u = a._atnChip({ id: 1, atencion: 'urgente', atencionAt: '2026-11-02', atencionPor: 'angie' }, false);
    expect(u).toContain('class="atn urgente"');
    expect(u).toContain('>Prioritaria</span>');
    expect(u).toContain('Desde el 02/11');
    expect(u).toContain('event.stopPropagation();atnMenu(this,1)');
    expect(a._atnChip({ id: 2, atencion: 'monitoreo' }, true)).toContain('>Monitoreo</span>');
  });

  it('urgentes primero, despues monitoreo, el resto en su orden', () => {
    const a = app([]);
    const d = (id, atencion) => ({ c: { id, atencion } });
    const out = a._atnOrdenar([d(1), d(2, 'monitoreo'), d(3), d(4, 'urgente'), d(5, 'monitoreo')]);
    expect(out.map((x) => x.c.id)).toEqual([4, 2, 5, 1, 3]);
  });

  it('la ficha del cliente lleva el chip al lado del nombre', () => {
    const c = { id: 9, name: 'Cliente Y', atencion: 'urgente' };
    const { _p360FichaHtml } = cargar(
      ['esc', 'ATENCION', 'atencionDe', '_atnChip', '_p360FichaHtml'],
      {
        DB: { clients: [c] }, S: {},
        _ruta: () => [], rutaDef: () => [], _p360Etapa: () => null, rutaHijas: () => [],
        P360_PIDE: {}, _p360TicketsHtml: () => '', esProspecto: () => false,
      },
    );
    const html = _p360FichaHtml(c, false);
    expect(html).toMatch(/<div class="p3fi-tit">Cliente Y<span class="atn urgente"/);
    c.atencion = '';
    expect(_p360FichaHtml(c, false)).toContain('class="atn sin"');
  });

  it('la tarjeta del tablero lleva el chip en la linea del nombre', () => {
    // La tarjeta es una funcion adentro de p360Html y no se puede cargar
    // sola: se comprueba en el codigo que el chip va en la linea del nombre y
    // que las columnas se ordenan por etiqueta.
    const html = fs.readFileSync(rutaHtml(), 'utf8');
    const ini = html.indexOf('function p360Html(){');
    const cuerpo = html.slice(ini, html.indexOf('\nfunction ', ini + 10));
    expect(cuerpo).toMatch(/<div class="p3knom'[\s\S]{0,300}\+_atnChip\(d\.c, false\)/);
    expect(cuerpo).toContain('x.cards=_atnOrdenar(x.cards)');
  });
});
