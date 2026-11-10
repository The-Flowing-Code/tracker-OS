-- 054 · «Lo que tenés que saber» de cada cliente (Angie, 10/11/2026)
--
-- POR QUE
-- «Quiero en un segundo tener toda la información rápida sobre ese cliente y
-- cuál es su necesidad, lo más importante que tengo que saber». Y en TODOS los
-- clientes, solo. Hasta hoy «De qué vive hoy» y «Qué quiere con nosotros» los
-- escribía la app desde el navegador de quien tuviera la clave de IA, y 21 de
-- 33 clientes activos estaban vacíos.
--
-- Lo escribe la rutina `contexto-clientes` de la Mac de Angie, una vez por día,
-- leyendo el tracker y el cerebro de TFC-OS. Va en `maquina.contexto` (no en
-- `datos`) por lo mismo que `reporteCampana` (029): `datos` lo sube entero la
-- app desde la memoria del navegador y lo pisaría. Si una pestaña vieja lo
-- pisa, la corrida del día siguiente lo vuelve a escribir.
--
-- Forma (todo texto corto, sin plata de partners ni contactos):
--   { necesidad: "lo que más necesita hoy, una línea",
--     puntos:    ["hasta 5 cosas que hay que saber"],
--     hoy:       "de qué vive hoy (si la ficha no lo tiene escrito)",
--     conNosotros: "qué quiere trabajar con nosotros (ídem)",
--     fuentes:   "de dónde salió, en palabras",
--     at:        lo pone esta función }
-- Con p_val null se borra.

create or replace function public.set_contexto(p_id bigint, p_val jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  k text;
begin
  if p_val is null then
    update public.clientes set maquina = coalesce(maquina, '{}'::jsonb) - 'contexto' where id = p_id;
    if not found then raise exception 'contexto: no existe el cliente %', p_id; end if;
    return;
  end if;
  if jsonb_typeof(p_val) <> 'object' then
    raise exception 'contexto: tiene que ser un objeto';
  end if;
  for k in select jsonb_object_keys(p_val) loop
    if k not in ('necesidad','puntos','hoy','conNosotros','fuentes') then
      raise exception 'contexto: la clave % no va', k;
    end if;
  end loop;
  if length(coalesce(p_val->>'necesidad','')) > 300 then raise exception 'contexto: necesidad pasa de 300'; end if;
  if length(coalesce(p_val->>'hoy',''))       > 500 then raise exception 'contexto: hoy pasa de 500'; end if;
  if length(coalesce(p_val->>'conNosotros','')) > 500 then raise exception 'contexto: conNosotros pasa de 500'; end if;
  if length(coalesce(p_val->>'fuentes',''))   > 200 then raise exception 'contexto: fuentes pasa de 200'; end if;
  if p_val ? 'puntos' then
    if jsonb_typeof(p_val->'puntos') <> 'array' or jsonb_array_length(p_val->'puntos') > 5 then
      raise exception 'contexto: puntos tiene que ser una lista de hasta 5';
    end if;
    if exists (select 1 from jsonb_array_elements(p_val->'puntos') e
               where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 220) then
      raise exception 'contexto: cada punto es un texto de hasta 220';
    end if;
  end if;

  v := p_val || jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  update public.clientes
     set maquina = jsonb_set(coalesce(maquina, '{}'::jsonb), '{contexto}', v, true)
   where id = p_id;
  if not found then raise exception 'contexto: no existe el cliente %', p_id; end if;
end;
$$;

revoke all on function public.set_contexto(bigint, jsonb) from public;
grant execute on function public.set_contexto(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
