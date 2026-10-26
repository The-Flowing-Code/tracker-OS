-- 051 · Lo hecho queda a la vista y cierra sus tickets (Angie, 19/10/2026; aprobado 26/10/2026)
--
-- POR QUE
-- Pedidos 3 y 6 de «Mandar al agente»:
--  · La rutina revision-pendientes-* verifica que una sugerencia ya está hecha
--    y la saca de cambiosPropuestos, pero la app no se enteraba: desaparecía sin
--    rastro y el ticket que había salido de ella seguía abierto.
--  · Lo que se hace con Claude en el chat para un cliente no dejaba ticket, así
--    que «Buenas noches» contaba 0 cerrados aunque se hubiera hecho mucho.
--
-- Un solo canal para los dos: maquina.hechos = {at, items:[...]}. Las rutinas y
-- Claude SUMAN ítems con agregar_hechos; la app (js/avisos.js) los lee:
--  · si el hecho es de un ticket abierto (taskId, ticket o desdeCambio), lo cierra;
--  · si no hay ticket que lo represente, crea uno ya cerrado (para que cuente);
--  · el Dashboard los lista en «Hechos» con la evidencia y la fecha.
--
-- Ítem: {id, texto, evidencia?, fecha AAAA-MM-DD, taskId?, ticket? '#123',
--        origen? 'rutina'|'claude', por?, corrida?}
-- Se agrega sin pisar (atómico): si el id ya está, el nuevo reemplaza al viejo.
-- Se guardan los de los últimos 30 días, hasta 200.
-- Solo service_role (rutinas y Claude con la key del Llavero).

create or replace function public.agregar_hechos(p_id bigint, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_it jsonb;
  v_n int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'agregar_hechos: p_items tiene que ser una lista con al menos un ítem';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'agregar_hechos: hasta 100 ítems por llamada';
  end if;

  for v_it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_it) <> 'object' then
      raise exception 'agregar_hechos: cada ítem tiene que ser un objeto';
    end if;
    if coalesce(v_it->>'id','') !~ '^[A-Za-z0-9_.:-]{1,100}$' then
      raise exception 'agregar_hechos: id inválido (%)', v_it->>'id';
    end if;
    if length(coalesce(v_it->>'texto','')) not between 1 and 200 then
      raise exception 'agregar_hechos: texto de 1 a 200 caracteres (%)', v_it->>'id';
    end if;
    if length(coalesce(v_it->>'evidencia','')) > 300 then
      raise exception 'agregar_hechos: evidencia hasta 300 (%)', v_it->>'id';
    end if;
    if coalesce(v_it->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'agregar_hechos: fecha AAAA-MM-DD (%)', v_it->>'id';
    end if;
    if v_it ? 'ticket' and coalesce(v_it->>'ticket','') !~ '^#\d{1,7}$' then
      raise exception 'agregar_hechos: ticket con el formato #123 (%)', v_it->>'id';
    end if;
    if v_it ? 'taskId' and coalesce(v_it->>'taskId','') !~ '^[0-9]{1,20}$' then
      raise exception 'agregar_hechos: taskId numérico (%)', v_it->>'id';
    end if;
    if v_it ? 'origen' and coalesce(v_it->>'origen','') not in ('rutina','claude') then
      raise exception 'agregar_hechos: origen rutina o claude (%)', v_it->>'id';
    end if;
    if length(coalesce(v_it->>'por','')) > 120 or length(coalesce(v_it->>'corrida','')) > 40 then
      raise exception 'agregar_hechos: por hasta 120 y corrida hasta 40 (%)', v_it->>'id';
    end if;
  end loop;

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina,'{}'::jsonb), '{hechos}',
                     jsonb_build_object(
                       'at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'items', (
                         select coalesce(jsonb_agg(e order by e->>'fecha' desc, n desc), '[]'::jsonb) from (
                           select e, n from (
                             -- los nuevos primero: ganan si repiten id
                             select distinct on (e->>'id') e, n from (
                               select e, 1000000 + n as n from jsonb_array_elements(p_items) with ordinality a(e,n)
                               union all
                               select e, n from jsonb_array_elements(
                                 coalesce(maquina->'hechos'->'items','[]'::jsonb)) with ordinality b(e,n)
                             ) u
                             order by e->>'id', n desc
                           ) d
                           where (e->>'fecha')::date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30
                           order by e->>'fecha' desc, n desc
                           limit 200
                         ) q)),
                     true)
   where id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'agregar_hechos: no existe el cliente %', p_id;
  end if;
  return jsonb_array_length(p_items);
end;
$$;

revoke all on function public.agregar_hechos(bigint, jsonb) from public;
grant execute on function public.agregar_hechos(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (rutinas y Claude, con la key del Llavero)
--   sbw POST "rpc/agregar_hechos" '{"p_id": <cliente>, "p_items": [{"id":"...", "texto":"...",
--        "evidencia":"...", "fecha":"2026-10-26", "taskId":"1760...", "origen":"claude", "por":"angie"}]}'
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.agregar_hechos(bigint, jsonb);
--   La clave maquina.hechos queda inerte; la app deja de usarla si se saca
--   hechosACerrar/hechosATickets de js/avisos.js.
