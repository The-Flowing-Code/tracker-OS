-- 045 · El Claude del equipo puede crear y cerrar tareas (Angie, 20/10/2026)
--
-- POR QUE
-- El conector «Evolve OS · consulta» (040) era de solo lectura, con una unica
-- escritura: pedir_cambio_app. Santi, que es el CSM, necesita cargar tareas y
-- marcar tickets como hechos desde su Claude. Se hace sin darle escritura libre
-- sobre `datos`: dos funciones que SOLO suman a una lista, de forma atomica.
--
--  · add_cambio_propuesto: suma UN item a maquina.cambiosPropuestos (el mismo
--    camino de las rutinas: con crear:'ticket' la app lo vuelve ticket sola).
--    Atomico y sin pisar: dos que escriben a la vez no se borran entre si.
--  · add_accion_ticket: suma una accion (cerrar o reabrir un ticket por su
--    numero) a maquina.accionesTickets. La app la aplica una sola vez.
--
-- Solo las llama la funcion evolve-mcp (service_role), y solo para claves con
-- alcance.tareas = 'escribir'. Cada llamada queda en mcp_registro.

create or replace function public.add_cambio_propuesto(p_id bigint, p_item jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'add_cambio_propuesto: p_item tiene que ser un objeto';
  end if;
  if coalesce(p_item->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'add_cambio_propuesto: id invalido';
  end if;
  if coalesce(length(btrim(p_item->>'texto')),0) = 0 or length(p_item->>'texto') > 200 then
    raise exception 'add_cambio_propuesto: texto hasta 200 caracteres';
  end if;
  if length(coalesce(p_item->>'porque','')) > 400 or length(coalesce(p_item->>'responsable','')) > 80 then
    raise exception 'add_cambio_propuesto: porque hasta 400 y responsable hasta 80';
  end if;
  if coalesce(p_item->>'vence','') <> '' and p_item->>'vence' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'add_cambio_propuesto: vence AAAA-MM-DD';
  end if;
  if coalesce(p_item->>'crear','') not in ('', 'ticket') then
    raise exception 'add_cambio_propuesto: crear solo puede ser ticket';
  end if;

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina,'{}'::jsonb), '{cambiosPropuestos}',
                     jsonb_build_object(
                       'at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'items', coalesce(maquina->'cambiosPropuestos'->'items','[]'::jsonb) || jsonb_build_array(p_item)),
                     true)
   where id = p_id
     and jsonb_array_length(coalesce(maquina->'cambiosPropuestos'->'items','[]'::jsonb)) < 60
     and not exists (select 1 from jsonb_array_elements(coalesce(maquina->'cambiosPropuestos'->'items','[]'::jsonb)) x
                      where x->>'id' = p_item->>'id');
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.add_accion_ticket(p_id bigint, p_accion jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if p_accion is null or jsonb_typeof(p_accion) <> 'object' then
    raise exception 'add_accion_ticket: p_accion tiene que ser un objeto';
  end if;
  if coalesce(p_accion->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'add_accion_ticket: id invalido';
  end if;
  if coalesce(p_accion->>'accion','') not in ('cerrar','reabrir') then
    raise exception 'add_accion_ticket: accion cerrar o reabrir';
  end if;
  if coalesce(p_accion->>'ticket','') !~ '^#\d{1,7}$' then
    raise exception 'add_accion_ticket: ticket con el formato #123';
  end if;
  if length(coalesce(p_accion->>'por','')) > 80 or length(coalesce(p_accion->>'nota','')) > 200 then
    raise exception 'add_accion_ticket: por hasta 80 y nota hasta 200';
  end if;

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina,'{}'::jsonb), '{accionesTickets}',
                     jsonb_build_object(
                       'at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'items', (select coalesce(jsonb_agg(e order by n),'[]'::jsonb) from (
                                   select e, n from jsonb_array_elements(
                                     coalesce(maquina->'accionesTickets'->'items','[]'::jsonb) || jsonb_build_array(p_accion))
                                   with ordinality t(e,n) order by n desc limit 100) q)),
                     true)
   where id = p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.add_cambio_propuesto(bigint, jsonb) from public;
revoke all on function public.add_accion_ticket(bigint, jsonb) from public;
grant execute on function public.add_cambio_propuesto(bigint, jsonb) to service_role;
grant execute on function public.add_accion_ticket(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE DA O SE QUITA EL PERMISO
--   sbw PATCH "mcp_claves?id=eq.<id>" '{"alcance": {...el que ya tenia..., "tareas": "escribir"}}'
--   Quitar "tareas" (o ponerlo en otra cosa) apaga las dos herramientas para esa clave.
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.add_cambio_propuesto(bigint, jsonb);
--   drop function if exists public.add_accion_ticket(bigint, jsonb);
