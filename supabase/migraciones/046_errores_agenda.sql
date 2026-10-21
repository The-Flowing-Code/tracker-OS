-- 046 · Errores al agendar: lo que le salió a cada uno, guardado
--
-- POR QUE (Angie, 21/10/2026)
-- «Santi siempre siempre tiene un problema distinto.» Cada vez que agendar o
-- reprogramar le falla, el mensaje queda en su pantalla y se pierde: para
-- verlo hay que pedirle una captura, y una grabación de pantalla de macOS no
-- se puede abrir desde acá. Sin el texto exacto, cada falla parece nueva.
--
-- Una fila por llamada a la función `agendar` que salió mal: quién, qué
-- acción, con qué cliente, el código HTTP, el error tal cual y el dispositivo.
-- La escribe la app de cada uno (solo su propio mail); el equipo la lee.
-- No guarda tokens ni el cuerpo entero del pedido: solo los campos que
-- explican la falla (calendario, horario, etapa, id de la cita).

create table if not exists public.errores_agenda (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  quien       text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  accion      text check (accion is null or length(accion) <= 40),
  cliente_id  bigint,
  status      integer,
  error       text check (error is null or length(error) <= 2000),
  pedido      jsonb not null default '{}'::jsonb
                check (jsonb_typeof(pedido) = 'object' and length(pedido::text) <= 4000),
  pantalla    text check (pantalla is null or length(pantalla) <= 200),
  dispositivo text check (dispositivo is null or length(dispositivo) <= 300)
);

create index if not exists errores_agenda_at on public.errores_agenda (at desc);

alter table public.errores_agenda enable row level security;

-- Escribir: solo el equipo, y solo a su nombre (no se puede cargar un error
-- como si fuera de otro). Leer: el equipo. Nadie edita ni borra desde la app.
drop policy if exists "agencia anota sus errores" on public.errores_agenda;
create policy "agencia anota sus errores" on public.errores_agenda
  for insert to authenticated
  with check (public.es_agencia() and quien = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "agencia lee errores" on public.errores_agenda;
create policy "agencia lee errores" on public.errores_agenda
  for select to authenticated using (public.es_agencia());

grant select, insert on public.errores_agenda to authenticated;
grant usage, select on sequence public.errores_agenda_id_seq to authenticated;
grant select on public.errores_agenda to service_role;

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS (no toca ninguna tabla que ya existía)
--   drop table if exists public.errores_agenda;
