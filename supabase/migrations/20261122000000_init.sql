-- BaroB · esquema inicial
-- Grupos sin jerarquía: todo miembro puede hacer todo dentro de su grupo.

-------------------------------------------------------------------------------
-- Perfiles
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Grupos y miembros
-------------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'ARS',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_members (user_id);

create table public.invites (
  code text primary key default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create or replace function public.is_member(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  );
$$;

-------------------------------------------------------------------------------
-- Catálogos del grupo
-------------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  color text not null default '#3f8f5f',
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.categories (group_id);

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null,
  category_id uuid references public.categories (id) on delete set null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.fixed_expenses (group_id);

-------------------------------------------------------------------------------
-- Períodos ("meses")
-------------------------------------------------------------------------------
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  number int not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  summary jsonb
);
create unique index periods_one_open_per_group on public.periods (group_id) where closed_at is null;
create index on public.periods (group_id, number desc);

create or replace function public.period_is_open(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.periods where id = p and closed_at is null);
$$;

-------------------------------------------------------------------------------
-- Movimientos
-------------------------------------------------------------------------------
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  period_id uuid not null references public.periods (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14, 2) not null,
  note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.incomes (period_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  period_id uuid not null references public.periods (id) on delete cascade,
  description text not null,
  amount numeric(14, 2) not null, -- puede ser negativo (devoluciones / compensaciones)
  paid_by uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  spent_at date not null default current_date,
  fixed_expense_id uuid references public.fixed_expenses (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expenses (period_id);
create unique index expenses_one_fixed_per_period on public.expenses (period_id, fixed_expense_id)
  where fixed_expense_id is not null;

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null,
  category_id uuid references public.categories (id) on delete set null,
  paid_by uuid not null references auth.users (id) on delete cascade,
  total_amount numeric(14, 2) not null,
  installments_total int not null check (installments_total between 1 and 120),
  installments_paid int not null default 0, -- cuotas ya imputadas en meses cerrados
  finished_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (installments_paid between 0 and installments_total)
);
create index on public.installment_plans (group_id) where finished_at is null;

-- Monto de la cuota k (1..n). La última absorbe el redondeo.
create or replace function public.installment_amount(total numeric, n int, k int)
returns numeric
language sql
immutable
as $$
  select case
    when k < n then round(total / n, 2)
    else total - round(total / n, 2) * (n - 1)
  end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- Un gasto fijo hereda descripción y categoría de su plantilla.
create or replace function public.fill_fixed_expense()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fixed_expense_id is not null then
    select f.description, f.category_id into new.description, new.category_id
    from fixed_expenses f where f.id = new.fixed_expense_id;
  end if;
  return new;
end;
$$;
create trigger expenses_fill_fixed before insert or update of fixed_expense_id on public.expenses
  for each row execute function public.fill_fixed_expense();

-------------------------------------------------------------------------------
-- Suscripciones push
-------------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- RLS
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;
alter table public.categories enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.periods enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.installment_plans enable row level security;
alter table public.push_subscriptions enable row level security;

-- Perfiles: me veo a mí y a quienes comparten algún grupo conmigo.
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select using (public.is_member(id));
create policy groups_update on public.groups for update using (public.is_member(id)) with check (public.is_member(id));

create policy members_select on public.group_members for select using (public.is_member(group_id));
-- Cualquier miembro puede quitar a cualquier miembro (incluido uno mismo = salir).
create policy members_delete on public.group_members for delete using (public.is_member(group_id));

create policy invites_select on public.invites for select using (public.is_member(group_id));
create policy invites_delete on public.invites for delete using (public.is_member(group_id));

create policy categories_all on public.categories for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy fixed_all on public.fixed_expenses for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));

create policy periods_select on public.periods for select using (public.is_member(group_id));

-- Solo se pueden tocar movimientos del período abierto.
create policy incomes_select on public.incomes for select using (public.is_member(group_id));
create policy incomes_write on public.incomes for insert
  with check (public.is_member(group_id) and public.period_is_open(period_id));
create policy incomes_update on public.incomes for update
  using (public.is_member(group_id) and public.period_is_open(period_id))
  with check (public.is_member(group_id) and public.period_is_open(period_id));
create policy incomes_delete on public.incomes for delete
  using (public.is_member(group_id) and public.period_is_open(period_id));

create policy expenses_select on public.expenses for select using (public.is_member(group_id));
create policy expenses_insert on public.expenses for insert
  with check (public.is_member(group_id) and public.period_is_open(period_id));
create policy expenses_update on public.expenses for update
  using (public.is_member(group_id) and public.period_is_open(period_id))
  with check (public.is_member(group_id) and public.period_is_open(period_id));
create policy expenses_delete on public.expenses for delete
  using (public.is_member(group_id) and public.period_is_open(period_id));

create policy installments_all on public.installment_plans for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));

create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-------------------------------------------------------------------------------
-- RPCs
-------------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_currency text default 'ARS')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  insert into groups (name, currency, created_by) values (p_name, coalesce(p_currency, 'ARS'), auth.uid())
  returning id into g;
  insert into group_members (group_id, user_id) values (g, auth.uid());
  insert into periods (group_id, number) values (g, 1);

  insert into categories (group_id, name, color, sort) values
    (g, 'Casa',         '#2f7d4f', 1),
    (g, 'Servicios',    '#4a9d6b', 2),
    (g, 'Supermercado', '#6bb88a', 3),
    (g, 'Auto',         '#1f5c3a', 4),
    (g, 'Salud',        '#8fd0a8', 5),
    (g, 'Salidas',      '#3c6e55', 6),
    (g, 'Educación',    '#9bbfa8', 7),
    (g, 'Otros',        '#7a8f82', 8);

  return g;
end;
$$;

create or replace function public.create_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
begin
  if not is_member(p_group) then raise exception 'not a member'; end if;
  insert into invites (group_id, created_by) values (p_group, auth.uid()) returning code into c;
  return c;
end;
$$;

-- Vista previa de una invitación (para mostrar "Te invitaron a X" antes de unirse).
create or replace function public.invite_info(p_code text)
returns table (group_id uuid, group_name text, members int)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, (select count(*)::int from group_members m where m.group_id = g.id)
  from invites i join groups g on g.id = i.group_id
  where i.code = upper(p_code) and i.expires_at > now();
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select i.group_id into g from invites i where i.code = upper(p_code) and i.expires_at > now();
  if g is null then raise exception 'invite_invalid'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end;
$$;

-- Cálculo del resumen del período abierto (no modifica nada).
-- Regla: cada uno paga los gastos en proporción a su ingreso.
create or replace function public.period_summary(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_total_income numeric;
  v_total_exp numeric;
  v_members jsonb;
  v_categories jsonb;
  v_installments jsonb;
  v_settlements jsonb := '[]'::jsonb;
  cred_ids uuid[]; cred_amt numeric[];
  debt_ids uuid[]; debt_amt numeric[];
  i int := 1; j int := 1; x numeric;
begin
  select group_id into v_group from periods where id = p_period;
  if v_group is null or not is_member(v_group) then raise exception 'not a member'; end if;

  -- Cargos del período: gastos + cuota vigente de cada plan activo.
  create temp table _charges on commit drop as
    select e.paid_by as user_id, e.category_id, e.amount
    from expenses e where e.period_id = p_period
    union all
    select ip.paid_by, ip.category_id,
           installment_amount(ip.total_amount, ip.installments_total, ip.installments_paid + 1)
    from installment_plans ip
    where ip.group_id = v_group and ip.finished_at is null
      and ip.installments_paid < ip.installments_total
      and (select closed_at from periods where id = p_period) is null;

  create temp table _people on commit drop as
    select user_id from group_members where group_id = v_group
    union select user_id from incomes where period_id = p_period
    union select user_id from _charges;

  create temp table _stats on commit drop as
    select p.user_id,
           coalesce(pr.display_name, '?') as name,
           coalesce((select sum(amount) from incomes i where i.period_id = p_period and i.user_id = p.user_id), 0) as income,
           coalesce((select sum(amount) from _charges c where c.user_id = p.user_id), 0) as paid
    from _people p left join profiles pr on pr.id = p.user_id;

  select coalesce(sum(income), 0), coalesce(sum(paid), 0) into v_total_income, v_total_exp from _stats;

  alter table _stats add column share numeric, add column balance numeric;
  update _stats set
    share = case when v_total_income > 0 then round(v_total_exp * income / v_total_income, 2) else 0 end;
  update _stats set balance = paid - share;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'name', name, 'income', income, 'paid', paid,
           'share', share, 'balance', balance) order by name), '[]'::jsonb)
    into v_members from _stats;

  select coalesce(jsonb_agg(jsonb_build_object(
           'category_id', t.category_id, 'name', coalesce(c.name, 'Sin categoría'),
           'color', coalesce(c.color, '#7a8f82'), 'total', t.total) order by t.total desc), '[]'::jsonb)
    into v_categories
  from (select category_id, sum(amount) as total from _charges group by category_id) t
  left join categories c on c.id = t.category_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'plan_id', ip.id, 'description', ip.description, 'paid_by', ip.paid_by,
           'number', ip.installments_paid + 1, 'of', ip.installments_total,
           'amount', installment_amount(ip.total_amount, ip.installments_total, ip.installments_paid + 1))), '[]'::jsonb)
    into v_installments
  from installment_plans ip
  where ip.group_id = v_group and ip.finished_at is null and ip.installments_paid < ip.installments_total;

  -- Transferencias mínimas (greedy: mayor deudor paga a mayor acreedor).
  select array_agg(user_id order by balance desc), array_agg(balance order by balance desc)
    into cred_ids, cred_amt from _stats where balance > 0.005;
  select array_agg(user_id order by balance asc), array_agg(-balance order by balance asc)
    into debt_ids, debt_amt from _stats where balance < -0.005;

  while cred_ids is not null and debt_ids is not null
        and i <= array_length(cred_ids, 1) and j <= array_length(debt_ids, 1) loop
    x := round(least(cred_amt[i], debt_amt[j]), 2);
    if x > 0.004 then
      v_settlements := v_settlements || jsonb_build_object('from', debt_ids[j], 'to', cred_ids[i], 'amount', x);
    end if;
    cred_amt[i] := cred_amt[i] - x;
    debt_amt[j] := debt_amt[j] - x;
    if cred_amt[i] <= 0.005 then i := i + 1; end if;
    if debt_amt[j] <= 0.005 then j := j + 1; end if;
  end loop;

  drop table _charges; drop table _people; drop table _stats;

  return jsonb_build_object(
    'total_income', v_total_income,
    'total_expenses', v_total_exp,
    'savings', v_total_income - v_total_exp,
    'members', v_members,
    'categories', v_categories,
    'installments', v_installments,
    'settlements', v_settlements
  );
end;
$$;

-- Qué falta para poder cerrar el período.
create or replace function public.close_blockers(p_period uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select group_id from periods where id = p_period and closed_at is null)
  select jsonb_build_object(
    'missing_incomes', coalesce((
      select jsonb_agg(m.user_id) from group_members m, p
      where m.group_id = p.group_id
        and not exists (select 1 from incomes i where i.period_id = p_period and i.user_id = m.user_id)
    ), '[]'::jsonb),
    'missing_fixed', coalesce((
      select jsonb_agg(f.id) from fixed_expenses f, p
      where f.group_id = p.group_id and f.active
        and not exists (select 1 from expenses e where e.period_id = p_period and e.fixed_expense_id = f.id)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.close_period(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_number int;
  v_blockers jsonb;
  v_summary jsonb;
begin
  select group_id, number into v_group, v_number from periods
    where id = p_period and closed_at is null for update;
  if v_group is null then raise exception 'period_not_open'; end if;
  if not is_member(v_group) then raise exception 'not a member'; end if;

  v_blockers := close_blockers(p_period);
  if jsonb_array_length(v_blockers -> 'missing_incomes') > 0
     or jsonb_array_length(v_blockers -> 'missing_fixed') > 0 then
    raise exception 'cannot_close: %', v_blockers::text using errcode = 'P0001';
  end if;

  v_summary := period_summary(p_period);
  if (v_summary ->> 'total_income')::numeric <= 0 then
    raise exception 'cannot_close: total income must be positive';
  end if;

  update periods set closed_at = now(), closed_by = auth.uid(), summary = v_summary where id = p_period;

  update installment_plans
     set installments_paid = installments_paid + 1,
         finished_at = case when installments_paid + 1 >= installments_total then now() end
   where group_id = v_group and finished_at is null and installments_paid < installments_total;

  insert into periods (group_id, number) values (v_group, v_number + 1);

  return v_summary;
end;
$$;

revoke execute on function public.period_summary(uuid) from anon;
revoke execute on function public.close_period(uuid) from anon;
revoke execute on function public.create_group(text, text) from anon;
revoke execute on function public.join_group(text) from anon;
revoke execute on function public.create_invite(uuid) from anon;

-------------------------------------------------------------------------------
-- Realtime
-------------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.expenses, public.incomes, public.installment_plans, public.periods,
  public.fixed_expenses, public.categories, public.group_members;
