-- 043 · El EOD del dia, para la pantalla «Buenas noches»
--
-- POR QUE (Angie, 19/10/2026)
-- La pantalla del cierre del dia solo sabia lo que la app guarda (tickets
-- tildados, llamadas de Fathom) y decia «hoy no hiciste nada» aunque se hubiera
-- trabajado todo el dia en GHL, Meta y el chat. La rutina `revision-pendientes-cierre`
-- arma un EOD a grandes rasgos; esta funcion lo deja donde la app lo lee.
--
-- Va en `maquina.eod` del cliente interno (Evolve), como `cambiosPropuestos`:
-- lo escribe una maquina y se pisa con el del dia siguiente. No lleva datos de
-- clientes mas alla del nombre y de una linea de lo que se hizo.

create or replace function public.set_eod(
  p_id  bigint,
  p_eod jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_x jsonb;
begin
  if p_eod is null or jsonb_typeof(p_eod) <> 'object' then
    raise exception 'eod: p_eod tiene que ser un objeto';
  end if;
  if coalesce(p_eod->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'eod: falta fecha AAAA-MM-DD';
  end if;
  if jsonb_typeof(coalesce(p_eod->'lineas','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_eod->'lineas','[]'::jsonb)) > 12 then
    raise exception 'eod: lineas tiene que ser una lista de hasta 12';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(p_eod->'lineas','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'object' or coalesce(length(btrim(v_x->>'texto')),0) = 0
       or length(v_x->>'texto') > 300 or length(coalesce(v_x->>'cliente','')) > 80 then
      raise exception 'eod: cada linea necesita texto (hasta 300) y cliente opcional (hasta 80)';
    end if;
  end loop;
  if jsonb_typeof(coalesce(p_eod->'manana','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_eod->'manana','[]'::jsonb)) > 6
     or jsonb_typeof(coalesce(p_eod->'esperando','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_eod->'esperando','[]'::jsonb)) > 8 then
    raise exception 'eod: manana hasta 6 textos y esperando hasta 8';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(p_eod->'manana','[]'::jsonb) || coalesce(p_eod->'esperando','[]'::jsonb)) loop
    if jsonb_typeof(v_x) <> 'string' or length(v_x #>> '{}') > 200 then
      raise exception 'eod: manana y esperando son listas de textos de hasta 200 caracteres';
    end if;
  end loop;

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina, '{}'::jsonb), '{eod}',
                     jsonb_build_object(
                       'at',        to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'fecha',     p_eod->>'fecha',
                       'lineas',    coalesce(p_eod->'lineas','[]'::jsonb),
                       'manana',    coalesce(p_eod->'manana','[]'::jsonb),
                       'esperando', coalesce(p_eod->'esperando','[]'::jsonb)),
                     true)
   where id = p_id;

  if not found then
    raise exception 'eod: no existe el cliente %', p_id;
  end if;
end;
$$;

revoke all on function public.set_eod(bigint, jsonb) from public;
grant execute on function public.set_eod(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (desde la rutina de cierre)
--   ./sbw POST "rpc/set_eod" '{"p_id":1787605845151,"p_eod":{"fecha":"2026-10-19",
--     "lineas":[{"cliente":"Goltia","texto":"Landing nueva al 100%…"}],
--     "manana":["…"],"esperando":["…"]}}'
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_eod(bigint, jsonb);
--   El campo `maquina.eod` que ya se escribio queda; la app lo ignora si la
--   clave no esta en CLAVES_MAQUINA.
