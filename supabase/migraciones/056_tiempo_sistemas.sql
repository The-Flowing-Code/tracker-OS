-- 056 · El tiempo del equipo suma «sistemas y procesos» (Angie, 11/11/2026)
--
-- POR QUE
-- A la rueda le faltaba lo interno: la web app, las skills, las herramientas y
-- los procesos. Si iba mezclado con «cambios e implementación», no se veía
-- cuánto del tiempo es para los partners y cuánto para nosotros. Es la misma
-- funcion de la 055 con un tipo mas, `sistemas`; lo demas no cambia.

create or replace function public.set_tiempo_dias(
  p_id      bigint,
  p_persona text,
  p_dias    jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_x      jsonb;
  v_t      text;
  v_fechas text[] := '{}';
  v_nuevos jsonb := '[]'::jsonb;
  v_viejos jsonb;
  v_corte  text := to_char((now() at time zone 'America/Argentina/Buenos_Aires') - interval '120 days', 'YYYY-MM-DD');
begin
  if coalesce(p_persona,'') !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'tiempo: persona invalida (minusculas, 2 a 40)';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) > 31 then
    raise exception 'tiempo: p_dias tiene que ser una lista de hasta 31 dias';
  end if;
  for v_x in select * from jsonb_array_elements(p_dias) loop
    if jsonb_typeof(v_x) <> 'object' or coalesce(v_x->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'tiempo: cada dia necesita fecha AAAA-MM-DD';
    end if;
    if (v_x->>'fecha') = any(v_fechas) then
      raise exception 'tiempo: el dia % viene dos veces', v_x->>'fecha';
    end if;
    foreach v_t in array array['estrategia','optimizacion','implementacion','sistemas','sin_clasificar'] loop
      if jsonb_typeof(coalesce(v_x->v_t,'0'::jsonb)) <> 'number'
         or (v_x->>v_t)::numeric < 0 or (v_x->>v_t)::numeric > 1440 then
        raise exception 'tiempo: % del % tiene que ser minutos entre 0 y 1440', v_t, v_x->>'fecha';
      end if;
    end loop;
    v_fechas := v_fechas || (v_x->>'fecha');
    v_nuevos := v_nuevos || jsonb_build_array(jsonb_build_object(
      'persona', p_persona, 'fecha', v_x->>'fecha',
      'estrategia',     round(coalesce((v_x->>'estrategia')::numeric,0)),
      'optimizacion',   round(coalesce((v_x->>'optimizacion')::numeric,0)),
      'implementacion', round(coalesce((v_x->>'implementacion')::numeric,0)),
      'sistemas',       round(coalesce((v_x->>'sistemas')::numeric,0)),
      'sin_clasificar', round(coalesce((v_x->>'sin_clasificar')::numeric,0)),
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  end loop;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_viejos
    from public.clientes c,
         jsonb_array_elements(coalesce(c.maquina->'tiempoEquipo'->'dias','[]'::jsonb)) x
   where c.id = p_id
     and x->>'fecha' >= v_corte
     and not (x->>'persona' = p_persona and (x->>'fecha') = any(v_fechas));

  update public.clientes
     set maquina = jsonb_set(coalesce(maquina, '{}'::jsonb), '{tiempoEquipo}',
                     jsonb_build_object(
                       'at',   to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'dias', v_viejos || v_nuevos),
                     true)
   where id = p_id;
  if not found then
    raise exception 'tiempo: no existe el cliente %', p_id;
  end if;
  return jsonb_array_length(v_nuevos);
end;
$$;

revoke all on function public.set_tiempo_dias(bigint, text, jsonb) from public;
grant execute on function public.set_tiempo_dias(bigint, text, jsonb) to service_role;

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS
--   Correr de nuevo la 055: vuelve la funcion de cuatro tipos. Los dias que ya
--   traen `sistemas` lo conservan; la app de antes no lo dibuja.
