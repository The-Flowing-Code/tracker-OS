-- 066 · Renovación completa: lo que faltaba de la hoja «Cobros low ticket» y la
--       propuesta de la rutina (Angie, 24/11/2026)
--
-- POR QUE
-- La 065 trajo el estado, la cuota y las notas. Faltaban «Ocupa cupo» de cada
-- partner y los números de arriba de la hoja (meta mensual neta, comisión de
-- Stripe, cupos por grupal, sprints). Y la rutina C1 · Cierre del día suma a la
-- nota lo que el partner dijo por WhatsApp, pero el estado lo decide una persona:
-- si la rutina cree que cambió, lo deja como propuesta.
--
-- QUE CAMBIA
--   maquina.renovacion admite además:
--     cupo       true si ocupa un cupo de la grupal de Martín
--     propuesta  {estado, motivo, fecha, por} | null: lo que propone la rutina;
--                se acepta o se descarta en Rentabilidad
--   ajustes (tabla nueva, clave → valor): 'renovacion' guarda
--     {cuota, meta_neta, stripe, cupos, sprint_precio, sprints_mes, por, at}
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_ajuste(text, jsonb);
--   drop table if exists public.ajustes;
--   (y volver a correr la 065 para set_renovacion)

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
    if k not in ('estado','cuota','cobrar','cupo','dijo','nota','por','at','propuesta') then
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
  if p_val ? 'cupo' and jsonb_typeof(p_val->'cupo') <> 'boolean' then
    raise exception 'set_renovacion: cupo tiene que ser true o false';
  end if;
  if p_val ? 'at' and coalesce(p_val->>'at','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'set_renovacion: at AAAA-MM-DD';
  end if;
  if p_val ? 'propuesta' and jsonb_typeof(p_val->'propuesta') <> 'null' then
    if jsonb_typeof(p_val->'propuesta') <> 'object'
       or coalesce(p_val->'propuesta'->>'estado','') not in
          ('si','si_cuidado','probable','solo_si_vende','porcentaje','sin_datos','no')
       or length(coalesce(p_val->'propuesta'->>'motivo','')) > 300 then
      raise exception 'set_renovacion: propuesta {estado válido, motivo hasta 300, fecha, por} o null';
    end if;
  end if;
  if length(coalesce(p_val->>'dijo','')) > 300 or length(coalesce(p_val->>'nota','')) > 1500
     or length(coalesce(p_val->>'por','')) > 60 then
    raise exception 'set_renovacion: dijo hasta 300, nota hasta 1500, por hasta 60';
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

create table if not exists public.ajustes (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  actualizado_at timestamptz not null default now()
);
alter table public.ajustes enable row level security;
drop policy if exists ajustes_leer on public.ajustes;
create policy ajustes_leer on public.ajustes for select to authenticated using (public.es_agencia());

create or replace function public.set_ajuste(p_clave text, p_val jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_new jsonb;
begin
  if auth.role() <> 'service_role' and not public.es_agencia() then
    raise exception 'set_ajuste: solo el equipo';
  end if;
  if p_clave not in ('renovacion') then
    raise exception 'set_ajuste: clave no permitida %', p_clave;
  end if;
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
    raise exception 'set_ajuste: p_val tiene que ser un objeto';
  end if;
  insert into public.ajustes(clave, valor) values (p_clave, p_val)
  on conflict (clave) do update set valor = public.ajustes.valor || excluded.valor, actualizado_at = now()
  returning valor into v_new;
  return v_new;
end $$;
revoke all on function public.set_ajuste(text, jsonb) from public;
grant execute on function public.set_ajuste(text, jsonb) to service_role, authenticated;
notify pgrst, 'reload schema';
