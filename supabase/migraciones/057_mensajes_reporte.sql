-- 057 · Mensajes del día: la fuente «reporte» (Angie, 20/11/2026)
--
-- POR QUE
-- La rutina reporte-semanal-clientes de TFC-OS arma los viernes el reporte
-- semanal de cada cliente y le deja a Santi, en «Mensajes para mandar hoy», el
-- mensaje con el link (campo `link` del mensaje). La tarjeta del cliente muestra
-- un 📊 ese día hasta que se marca Listo. set_mensajes_dia aceptaba 'leads',
-- 'whatsapp' y 'onboarding'. La app ya lee la fuente 'reporte' (js/bienvenida.js).
--
-- Cambia solo la lista de fuentes válidas; el resto de la función queda igual.

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.proname = 'set_mensajes_dia';
  if v_def is null then
    raise exception '057: no existe set_mensajes_dia';
  end if;
  if position('''reporte''' in v_def) > 0 then
    raise notice '057: ya acepta reporte';
    return;
  end if;
  -- Con la 052 aplicada la lista es (leads, whatsapp, onboarding); sin ella, (leads, whatsapp).
  -- Se suma 'reporte' a la que haya, sin agregar ni sacar ninguna otra.
  v_def := replace(v_def, 'not in (''leads'',''whatsapp'',''onboarding'')', 'not in (''leads'',''whatsapp'',''onboarding'',''reporte'')');
  v_def := replace(v_def, 'fuente tiene que ser leads, whatsapp u onboarding', 'fuente tiene que ser leads, whatsapp, onboarding o reporte');
  if position('''reporte''' in v_def) = 0 then
    v_def := replace(v_def, 'not in (''leads'',''whatsapp'')', 'not in (''leads'',''whatsapp'',''reporte'')');
    v_def := replace(v_def, 'fuente tiene que ser leads o whatsapp', 'fuente tiene que ser leads, whatsapp o reporte');
  end if;
  if position('''reporte''' in v_def) = 0 then
    raise exception '057: no encontré la lista de fuentes para cambiar';
  end if;
  execute v_def;
end $$;

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS
--   Volver a correr la definición con la lista que tenía antes (sin 'reporte').
--   Lo que ya se guardó en maquina.mensajesDia.reporte queda, y la app lo sigue leyendo.
