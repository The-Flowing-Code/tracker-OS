-- 062 · La métrica que manda de cada cliente (Angie, 23/11/2026)
--
-- POR QUE
-- «En realidad nos importa el costo de adquisición, pero como muchos no lo tienen
-- validado lo bajamos a agendas / agendas en vivo / leads calificados, dependiendo
-- de cuál fue la victoria mayor del cliente.» Cada cliente tiene un escalón que
-- manda y un costo de base. Lo leen el reporte diario (M1), las alertas (M3) y el
-- reporte del lunes (S1), en cualquier compu: por eso vive en el tracker.
--
-- QUE GUARDA (maquina.metrica)
--   escalon  venta | en_vivo | agenda | calificado
--   base     costo de referencia, en la moneda del cliente (> 0)
--   desde    AAAA-MM-DD: desde cuándo rige esa base
--   por      quién la eligió o la confirmó
--   nota     una línea: por qué ese escalón
--   actual   {costo, casos, desde, hasta, fecha}: lo calcula M1 cada mañana
--   propuesta true mientras nadie la confirmó
-- Se manda solo lo que cambia: el resto queda como estaba.
--
-- QUIEN ESCRIBE
--   service_role (las rutinas) y la agencia desde la app (es_agencia()).
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_metrica(bigint, jsonb);
--   update public.clientes set maquina = maquina - 'metrica';

create or replace function public.set_metrica(p_id bigint, p_val jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old jsonb; v_new jsonb; k text;
begin
  if auth.role() <> 'service_role' and not public.es_agencia() then
    raise exception 'set_metrica: solo el equipo';
  end if;
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
    raise exception 'set_metrica: p_val tiene que ser un objeto';
  end if;
  for k in select jsonb_object_keys(p_val) loop
    if k not in ('escalon','base','desde','por','nota','actual','propuesta') then
      raise exception 'set_metrica: clave no permitida %', k;
    end if;
  end loop;
  if p_val ? 'escalon' and p_val->>'escalon' not in ('venta','en_vivo','agenda','calificado') then
    raise exception 'set_metrica: escalon tiene que ser venta, en_vivo, agenda o calificado';
  end if;
  if p_val ? 'base' and (jsonb_typeof(p_val->'base') <> 'number' or (p_val->>'base')::numeric <= 0) then
    raise exception 'set_metrica: base tiene que ser un número mayor a 0';
  end if;
  if p_val ? 'desde' and coalesce(p_val->>'desde','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'set_metrica: desde AAAA-MM-DD';
  end if;
  if length(coalesce(p_val->>'por','')) > 60 or length(coalesce(p_val->>'nota','')) > 300 then
    raise exception 'set_metrica: por hasta 60 y nota hasta 300';
  end if;
  if p_val ? 'actual' and jsonb_typeof(p_val->'actual') not in ('object','null') then
    raise exception 'set_metrica: actual tiene que ser un objeto';
  end if;
  select coalesce(maquina->'metrica','{}'::jsonb) into v_old from public.clientes where id = p_id;
  if not found then raise exception 'set_metrica: no existe el cliente %', p_id; end if;
  v_new := v_old || p_val;
  update public.clientes set maquina = jsonb_set(coalesce(maquina,'{}'::jsonb), '{metrica}', v_new, true)
   where id = p_id;
  return v_new;
end $$;
revoke all on function public.set_metrica(bigint, jsonb) from public;
grant execute on function public.set_metrica(bigint, jsonb) to service_role, authenticated;
notify pgrst, 'reload schema';
