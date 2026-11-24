-- 065 · La posibilidad de renovación de cada cliente (Angie, 24/11/2026)
--
-- POR QUE
-- «Me serviría saber las posibilidades de renovación que veníamos trabajando…
-- pero que sea directo desde acá.» Se trabajaba en el artifact «Cobros low
-- ticket» (17-20/11): por partner, un estado (Sí, Sí con cuidado, Solo si vende,
-- No por ahora…), la cuota, si suma a la meta, lo que dijo en la llamada y lo
-- que pasó después. Ahora vive en el tracker y se cambia en Rentabilidad.
--
-- QUE GUARDA (maquina.renovacion)
--   estado  si | si_cuidado | probable | solo_si_vende | porcentaje | sin_datos | no
--   cuota   USD por mes que se le propone (número >= 0) o null
--   cobrar  true si suma a la meta del mes
--   dijo    lo que dijo en la llamada (hasta 300)
--   nota    la lectura del equipo y lo que pasó después (hasta 500)
--   por     quién lo cambió
--   at      AAAA-MM-DD de la última edición
-- Se manda solo lo que cambia: el resto queda como estaba.
--
-- QUIEN ESCRIBE
--   service_role y la agencia desde la app (es_agencia()).
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_renovacion(bigint, jsonb);
--   update public.clientes set maquina = maquina - 'renovacion';

create or replace function public.set_renovacion(p_id bigint, p_val jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old jsonb; v_new jsonb; k text;
begin
  if auth.role() <> 'service_role' and not public.es_agencia() then
    raise exception 'set_renovacion: solo el equipo';
  end if;
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
    raise exception 'set_renovacion: p_val tiene que ser un objeto';
  end if;
  for k in select jsonb_object_keys(p_val) loop
    if k not in ('estado','cuota','cobrar','dijo','nota','por','at') then
      raise exception 'set_renovacion: clave no permitida %', k;
    end if;
  end loop;
  if p_val ? 'estado' and p_val->>'estado' not in
     ('si','si_cuidado','probable','solo_si_vende','porcentaje','sin_datos','no') then
    raise exception 'set_renovacion: estado no válido';
  end if;
  if p_val ? 'cuota' and jsonb_typeof(p_val->'cuota') <> 'null'
     and (jsonb_typeof(p_val->'cuota') <> 'number' or (p_val->>'cuota')::numeric < 0) then
    raise exception 'set_renovacion: cuota tiene que ser un número >= 0 o null';
  end if;
  if p_val ? 'cobrar' and jsonb_typeof(p_val->'cobrar') <> 'boolean' then
    raise exception 'set_renovacion: cobrar tiene que ser true o false';
  end if;
  if p_val ? 'at' and coalesce(p_val->>'at','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'set_renovacion: at AAAA-MM-DD';
  end if;
  if length(coalesce(p_val->>'dijo','')) > 300 or length(coalesce(p_val->>'nota','')) > 500
     or length(coalesce(p_val->>'por','')) > 60 then
    raise exception 'set_renovacion: dijo hasta 300, nota hasta 500, por hasta 60';
  end if;
  select coalesce(maquina->'renovacion','{}'::jsonb) into v_old from public.clientes where id = p_id;
  if not found then raise exception 'set_renovacion: no existe el cliente %', p_id; end if;
  v_new := v_old || p_val;
  update public.clientes set maquina = jsonb_set(coalesce(maquina,'{}'::jsonb), '{renovacion}', v_new, true)
   where id = p_id;
  return v_new;
end $$;
revoke all on function public.set_renovacion(bigint, jsonb) from public;
grant execute on function public.set_renovacion(bigint, jsonb) to service_role, authenticated;
notify pgrst, 'reload schema';
