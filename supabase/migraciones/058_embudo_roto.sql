-- 058 · La parte rota del embudo de cada cliente (Angie, 20/11/2026)
--
-- POR QUE
-- El menú del cliente muestra Top, Middle y Bottom of Funnel con un ícono de
-- embudo en partes, y la parte rota va en rojo. «Rota» es donde se encarece el
-- costo (Angie, 20/11/2026): la rutina `reporte-campanas-diario` lo calcula
-- cada mañana con `scripts/embudo_roto.py` y lo guarda acá. El tono es rojo,
-- o ámbar cuando el pipeline no está actualizado y no se puede concluir; el
-- motivo es la frase corta que muestra el menú.
--
-- Igual que la 027: la rutina no tiene UPDATE sobre `clientes` (en `datos`
-- están `metaToken` y `ghl.token`), así que se le da una función que solo sabe
-- escribir `datos.embudoRoto`.

create or replace function public.set_embudo_roto(
  p_id      bigint,
  p_parte   text,
  p_tono    text default null,
  p_motivo  text default null,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_parte is not null and p_parte not in ('top', 'middle', 'bottom') then
    raise exception 'embudoRoto: la parte tiene que ser top, middle, bottom o null, vino %', p_parte;
  end if;
  if p_tono is not null and p_tono not in ('rojo', 'ambar') then
    raise exception 'embudoRoto: el tono tiene que ser rojo o ambar, vino %', p_tono;
  end if;
  if p_motivo is not null and length(p_motivo) > 60 then
    raise exception 'embudoRoto: el motivo no puede pasar de 60 caracteres';
  end if;
  if p_detalle is not null and length(p_detalle) > 300 then
    raise exception 'embudoRoto: el detalle no puede pasar de 300 caracteres';
  end if;

  update public.clientes
     set datos = jsonb_set(
           coalesce(datos, '{}'::jsonb),
           '{embudoRoto}',
           jsonb_build_object('parte', p_parte, 'tono', p_tono, 'motivo', p_motivo, 'detalle', p_detalle,
                              'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           true)
   where id = p_id;

  if not found then
    raise exception 'embudoRoto: no existe el cliente %', p_id;
  end if;
end;
$$;

revoke all on function public.set_embudo_roto(bigint, text, text, text, text) from public;
grant execute on function public.set_embudo_roto(bigint, text, text, text, text) to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA
--   ~/sbw POST "rpc/set_embudo_roto" \
--     '{"p_id":1790611145347,"p_parte":"bottom","p_tono":"rojo","p_motivo":"Califican y no agendan","p_detalle":"..."}'
--   Con "p_parte":null se borra la marca (no hay parte rota).
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.set_embudo_roto(bigint, text, text, text, text);
--   notify pgrst, 'reload schema';
-- Los `datos.embudoRoto` ya escritos quedan; la app los sigue leyendo.
