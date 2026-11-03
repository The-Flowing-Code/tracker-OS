-- 053 · Lo que se hizo con los mensajes del día, para el conector del equipo
--
-- POR QUE (Angie, 03/11/2026)
-- Las rutinas de mensajes pasan a la Mac de Santi y corren con su conector
-- (evolve-mcp v1.3.0). Para el cierre del día necesita saber qué mensajes se
-- mandaron de verdad y cómo los editó quien los mandó: eso es
-- `mensajesEstado` en `config` (js/bienvenida.js, _bv2MensGuardar).
-- `service_role` no tiene SELECT sobre `config` (guarda la configuración de la
-- agencia), y no se le da: esta función devuelve SOLO esa clave. El filtro por
-- cartera lo hace el conector.

create or replace function public.get_mensajes_estado()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select to_jsonb(valor) from public.config where clave = 'mensajesEstado'), '{}'::jsonb);
$$;

revoke all on function public.get_mensajes_estado() from public;
grant execute on function public.get_mensajes_estado() to service_role;

notify pgrst, 'reload schema';

-- COMO SE USA (desde evolve-mcp)
--   POST rpc/get_mensajes_estado {}  →  { "AAAA-MM-DD|fuente|cliente|n": { "t": "...", "listo": "..." }, ... }
--
-- COMO SE VUELVE ATRAS
--   drop function if exists public.get_mensajes_estado();
