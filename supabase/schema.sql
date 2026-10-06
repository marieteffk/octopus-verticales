-- Octopus Verticales · esquema para Supabase (plan gratuito)
-- Pega este archivo completo en: Supabase → SQL Editor → New query → Run
-- Se puede ejecutar varias veces sin error.

-- 1) Tabla genérica de documentos (una fila por trabajo, foto, nota, publicación...)
create table if not exists public.docs (
  id         text primary key,
  coll       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),   -- reloj del móvil (gana el más reciente)
  synced_at  timestamptz not null default now(),   -- reloj del servidor (cursor de sincronización)
  deleted    boolean not null default false,
  author     text
);
alter table public.docs add column if not exists synced_at timestamptz not null default now();
create index if not exists docs_synced_at_idx on public.docs (synced_at);
create index if not exists docs_coll_idx on public.docs (coll);

-- 1b) Trigger: el servidor fija synced_at y rechaza escrituras más antiguas que lo guardado.
create or replace function public.docs_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- copia obsoleta: se ignora (last-write-wins)
  end if;
  new.synced_at := now();
  return new;
end $$;
drop trigger if exists docs_before_write on public.docs;
create trigger docs_before_write before insert or update on public.docs
  for each row execute function public.docs_before_write();

-- 2) Seguridad: solo usuarios con sesión (empleados) pueden leer y escribir.
--    Las notas privadas (shared=false) solo las ve su autor.
alter table public.docs enable row level security;
drop policy if exists "team can read"   on public.docs;
drop policy if exists "team can insert" on public.docs;
drop policy if exists "team can update" on public.docs;
create policy "team can read" on public.docs for select to authenticated
  using (coll <> 'notes' or coalesce((data->>'shared')::boolean, true) or author = auth.uid()::text);
create policy "team can insert" on public.docs for insert to authenticated with check (true);
create policy "team can update" on public.docs for update to authenticated using (true) with check (true);

-- 3) Tiempo real: la app recibe los cambios de los compañeros al instante
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 4) Fotos: bucket público de lectura por URL; listar/escribir solo empleados
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
drop policy if exists "media public read"  on storage.objects;
drop policy if exists "media team read"    on storage.objects;
drop policy if exists "media team insert"  on storage.objects;
drop policy if exists "media team update"  on storage.objects;
drop policy if exists "media team delete"  on storage.objects;
create policy "media team read"   on storage.objects for select to authenticated using (bucket_id = 'media');
create policy "media team insert" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media team update" on storage.objects for update to authenticated using (bucket_id = 'media');
create policy "media team delete" on storage.objects for delete to authenticated using (bucket_id = 'media');

-- Después, en el panel de Supabase:
--  · Authentication → Providers → Email: activado.
--  · Cuando todo el equipo tenga cuenta, desactiva "Allow new users to sign up"
--    (o crea los usuarios a mano en Authentication → Users → Add user). Con registro
--    abierto, cualquiera que consiga la URL y la clave anon podría crear una cuenta.
