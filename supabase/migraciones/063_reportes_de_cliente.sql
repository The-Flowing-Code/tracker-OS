-- 063 · La historia de reportes semanales de cada cliente (Angie, 23/11/2026)
--
-- POR QUE
-- El reporte semanal se veía solo el día que salía, en «Mensajes para mandar hoy».
-- La ficha del cliente suma la pestaña «Reportes»: cada semana con su titular y su
-- link propio, del más nuevo al más viejo, para todo el equipo.
--
-- QUE HAY
-- reportes_de_cliente(id): fecha, token y titular (el <h1 class="titular"> del
-- reporte, sin etiquetas) de cada reporte del cliente. Solo para la agencia.
-- No devuelve el HTML: para verlo se abre el link propio.
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.reportes_de_cliente(bigint);

create or replace function public.reportes_de_cliente(p_id bigint)
returns table (fecha date, token text, titular text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not public.es_agencia() then
    raise exception 'reportes_de_cliente: solo el equipo';
  end if;
  return query
    select r.fecha, r.token,
           nullif(btrim(regexp_replace(
             substring(r.html from '<h1[^>]*class="titular"[^>]*>(.*?)</h1>'), '<[^>]+>', '', 'g')), '')
      from public.reportes_publicos r
     where r.cliente_id = p_id
     order by r.fecha desc;
end $$;
revoke all on function public.reportes_de_cliente(bigint) from public;
grant execute on function public.reportes_de_cliente(bigint) to authenticated, service_role;
notify pgrst, 'reload schema';
