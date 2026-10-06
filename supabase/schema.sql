-- Octopus Verticales · esquema para Supabase (plan gratuito)
-- Pega este archivo completo en: Supabase → SQL Editor → New query → Run

-- 1) Tabla genérica de documentos (una fila por trabajo, foto, nota, publicación...)
create table if not exists public.docs (
  id         text primary key,
  coll       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  author     text
);
create index if not exists docs_updated_at_idx on public.docs (updated_at);
create index if not exists docs_coll_idx on public.docs (coll);

-- 2) Seguridad: solo usuarios con sesión (empleados) pueden leer y escribir
alter table public.docs enable row level security;
drop policy if exists "team can read"   on public.docs;
drop policy if exists "team can insert" on public.docs;
drop policy if exists "team can update" on public.docs;
create policy "team can read"   on public.docs for select to authenticated using (true);
create policy "team can insert" on public.docs for insert to authenticated with check (true);
create policy "team can update" on public.docs for update to authenticated using (true) with check (true);

-- 3) Tiempo real: la app recibe los cambios de los compañeros al instante
alter publication supabase_realtime add table public.docs;

-- 4) Fotos: bucket público de solo lectura, escritura para empleados
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
drop policy if exists "media public read"  on storage.objects;
drop policy if exists "media team insert"  on storage.objects;
drop policy if exists "media team update"  on storage.objects;
drop policy if exists "media team delete"  on storage.objects;
create policy "media public read"  on storage.objects for select using (bucket_id = 'media');
create policy "media team insert"  on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media team update"  on storage.objects for update to authenticated using (bucket_id = 'media');
create policy "media team delete"  on storage.objects for delete to authenticated using (bucket_id = 'media');

-- Después: Authentication → Providers → Email → activa "Enable email provider".
-- Para que solo entre tu equipo, desactiva "Allow new users to sign up" cuando todos tengan cuenta,
-- o crea los usuarios a mano en Authentication → Users → Add user.
