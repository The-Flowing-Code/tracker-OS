-- 050 · formularios_onboarding.accesos (23/10/2026)
--
-- Marca los formularios de clientes que ya corrieron campañas (o las están
-- corriendo). Solo a esos el final del formulario les ofrece «Enviar y
-- adelantar accesos», con los instructivos de Meta (Angie, 23/10/2026). A un
-- cliente que nunca pautó no se le piden accesos en el formulario.
--
-- Los videos y los datos para darnos acceso viven en el bucket privado
-- `formularios`, en instructivos/meta/ (no en git: el repo es público). La
-- función `formulario` los firma solo para el que trae un código válido de un
-- formulario con accesos = true.
--
-- Solo suma: una columna con default, nada existente cambia.
--
-- Cómo se vuelve atrás:
--   alter table public.formularios_onboarding drop column accesos;

alter table public.formularios_onboarding
  add column if not exists accesos boolean not null default false;

-- accesos_at: cuándo el cliente tocó «Enviar y adelantar accesos». Además, la
-- función suma un ticket a la ficha (add_cambio_propuesto, 045) para que el
-- equipo revise que los accesos lleguen.
--   Vuelta atrás: alter table public.formularios_onboarding drop column accesos_at;
alter table public.formularios_onboarding
  add column if not exists accesos_at timestamptz;
notify pgrst, 'reload schema';
