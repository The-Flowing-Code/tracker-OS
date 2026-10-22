-- 048 · Lo que vigilan las rutinas, para el «buen dia» y el «buenas noches»
--
-- POR QUE (Angie, 22/10/2026)
-- Dos rutinas nuevas miran el resultado del trabajo con los leads y los clientes:
--   · «Leads sin mensaje 1 y conversaciones del día» (8:35 y 18:35): si cada lead
--     nuevo recibió el primer WhatsApp/SMS, quién espera respuesta, quién
--     contestó y no agendó.
--   · «Parte de WhatsApp: clientes y equipo» (18:45): lo que espera respuesta en
--     los grupos de clientes, lo que prometimos y los problemas que se repiten.
-- El 21/10 una rutina detectó dos plantillas aprobadas y nadie las conectó: el
-- aviso quedó en un archivo. Angie quiere verlo en el buen dia y el buenas
-- noches, donde mira todos los dias.
--
-- Va en `maquina.vigilancia` del cliente interno (Evolve), una entrada por
-- fuente ('leads' o 'whatsapp'), como `eod` y `carteraEstado`: la escribe una
-- maquina y se pisa con la corrida siguiente de la misma fuente.

create or replace function public.set_vigilancia(
  p_id    bigint,
  p_parte jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fuente text;
  v_x jsonb;
begin
  if p_parte is null or jsonb_typeof(p_parte) <> 'object' then
    raise exception 'vigilancia: p_parte tiene que ser un objeto';
  end if;
  v_fuente := p_parte->>'fuente';
  if v_fuente is null or v_fuente not in ('leads','whatsapp') then
    raise exception 'vigilancia: fuente tiene que ser leads o whatsapp';
  end if;
  if coalesce(p_parte->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'vigilancia: falta fecha AAAA-MM-DD';
  end if;
  if coalesce(p_parte->>'momento','') not in ('manana','noche') then
    raise exception 'vigilancia: momento tiene que ser manana o noche';
  end if;
  if jsonb_typeof(coalesce(p_parte->'items','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_parte->'items','[]'::jsonb)) > 30
     or jsonb_typeof(coalesce(p_parte->'recurrentes','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_parte->'recurrentes','[]'::jsonb)) > 10 then
    raise exception 'vigilancia: items hasta 30 y recurrentes hasta 10';
  end if;
  if length(coalesce(p_parte->>'resumen','')) > 400 then
    raise exception 'vigilancia: resumen de hasta 400';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(p_parte->'items','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'object'
       or coalesce(length(btrim(v_x->>'texto')),0) = 0 or length(v_x->>'texto') > 300
       or length(coalesce(v_x->>'cliente','')) > 80
       or coalesce(v_x->>'tipo','') not in ('sin_mensaje','fallo','tarde','espera','no_agendo','sin_seguimiento','prometido','riesgo','otro') then
      raise exception 'vigilancia: cada item necesita texto (hasta 300), cliente (hasta 80) y un tipo valido';
    end if;
  end loop;
  for v_x in select * from jsonb_array_elements(coalesce(p_parte->'recurrentes','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'object'
       or coalesce(length(btrim(v_x->>'problema')),0) = 0 or length(v_x->>'problema') > 200
       or length(coalesce(v_x->>'clientes','')) > 200 then
      raise exception 'vigilancia: cada recurrente necesita problema (hasta 200) y clientes (hasta 200)';
    end if;
  end loop;

  update public.clientes
     set maquina = jsonb_set(
                     jsonb_set(coalesce(maquina, '{}'::jsonb), '{vigilancia}',
                               coalesce(maquina->'vigilancia', '{}'::jsonb), true),
                     array['vigilancia', v_fuente],
                     jsonb_build_object(
                       'at',          to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'fecha',       p_parte->>'fecha',
                       'momento',     p_parte->>'momento',
                       'resumen',     coalesce(p_parte->>'resumen',''),
                       'items',       coalesce(p_parte->'items','[]'::jsonb),
                       'recurrentes', coalesce(p_parte->'recurrentes','[]'::jsonb)),
                     true)
   where id = p_id;

  if not found then
    raise exception 'vigilancia: no existe el cliente %', p_id;
  end if;
end;
$$;

revoke all on function public.set_vigilancia(bigint, jsonb) from public;
grant execute on function public.set_vigilancia(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (desde las rutinas)
--   ./sbw POST "rpc/set_vigilancia" '{"p_id":1787605845151,"p_parte":{"fuente":"leads",
--     "fecha":"2026-10-23","momento":"manana","resumen":"2 leads sin mensaje 1 en Sygemat",
--     "items":[{"cliente":"Sygemat","tipo":"sin_mensaje","texto":"Fer Gómez: el SMS falla (sin SMS en la subcuenta)"}],
--     "recurrentes":[]}}'
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_vigilancia(bigint, jsonb);
--   update public.clientes set maquina = maquina - 'vigilancia' where id = 1787605845151;
