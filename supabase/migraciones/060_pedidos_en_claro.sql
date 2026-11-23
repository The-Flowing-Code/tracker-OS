-- 060 · Pedidos al agente en palabras simples (Angie, 23/11/2026)
--
-- POR QUE
-- «Me cuesta entender de qué habla»: el texto de cada pedido está escrito para
-- Claude (ids, rutas, nombres de funciones). La bandeja muestra ahora, arriba,
-- qué es el pedido y qué pasa si se toca «Hacelo», en una línea cada uno, sin
-- jerga. El texto original queda para Claude, detrás de «Ver el pedido».
--
-- COMO SE DESHACE
--   alter table public.agente_pedidos drop column if exists claro;
--   alter table public.agente_pedidos drop column if exists al_aprobar;

alter table public.agente_pedidos
  add column if not exists claro text check (claro is null or length(claro) <= 240),
  add column if not exists al_aprobar text check (al_aprobar is null or length(al_aprobar) <= 240);
