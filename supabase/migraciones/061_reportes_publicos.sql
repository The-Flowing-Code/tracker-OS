-- 061 · Reportes semanales con link propio (Angie, 23/11/2026)
--
-- POR QUE
-- Los reportes semanales salían como artifacts de la cuenta de Angie, que nacen
-- privados: había que abrir 14 links a mano cada lunes y, si uno se olvidaba, el
-- cliente recibía un link que no abría. Angie eligió «link propio del tracker»:
-- el reporte se guarda acá y se ve en
--   https://the-flowing-code.github.io/tracker-OS/r/#<token>
-- El token es largo y al azar (128 bits): lo ve quien tenga el link, igual que
-- «cualquiera con el link» de un artifact. Nadie puede listar los reportes.
--
-- QUE HAY
-- - reportes_publicos: un reporte por cliente y fecha. Sin políticas: nadie lo
--   lee directo, ni con la clave pública.
-- - reporte_publico(token): lo único que puede leer la página pública. Devuelve
--   el HTML de ese token y nada más.
-- - set_reporte_publico(cliente, fecha, html): lo usa la rutina (service_role).
--   Si ese cliente ya tiene reporte de esa fecha, lo reemplaza y mantiene el link.
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.reporte_publico(text);
--   drop function if exists public.set_reporte_publico(bigint, date, text);
--   drop table if exists public.reportes_publicos;

create table if not exists public.reportes_publicos (
  token      text primary key default replace(gen_random_uuid()::text,'-',''),
  cliente_id bigint not null,
  fecha      date   not null,
  html       text   not null check (length(html) between 1 and 300000),
  creado_at  timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (cliente_id, fecha)
);
alter table public.reportes_publicos enable row level security;
revoke all on public.reportes_publicos from anon, authenticated;
grant select, insert, update on public.reportes_publicos to service_role;

create or replace function public.reporte_publico(p_token text)
returns table (html text, fecha date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.html, r.fecha from public.reportes_publicos r
   where p_token ~ '^[0-9a-f]{32}$' and r.token = p_token;
$$;
revoke all on function public.reporte_publico(text) from public;
grant execute on function public.reporte_publico(text) to anon, authenticated;

create or replace function public.set_reporte_publico(p_id bigint, p_fecha date, p_html text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_token text;
begin
  if not exists (select 1 from public.clientes where id = p_id) then
    raise exception 'set_reporte_publico: no existe el cliente %', p_id;
  end if;
  insert into public.reportes_publicos (cliente_id, fecha, html)
       values (p_id, p_fecha, p_html)
  on conflict (cliente_id, fecha)
  do update set html = excluded.html, actualizado_at = now()
  returning token into v_token;
  return v_token;
end $$;
revoke all on function public.set_reporte_publico(bigint, date, text) from public;
grant execute on function public.set_reporte_publico(bigint, date, text) to service_role;

notify pgrst, 'reload schema';
