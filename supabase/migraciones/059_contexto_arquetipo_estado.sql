-- 059 · Arquetipo y estado del cliente, separados (Angie, 22/11/2026)
--
-- POR QUE
-- «Hay cosas que son parte del arquetipo del cliente y otra el estado… se están
-- confundiendo». Hasta hoy el «Ánimo» era un punto suelto del contexto y la app
-- adivinaba la satisfacción con palabras: un cliente desconfiado de entrada
-- (cómo es) salía «en riesgo» aunque hoy estuviera conforme (cómo está).
--
-- Suma dos claves a maquina.contexto, que sigue escribiendo la rutina
-- contexto-clientes con set_contexto:
--   arquetipo: { grupo: desconfiado | exigente | sin-tiempo | tecnico | apurado
--                       | contencion | comprometido,
--                como: "cómo hablarle, una línea",
--                por:  "de dónde sale, una línea" }
--   estado:    { nivel: bien | mirar | riesgo,
--                motivo: "qué dijo o pasó, una línea",
--                fecha:  "AAAA-MM-DD de lo que lo muestra",
--                fuente: "la llamada del 29/10, el WhatsApp del 06/11…" }
-- Sin estado = sin lectura. La app lo da por viejo a los 15 días de su fecha.

create or replace function public.set_contexto(p_id bigint, p_val jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  k text;
  a jsonb;
  e jsonb;
begin
  if p_val is null then
    update public.clientes set maquina = coalesce(maquina, '{}'::jsonb) - 'contexto' where id = p_id;
    if not found then raise exception 'contexto: no existe el cliente %', p_id; end if;
    return;
  end if;
  if jsonb_typeof(p_val) <> 'object' then
    raise exception 'contexto: tiene que ser un objeto';
  end if;
  for k in select jsonb_object_keys(p_val) loop
    if k not in ('necesidad','puntos','hoy','conNosotros','fuentes','arquetipo','estado') then
      raise exception 'contexto: la clave % no va', k;
    end if;
  end loop;
  if length(coalesce(p_val->>'necesidad','')) > 300 then raise exception 'contexto: necesidad pasa de 300'; end if;
  if length(coalesce(p_val->>'hoy',''))       > 500 then raise exception 'contexto: hoy pasa de 500'; end if;
  if length(coalesce(p_val->>'conNosotros','')) > 500 then raise exception 'contexto: conNosotros pasa de 500'; end if;
  if length(coalesce(p_val->>'fuentes',''))   > 200 then raise exception 'contexto: fuentes pasa de 200'; end if;
  if p_val ? 'puntos' then
    if jsonb_typeof(p_val->'puntos') <> 'array' or jsonb_array_length(p_val->'puntos') > 5 then
      raise exception 'contexto: puntos tiene que ser una lista de hasta 5';
    end if;
    if exists (select 1 from jsonb_array_elements(p_val->'puntos') x
               where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 220) then
      raise exception 'contexto: cada punto es un texto de hasta 220';
    end if;
  end if;

  if p_val ? 'arquetipo' then
    a := p_val->'arquetipo';
    if jsonb_typeof(a) <> 'object' then raise exception 'contexto: arquetipo tiene que ser un objeto'; end if;
    for k in select jsonb_object_keys(a) loop
      if k not in ('grupo','como','por') then raise exception 'contexto: arquetipo.% no va', k; end if;
    end loop;
    if coalesce(a->>'grupo','') not in ('desconfiado','exigente','sin-tiempo','tecnico','apurado','contencion','comprometido') then
      raise exception 'contexto: arquetipo.grupo no es uno de los siete';
    end if;
    if length(coalesce(a->>'como','')) > 220 or length(coalesce(a->>'por','')) > 220 then
      raise exception 'contexto: arquetipo.como y arquetipo.por van hasta 220';
    end if;
  end if;

  if p_val ? 'estado' then
    e := p_val->'estado';
    if jsonb_typeof(e) <> 'object' then raise exception 'contexto: estado tiene que ser un objeto'; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('nivel','motivo','fecha','fuente') then raise exception 'contexto: estado.% no va', k; end if;
    end loop;
    if coalesce(e->>'nivel','') not in ('bien','mirar','riesgo') then
      raise exception 'contexto: estado.nivel es bien, mirar o riesgo';
    end if;
    if coalesce(e->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'contexto: estado.fecha va como AAAA-MM-DD';
    end if;
    if length(coalesce(e->>'motivo','')) > 220 or length(coalesce(e->>'fuente','')) > 120 then
      raise exception 'contexto: estado.motivo va hasta 220 y estado.fuente hasta 120';
    end if;
  end if;

  v := p_val || jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  update public.clientes
     set maquina = jsonb_set(coalesce(maquina, '{}'::jsonb), '{contexto}', v, true)
   where id = p_id;
  if not found then raise exception 'contexto: no existe el cliente %', p_id; end if;
end;
$$;

revoke all on function public.set_contexto(bigint, jsonb) from public;
grant execute on function public.set_contexto(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
