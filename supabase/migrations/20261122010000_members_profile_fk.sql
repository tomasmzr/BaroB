-- Permite embeber el perfil en group_members (PostgREST necesita una FK hacia profiles).
alter table public.group_members
  add constraint group_members_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;
