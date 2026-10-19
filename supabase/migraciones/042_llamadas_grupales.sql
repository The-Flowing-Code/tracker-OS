-- 042 · Llamadas grupales: quién asistió y cuánto se habló de su caso
--
-- POR QUE (Angie, 18-19/10/2026)
-- Martín da capacitaciones con varios clientes a la vez (el bootcamp de
-- Software Partners) y en el medio trabaja el embudo de algunos en concreto.
-- `llamadas_fathom.cliente_id` admite UN cliente por llamada, así que esas
-- charlas caían enteras en «Evolve (interno)» y a la ficha de cada uno no
-- llegaba nada.
--
-- Una fila por llamada y por cliente que estuvo:
--   asistio        estuvo alguien de su contacto o su equipo (por mail)
--   minutos_caso   cuánto de la llamada fue sobre SU caso (suma de tramos)
--   tramos         [{desde, hasta, resumen, cita}] en segundos desde el inicio
-- La escribe la rutina `pendientes-de-llamadas` con la service key. La app
-- solo lee: con eso arma «Grupales» y el tiempo en la ficha.
--
-- ⚠️  UN TRAMO SOLO SE ASIGNA SI ESTÁ CLARO DE QUIÉN ES. Fathom pone mal los
-- nombres de quién habla, y hay clientes que se llaman como el equipo (Martín
-- Oyola, Santiago Abad). Lo dudoso no entra acá: se le pregunta a Angie.

create table if not exists public.llamadas_grupales (
  recording_id   text not null,
  cliente_id     bigint not null references public.clientes(id) on delete cascade,
  fecha          timestamptz,
  titulo         text check (titulo is null or length(titulo) <= 300),
  asistio        boolean not null default true,
  minutos_caso   integer not null default 0 check (minutos_caso between 0 and 600),
  tramos         jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  actualizado_at timestamptz not null default now(),
  primary key (recording_id, cliente_id)
);

create index if not exists llamadas_grupales_cliente on public.llamadas_grupales (cliente_id, fecha desc);

alter table public.llamadas_grupales enable row level security;

-- Leer: el equipo, como `llamadas_fathom`. Escribir: solo la service key.
drop policy if exists "agencia lee grupales" on public.llamadas_grupales;
create policy "agencia lee grupales" on public.llamadas_grupales
  for select to authenticated using (public.es_agencia());

grant select on public.llamadas_grupales to authenticated;
grant select, insert, update on public.llamadas_grupales to service_role;

notify pgrst, 'reload schema';

-- COMO SE VUELVE ATRAS (no toca ninguna tabla que ya existía)
--   drop table if exists public.llamadas_grupales;
