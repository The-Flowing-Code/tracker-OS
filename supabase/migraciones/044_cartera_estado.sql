-- 044 · Como van los clientes, para el «buen dia»
--
-- POR QUE (Angie, 20/10/2026)
-- La tarjeta «Vienen bien» del buen dia solo dice que ninguna regla de alarma
-- salto: PlayWith figuraba «bien» con 10 registros y cero agendas, y con un pago
-- pendiente en Meta. El reporte de campañas ya lee registros, costo, calificados
-- y agendas de cada cliente; esta funcion deja su lectura donde la app la ve:
-- dos listas, las que van bien y las que no.
--
-- Va en `maquina.carteraEstado` del cliente interno (Evolve), como `eod`: la
-- escribe una maquina cada mañana y se pisa con la del dia siguiente.

create or replace function public.set_cartera_estado(
  p_id     bigint,
  p_estado jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_x jsonb;
begin
  if p_estado is null or jsonb_typeof(p_estado) <> 'object' then
    raise exception 'carteraEstado: p_estado tiene que ser un objeto';
  end if;
  if coalesce(p_estado->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'carteraEstado: falta fecha AAAA-MM-DD';
  end if;
  if jsonb_typeof(coalesce(p_estado->'bien','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_estado->'mal','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_estado->'bien','[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_estado->'mal','[]'::jsonb)) > 20 then
    raise exception 'carteraEstado: bien y mal son listas de hasta 20';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(p_estado->'bien','[]'::jsonb) || coalesce(p_estado->'mal','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'object' or coalesce(length(btrim(v_x->>'cliente')),0) = 0
       or length(v_x->>'cliente') > 80
       or length(coalesce(v_x->>'numeros','')) > 300
       or length(coalesce(v_x->>'lectura','')) > 300
       or length(coalesce(v_x->>'motivo','')) > 300 then
      raise exception 'carteraEstado: cada cliente necesita nombre (hasta 80) y textos de hasta 300';
    end if;
  end loop;

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina, '{}'::jsonb), '{carteraEstado}',
                     jsonb_build_object(
                       'at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'fecha', p_estado->>'fecha',
                       'bien',  coalesce(p_estado->'bien','[]'::jsonb),
                       'mal',   coalesce(p_estado->'mal','[]'::jsonb)),
                     true)
   where id = p_id;

  if not found then
    raise exception 'carteraEstado: no existe el cliente %', p_id;
  end if;
end;
$$;

revoke all on function public.set_cartera_estado(bigint, jsonb) from public;
grant execute on function public.set_cartera_estado(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (desde el reporte de campañas)
--   ./sbw POST "rpc/set_cartera_estado" '{"p_id":1787605845151,"p_estado":{"fecha":"2026-10-20",
--     "bien":[{"cliente":"Martín Oyola","numeros":"19 registros a USD 4,6…","lectura":"Bien."}],
--     "mal":[{"cliente":"PlayWith","motivo":"10 registros y 0 agendas"}]}}'
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_cartera_estado(bigint, jsonb);
