-- 064 · El latido de las rutinas (Angie, 23/11/2026)
--
-- POR QUE
-- «Que el sistema esté blindado»: hoy, si la Mac está dormida o una rutina falla,
-- nadie se entera. Cada corrida deja una fila: qué rutina, en qué compu, cómo
-- terminó y a cuántos cubrió de cuántos debía (la «cobertura a la vista»).
-- M3 · Alertas lee las últimas corridas y avisa la que no corrió cuando debía.
--
-- QUE HAY
-- - rutinas_corridas: una fila por corrida. Nadie la lee ni la escribe directo.
-- - registrar_corrida(...): la usan las rutinas al terminar (service_role) y la
--   agencia desde la app o el conector.
-- - ultimas_corridas(dias): la última corrida de cada rutina y cuántas hubo, para
--   M3 y para la app.
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.registrar_corrida(text,text,text,int,int,text);
--   drop function if exists public.ultimas_corridas(int);
--   drop table if exists public.rutinas_corridas;

create table if not exists public.rutinas_corridas (
  id        bigserial primary key,
  rutina    text not null check (rutina ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  compu     text not null check (length(compu) between 1 and 40),
  estado    text not null check (estado in ('ok','parcial','fallo')),
  cubiertos int  check (cubiertos is null or cubiertos >= 0),
  total     int  check (total is null or total >= 0),
  nota      text check (nota is null or length(nota) <= 500),
  creado_at timestamptz not null default now()
);
create index if not exists rutinas_corridas_rutina on public.rutinas_corridas (rutina, creado_at desc);
alter table public.rutinas_corridas enable row level security;
revoke all on public.rutinas_corridas from anon, authenticated;
grant select, insert on public.rutinas_corridas to service_role;
grant usage on sequence public.rutinas_corridas_id_seq to service_role;

create or replace function public.registrar_corrida(p_rutina text, p_compu text, p_estado text,
  p_cubiertos int default null, p_total int default null, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  if auth.role() <> 'service_role' and not public.es_agencia() then
    raise exception 'registrar_corrida: solo el equipo';
  end if;
  insert into public.rutinas_corridas (rutina, compu, estado, cubiertos, total, nota)
  values (lower(p_rutina), p_compu, p_estado, p_cubiertos, p_total, p_nota)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ultimas_corridas(p_dias int default 7)
returns table (rutina text, compu text, estado text, cubiertos int, total int, nota text, creado_at timestamptz, corridas bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (c.rutina) c.rutina, c.compu, c.estado, c.cubiertos, c.total, c.nota, c.creado_at,
         count(*) over (partition by c.rutina)
    from public.rutinas_corridas c
   where c.creado_at > now() - make_interval(days => greatest(1, least(p_dias, 60)))
     and (auth.role() = 'service_role' or public.es_agencia())
   order by c.rutina, c.creado_at desc;
$$;

revoke all on function public.registrar_corrida(text,text,text,int,int,text) from public;
revoke all on function public.ultimas_corridas(int) from public;
grant execute on function public.registrar_corrida(text,text,text,int,int,text) to service_role, authenticated;
grant execute on function public.ultimas_corridas(int) to service_role, authenticated;
notify pgrst, 'reload schema';
