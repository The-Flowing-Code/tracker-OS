-- 047 · Formularios de onboarding: uno por cliente, con sus propias preguntas
--
-- POR QUE (Angie, 22/10/2026)
-- El proceso ideal: el cliente compra → llamada de bienvenida de 10-15 min →
-- le llega un formulario 100% personalizado (armado con lo que dijo en la
-- venta) → de sus respuestas sale la estrategia y el dataset. Un formulario de
-- GHL por cliente llena la subcuenta de campos sueltos; acá hay UNA forma de
-- formulario para todos y las preguntas de cada cliente viven en su fila.
--
-- CÓMO ENTRA EL CLIENTE: sin cuenta. Le llega un link con un código de 40
-- caracteres. En la base NO se guarda el código: solo su sha256 (como
-- `mcp_claves`). La página habla con la función `formulario`, que valida el
-- código con la service key y solo devuelve ESE formulario. Por eso estas
-- tablas no tienen ninguna policy para `anon`: el estado de siempre («anon
-- solo puede insertar en lp_eventos») no cambia.
--
--   formularios_onboarding   un formulario: el cliente, el estado y las
--                            preguntas (jsonb: bloques → preguntas)
--   formularios_respuestas   una fila por pregunta respondida: texto, audios y
--                            archivos (rutas del bucket privado `formularios`)
--
-- El equipo (rol agencia) los lee desde el tracker; escribe solo la función
-- (service key) y Claude desde el chat.

create table if not exists public.formularios_onboarding (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     bigint not null references public.clientes(id) on delete cascade,
  token_sha256   text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  estado         text not null default 'borrador'
                   check (estado in ('borrador','enviado','en_curso','completo','apagado')),
  titulo         text not null check (length(titulo) between 1 and 120),
  intro          text check (intro is null or length(intro) <= 2000),
  bloques        jsonb not null default '[]'::jsonb check (jsonb_typeof(bloques) = 'array'),
  creado_at      timestamptz not null default now(),
  enviado_at     timestamptz,
  abierto_at     timestamptz,
  completado_at  timestamptz,
  actualizado_at timestamptz not null default now()
);
create index if not exists formularios_onboarding_cliente on public.formularios_onboarding (cliente_id, creado_at desc);

create table if not exists public.formularios_respuestas (
  formulario_id  uuid not null references public.formularios_onboarding(id) on delete cascade,
  pregunta_id    text not null check (pregunta_id ~ '^[a-z0-9_-]{1,40}$'),
  texto          text check (texto is null or length(texto) <= 8000),
  opcion         text check (opcion is null or length(opcion) <= 300),
  audios         jsonb not null default '[]'::jsonb check (jsonb_typeof(audios) = 'array'),
  archivos       jsonb not null default '[]'::jsonb check (jsonb_typeof(archivos) = 'array'),
  transcripcion  text check (transcripcion is null or length(transcripcion) <= 20000),
  actualizado_at timestamptz not null default now(),
  primary key (formulario_id, pregunta_id)
);

alter table public.formularios_onboarding enable row level security;
alter table public.formularios_respuestas enable row level security;

drop policy if exists "agencia lee formularios" on public.formularios_onboarding;
create policy "agencia lee formularios" on public.formularios_onboarding
  for select to authenticated using (public.es_agencia());
drop policy if exists "agencia lee respuestas" on public.formularios_respuestas;
create policy "agencia lee respuestas" on public.formularios_respuestas
  for select to authenticated using (public.es_agencia());

grant select on public.formularios_onboarding, public.formularios_respuestas to authenticated;
grant select, insert, update on public.formularios_onboarding, public.formularios_respuestas to service_role;

-- El bucket privado de audios y archivos. Sube solo la función (con URLs de
-- subida firmadas); el equipo los lee desde el tracker con URLs firmadas.
insert into storage.buckets (id, name, public, file_size_limit)
values ('formularios', 'formularios', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "agencia lee archivos de formularios" on storage.objects;
create policy "agencia lee archivos de formularios" on storage.objects
  for select to authenticated using (bucket_id = 'formularios' and public.es_agencia());

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS (no toca nada que ya existía)
--   drop policy if exists "agencia lee archivos de formularios" on storage.objects;
--   delete from storage.objects where bucket_id = 'formularios';
--   delete from storage.buckets where id = 'formularios';
--   drop table if exists public.formularios_respuestas;
--   drop table if exists public.formularios_onboarding;
