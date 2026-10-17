-- 041 · Tokens de Meta y GHL de los clientes, en una tabla cerrada
--
-- POR QUE (Angie, 17/10/2026; Fase 3 del plan del 23/09)
-- Hoy los tokens viven adentro de clientes.datos (metaToken y ghl.token). Eso
-- quiere decir que cualquier cuenta de agencia los puede leer por la API, que
-- viajan a cada navegador que abre la app y que salen en cualquier copia de
-- una ficha. Esta tabla es la misma idea que fathom_keys y gcal_cuentas: RLS
-- y CERO policies, la lee solo la service key (funciones y scripts).
--
-- ⚠️  ES UNA TRANSICION, Y NADA DEJA DE ANDAR EN EL MEDIO.
--   1. (esta migracion) Se crea la tabla y se COPIAN los tokens. Las fichas
--      quedan como estaban.
--   2. El disparador mantiene la tabla al dia: cada vez que se guarda un
--      token en una ficha (Integraciones, la app, una rutina) se copia aca.
--      Nunca pisa con vacio: si la ficha no trae token, se queda el de aca.
--   3. Los que usan tokens pasan de a uno a leer de aca, con respaldo en la
--      ficha si aca no esta.
--   4. Recien cuando todo lee de aca, se sacan los tokens de las fichas (otra
--      migracion, con su permiso aparte).

create table if not exists public.tokens_clientes (
  cliente_id     bigint primary key references public.clientes(id) on delete cascade,
  meta_token     text,
  ghl_token      text,
  actualizado_at timestamptz not null default now()
);

alter table public.tokens_clientes enable row level security;
-- Sin policies a proposito. Una tabla nueva no le da permisos a la service key sola.
grant select, insert, update on public.tokens_clientes to service_role;

create or replace function public.tokens_clientes_copiar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mt text := nullif(btrim(coalesce(NEW.datos->>'metaToken', '')), '');
  gt text := nullif(btrim(coalesce(NEW.datos->'ghl'->>'token', '')), '');
begin
  if mt is null and gt is null then return NEW; end if;
  insert into public.tokens_clientes as t (cliente_id, meta_token, ghl_token, actualizado_at)
  values (NEW.id, mt, gt, now())
  on conflict (cliente_id) do update
    set meta_token = coalesce(excluded.meta_token, t.meta_token),
        ghl_token  = coalesce(excluded.ghl_token,  t.ghl_token),
        actualizado_at = case
          when excluded.meta_token is distinct from t.meta_token and excluded.meta_token is not null
            or excluded.ghl_token is distinct from t.ghl_token and excluded.ghl_token is not null
          then now() else t.actualizado_at end;
  return NEW;
-- ⚠️  NUNCA FRENA EL GUARDADO DE UNA FICHA. Si esto falla, la app tiene que
-- poder guardar igual: se deja un aviso en el log y la ficha se guarda.
exception when others then
  raise warning 'tokens_clientes_copiar (cliente %): %', NEW.id, sqlerrm;
  return NEW;
end $$;

drop trigger if exists tokens_clientes_copiar on public.clientes;
create trigger tokens_clientes_copiar
  after insert or update of datos on public.clientes
  for each row execute function public.tokens_clientes_copiar();

-- La copia inicial.
insert into public.tokens_clientes (cliente_id, meta_token, ghl_token)
select id,
       nullif(btrim(coalesce(datos->>'metaToken', '')), ''),
       nullif(btrim(coalesce(datos->'ghl'->>'token', '')), '')
from public.clientes
where nullif(btrim(coalesce(datos->>'metaToken', '')), '') is not null
   or nullif(btrim(coalesce(datos->'ghl'->>'token', '')), '') is not null
on conflict (cliente_id) do nothing;

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS (las fichas no se tocaron: no se pierde nada)
--   drop trigger if exists tokens_clientes_copiar on public.clientes;
--   drop function if exists public.tokens_clientes_copiar();
--   drop table if exists public.tokens_clientes;
