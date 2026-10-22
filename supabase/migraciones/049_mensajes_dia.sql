-- 049 · Mensajes armados para mandar a los clientes, en el «buen dia»
--
-- POR QUE (Angie, 22/10/2026)
-- «¿Me podés dejar mensajes armados de los que tenga que mandar en el día para
-- los clientes?». Las rutinas de vigilancia (048) ya saben qué cliente espera
-- respuesta, qué prometimos y qué leads no contactó el cliente; ahora además
-- redactan el mensaje, con el tono de la casa, y lo dejan para copiar.
--
-- Va en `maquina.mensajesDia` del cliente interno (Evolve), una entrada por
-- fuente ('leads' o 'whatsapp'), igual que `vigilancia`: la escribe una rutina
-- y se pisa con la corrida siguiente de la misma fuente. La app no manda nada:
-- muestra el texto y un botón para copiarlo.

create or replace function public.set_mensajes_dia(
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
    raise exception 'mensajesDia: p_parte tiene que ser un objeto';
  end if;
  v_fuente := p_parte->>'fuente';
  if v_fuente is null or v_fuente not in ('leads','whatsapp') then
    raise exception 'mensajesDia: fuente tiene que ser leads o whatsapp';
  end if;
  if coalesce(p_parte->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'mensajesDia: falta fecha AAAA-MM-DD (el día en que se mandan)';
  end if;
  if jsonb_typeof(coalesce(p_parte->'mensajes','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_parte->'mensajes','[]'::jsonb)) > 20 then
    raise exception 'mensajesDia: mensajes es una lista de hasta 20';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(p_parte->'mensajes','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'object'
       or coalesce(length(btrim(v_x->>'texto')),0) = 0 or length(v_x->>'texto') > 1500
       or coalesce(length(btrim(v_x->>'cliente')),0) = 0 or length(v_x->>'cliente') > 80
       or length(coalesce(v_x->>'donde','')) > 120
       or length(coalesce(v_x->>'motivo','')) > 250
       or length(coalesce(v_x->>'quien','')) > 40 then
      raise exception 'mensajesDia: cada mensaje necesita cliente (hasta 80) y texto (hasta 1500); donde hasta 120, motivo hasta 250, quien hasta 40';
    end if;
  end loop;

  update public.clientes
     set maquina = jsonb_set(
                     jsonb_set(coalesce(maquina, '{}'::jsonb), '{mensajesDia}',
                               coalesce(maquina->'mensajesDia', '{}'::jsonb), true),
                     array['mensajesDia', v_fuente],
                     jsonb_build_object(
                       'at',       to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'fecha',    p_parte->>'fecha',
                       'mensajes', coalesce(p_parte->'mensajes','[]'::jsonb)),
                     true)
   where id = p_id;

  if not found then
    raise exception 'mensajesDia: no existe el cliente %', p_id;
  end if;
end;
$$;

revoke all on function public.set_mensajes_dia(bigint, jsonb) from public;
grant execute on function public.set_mensajes_dia(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (desde las rutinas)
--   ./sbw POST "rpc/set_mensajes_dia" '{"p_id":1787605845151,"p_parte":{"fuente":"leads","fecha":"2026-10-23",
--     "mensajes":[{"cliente":"Sygemat","donde":"grupo «Sygemat <> Software Partner (NUEVO)»","quien":"Angie",
--       "motivo":"Entraron 2 leads de la campaña nueva y nadie les escribió","texto":"Hola Nacho, ¿cómo estás? …"}]}}'
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_mensajes_dia(bigint, jsonb);
--   update public.clientes set maquina = maquina - 'mensajesDia' where id = 1787605845151;
