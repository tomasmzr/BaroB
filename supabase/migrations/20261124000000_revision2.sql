-- BaroB · revisión 2
-- * Modo de división "porcentajes fijos" por persona.
-- * Colores de categorías variados (no verdes) y gastos fijos por defecto en grupos nuevos.
-- * Borrar todos mis datos.

alter table public.groups drop constraint groups_split_mode_check;
alter table public.groups add constraint groups_split_mode_check
  check (split_mode in ('proportional', 'proportional_capped', 'equal', 'fixed'));

alter table public.group_members add column split_pct numeric(7, 4) check (split_pct is null or (split_pct >= 0 and split_pct <= 1));

drop function if exists public.split_ratios(numeric[], boolean[], text, numeric, numeric);
create or replace function public.split_ratios(
  incomes numeric[], members boolean[], mode text, pmin numeric, pmax numeric, pcts numeric[]
) returns numeric[]
language plpgsql
immutable
as $$
declare
  n int := coalesce(array_length(incomes, 1), 0);
  k int := 0;              -- participantes
  r numeric[] := array_fill(0::numeric, array[greatest(n, 1)]);
  fixed boolean[] := array_fill(false, array[greatest(n, 1)]);
  total numeric := 0;
  rem numeric; wsum numeric; nfree int; over numeric; under numeric;
  i int; it int;
begin
  if n = 0 then return '{}'; end if;
  for i in 1..n loop
    if members[i] then k := k + 1; total := total + greatest(coalesce(incomes[i], 0), 0); end if;
  end loop;
  if k = 0 then return r[1:n]; end if;

  if mode = 'fixed' then
    -- porcentajes fijos por persona; se normalizan por si no suman 100
    total := 0;
    for i in 1..n loop
      if members[i] then total := total + greatest(coalesce(pcts[i], 0), 0); end if;
    end loop;
    for i in 1..n loop
      r[i] := case when not members[i] then 0
                   when total > 0 then greatest(coalesce(pcts[i], 0), 0) / total
                   else 1.0 / k end;
    end loop;
    return r[1:n];
  end if;

  if mode = 'equal' then
    for i in 1..n loop r[i] := case when members[i] then 1.0 / k else 0 end; end loop;
    return r[1:n];
  end if;

  if total <= 0 then
    return r[1:n];
  end if;

  -- proporcional puro
  for i in 1..n loop
    r[i] := case when members[i] then greatest(coalesce(incomes[i], 0), 0) / total else 0 end;
  end loop;

  if mode <> 'proportional_capped' then return r[1:n]; end if;
  -- topes imposibles de cumplir → proporcional puro
  if (pmin is not null and pmin * k > 1) or (pmax is not null and pmax * k < 1) then return r[1:n]; end if;

  for i in 1..n loop fixed[i] := not members[i]; end loop;
  for it in 1..(n + 1) loop
    rem := 1; wsum := 0; nfree := 0;
    for i in 1..n loop
      if fixed[i] then rem := rem - r[i];
      else wsum := wsum + greatest(coalesce(incomes[i], 0), 0); nfree := nfree + 1; end if;
    end loop;
    exit when nfree = 0;
    for i in 1..n loop
      if not fixed[i] then
        r[i] := case when wsum > 0 then rem * greatest(coalesce(incomes[i], 0), 0) / wsum else rem / nfree end;
      end if;
    end loop;
    over := 0; under := 0;
    for i in 1..n loop
      if not fixed[i] then
        if pmax is not null and r[i] > pmax then over := over + r[i] - pmax; end if;
        if pmin is not null and r[i] < pmin then under := under + pmin - r[i]; end if;
      end if;
    end loop;
    exit when over <= 0.000001 and under <= 0.000001;
    for i in 1..n loop
      if not fixed[i] then
        if over >= under and pmax is not null and r[i] > pmax then r[i] := pmax; fixed[i] := true;
        elsif under > over and pmin is not null and r[i] < pmin then r[i] := pmin; fixed[i] := true;
        end if;
      end if;
    end loop;
  end loop;
  return r[1:n];
end;
$$;

create or replace function public.period_summary(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_open boolean;
  v_month date;
  v_total_income numeric;
  v_total_exp numeric;
  v_members jsonb;
  v_categories jsonb;
  v_installments jsonb;
  v_settlements jsonb := '[]'::jsonb;
  ids uuid[]; incs numeric[]; mems boolean[]; pcts numeric[]; ratios numeric[];
  cred_ids uuid[]; cred_amt numeric[];
  debt_ids uuid[]; debt_amt numeric[];
  i int := 1; j int := 1; x numeric;
begin
  select g.* into v_group from periods p join groups g on g.id = p.group_id where p.id = p_period;
  if v_group.id is null or not is_member(v_group.id) then raise exception 'not a member'; end if;
  select closed_at is null, month into v_open, v_month from periods where id = p_period;

  create temp table _charges on commit drop as
    select e.paid_by as user_id, e.category_id, e.amount
    from expenses e where e.period_id = p_period
    union all
    select ip.paid_by, ip.category_id,
           installment_amount(ip.total_amount, ip.installments_total, ip.installments_paid + 1)
    from installment_plans ip
    where v_open and ip.group_id = v_group.id and ip.finished_at is null
      and ip.installments_paid < ip.installments_total;

  create temp table _people on commit drop as
    select user_id from group_members where group_id = v_group.id
    union select user_id from incomes where period_id = p_period
    union select user_id from _charges;

  create temp table _stats on commit drop as
    select p.user_id,
           coalesce(pr.display_name, '?') as name,
           exists (select 1 from group_members m where m.group_id = v_group.id and m.user_id = p.user_id) as member,
           coalesce((select sum(amount) from incomes i where i.period_id = p_period and i.user_id = p.user_id), 0) as income,
           coalesce((select sum(amount) from _charges c where c.user_id = p.user_id), 0) as paid,
           (select m.split_pct from group_members m where m.group_id = v_group.id and m.user_id = p.user_id) as pct,
           0::numeric as ratio, 0::numeric as share, 0::numeric as balance
    from _people p left join profiles pr on pr.id = p.user_id;

  select coalesce(sum(income), 0), coalesce(sum(paid), 0) into v_total_income, v_total_exp from _stats;

  select array_agg(user_id order by user_id), array_agg(income order by user_id), array_agg(member order by user_id),
         array_agg(pct order by user_id)
    into ids, incs, mems, pcts from _stats;
  ratios := split_ratios(incs, mems, v_group.split_mode, v_group.split_min, v_group.split_max, pcts);
  for i in 1..coalesce(array_length(ids, 1), 0) loop
    update _stats set ratio = ratios[i], share = round(v_total_exp * ratios[i], 2) where user_id = ids[i];
  end loop;
  update _stats set balance = paid - share where true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'name', name, 'income', income, 'paid', paid,
           'ratio', round(ratio, 4), 'share', share, 'balance', balance) order by name), '[]'::jsonb)
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
  where v_open and ip.group_id = v_group.id and ip.finished_at is null and ip.installments_paid < ip.installments_total;

  i := 1; j := 1;
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
    'month', v_month,
    'split_mode', v_group.split_mode,
    'split_min', v_group.split_min,
    'split_max', v_group.split_max,
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

create or replace function public.close_blockers(p_period uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pe.group_id, g.split_mode from periods pe join groups g on g.id = pe.group_id
    where pe.id = p_period and pe.closed_at is null
  )
  select jsonb_build_object(
    'missing_incomes', coalesce((
      select jsonb_agg(m.user_id) from group_members m, p
      where m.group_id = p.group_id and p.split_mode not in ('equal', 'fixed')
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
  v_month date;
  v_mode text;
  v_blockers jsonb;
  v_summary jsonb;
begin
  select p.group_id, p.number, p.month, g.split_mode into v_group, v_number, v_month, v_mode
    from periods p join groups g on g.id = p.group_id
    where p.id = p_period and p.closed_at is null for update of p;
  if v_group is null then raise exception 'period_not_open'; end if;
  if not is_member(v_group) then raise exception 'not a member'; end if;

  v_blockers := close_blockers(p_period);
  if jsonb_array_length(v_blockers -> 'missing_incomes') > 0
     or jsonb_array_length(v_blockers -> 'missing_fixed') > 0 then
    raise exception 'cannot_close: %', v_blockers::text using errcode = 'P0001';
  end if;

  v_summary := period_summary(p_period);
  if v_mode not in ('equal', 'fixed') and (v_summary ->> 'total_income')::numeric <= 0 then
    raise exception 'cannot_close: total income must be positive';
  end if;

  update periods set closed_at = now(), closed_by = auth.uid(), summary = v_summary where id = p_period;

  update installment_plans
     set installments_paid = installments_paid + 1,
         finished_at = case when installments_paid + 1 >= installments_total then now() end
   where group_id = v_group and finished_at is null and installments_paid < installments_total;

  insert into periods (group_id, number, month) values (v_group, v_number + 1, (v_month + interval '1 month')::date);
  return v_summary;
end;
$$;

create or replace function public.create_group(p_name text, p_currency text default 'ARS', p_timezone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid;
  tz text := coalesce(nullif(p_timezone, ''), 'America/Argentina/Buenos_Aires');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  begin
    perform now() at time zone tz;
  exception when others then
    tz := 'America/Argentina/Buenos_Aires';
  end;

  insert into groups (name, currency, created_by, timezone) values (p_name, coalesce(p_currency, 'ARS'), auth.uid(), tz)
  returning id into g;
  insert into group_members (group_id, user_id) values (g, auth.uid());
  insert into periods (group_id, number, month) values (g, 1, date_trunc('month', now() at time zone tz)::date);

  insert into categories (group_id, name, color, sort) values
    (g, 'Casa',         '#3b82f6', 1),
    (g, 'Servicios',    '#f59e0b', 2),
    (g, 'Supermercado', '#ef4444', 3),
    (g, 'Auto',         '#8b5cf6', 4),
    (g, 'Salud',        '#ec4899', 5),
    (g, 'Salidas',      '#f97316', 6),
    (g, 'Educación',    '#06b6d4', 7),
    (g, 'Otros',        '#a16207', 8);

  -- gastos fijos de un grupo nuevo
  insert into fixed_expenses (group_id, description, category_id, sort)
  select g, f.d, c.id, f.s
  from (values ('Expensas', 'Casa', 1), ('Luz', 'Servicios', 2), ('Gas', 'Servicios', 3),
               ('Agua', 'Servicios', 4), ('Medicina prepaga', 'Salud', 5)) as f(d, cat, s)
  join categories c on c.group_id = g and c.name = f.cat;
  return g;
end;
$$;

-- Recolorear las categorías por defecto que todavía tienen el verde original.
update public.categories c set color = v.new
from (values ('Casa', '#2f7d4f', '#3b82f6'), ('Servicios', '#4a9d6b', '#f59e0b'), ('Supermercado', '#6bb88a', '#ef4444'),
             ('Auto', '#1f5c3a', '#8b5cf6'), ('Salud', '#8fd0a8', '#ec4899'), ('Salidas', '#3c6e55', '#f97316'),
             ('Educación', '#9bbfa8', '#06b6d4'), ('Otros', '#7a8f82', '#a16207')) as v(name, old, new)
where c.name = v.name and c.color = v.old;

-- Configurar la división de un grupo (atómico, incluye % por miembro).
create or replace function public.set_split(
  p_group uuid, p_mode text, p_min numeric default null, p_max numeric default null, p_pcts jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_group) then raise exception 'not a member'; end if;
  update groups set split_mode = p_mode,
                    split_min = case when p_mode = 'proportional_capped' then p_min end,
                    split_max = case when p_mode = 'proportional_capped' then p_max end
   where id = p_group;
  if p_pcts is not null then
    update group_members m set split_pct = (p_pcts ->> m.user_id::text)::numeric
     where m.group_id = p_group and p_pcts ? m.user_id::text;
  end if;
end;
$$;
revoke execute on function public.set_split(uuid, text, numeric, numeric, jsonb) from anon;

-- Borrar todo lo mío y empezar de cero.
-- Grupos donde estoy solo: se borran enteros. Grupos compartidos: salgo (se borran mis movimientos
-- del mes en curso; el historial de los demás queda). Con p_delete_account también se borra la cuenta.
create or replace function public.delete_my_data(p_delete_account boolean default false)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  g record;
begin
  if me is null then raise exception 'not authenticated'; end if;
  for g in select m.group_id, (select count(*) from group_members x where x.group_id = m.group_id) as n
           from group_members m where m.user_id = me loop
    if g.n <= 1 then
      delete from groups where id = g.group_id;
    else
      perform remove_member(g.group_id, me);
    end if;
  end loop;
  delete from push_subscriptions where user_id = me;
  if p_delete_account then
    delete from auth.users where id = me;
  end if;
end;
$$;
revoke execute on function public.delete_my_data(boolean) from anon;
