-- Stub mínimo de Supabase para probar las migraciones en un Postgres local (sin Docker).
-- Uso: ver "Probar la base localmente" en CLAUDE.md.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
-- auth.uid() lee la variable de sesión test.uid:  set test.uid = '<uuid>';
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create publication supabase_realtime;
-- Después de aplicar las migraciones, para probar con RLS como un usuario:
--   grant usage on schema public, auth to authenticated;
--   grant all on all tables in schema public to authenticated;
--   grant execute on all functions in schema public, auth to authenticated;
--   set role authenticated; set test.uid = '...';
