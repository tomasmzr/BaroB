-- BaroB · revisión 1
-- * Los períodos tienen nombre de mes ("Noviembre 2026"), avanzan un mes por cada cierre.
-- * Modos de división: proporcional, proporcional con topes, equitativo.
-- * Quitar a un miembro borra sus movimientos del mes en curso (el historial no se toca).
-- * Gastos en cuotas guardan su fecha de registro.

-------------------------------------------------------------------------------
-- Columnas nuevas
-------------------------------------------------------------------------------
alter table public.groups
  add column timezone text not null default 'America/Argentina/Buenos_Aires',
  add column split_mode text not null default 'proportional'
    check (split_mode in ('proportional', 'proportional_capped', 'equal')),
  add column split_min numeric(5, 4) check (split_min is null or (split_min >= 0 and split_min < 1)),
  add column split_max numeric(5, 4) check (split_max is null or (split_max > 0 and split_max <= 1));

alter table public.periods add column month date;
update public.periods p
   set month = (
     select (date_trunc('month', min(p2.started_at) at time zone 'America/Argentina/Buenos_Aires'))::date
     from public.periods p2 where p2.group_id = p.group_id
   ) + make_interval(months => p.number - 1)
 where p.month is null;
alter table public.periods alter column month set not null;

alter table public.installment_plans add column spent_at date not null default current_date;
update public.installment_plans set spent_at = (created_at at time zone 'America/Argentina/Buenos_Aires')::date where true;

-------------------------------------------------------------------------------
-- Crear grupo (ahora con zona horaria para nombrar el primer mes)
-------------------------------------------------------------------------------
drop function if exists public.create_group(text, text);
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
revoke execute on function public.create_group(text, text, text) from anon;

-------------------------------------------------------------------------------
-- Reparto: devuelve la fracción (0..1) que le toca a cada persona.
-- incomes[i] = ingreso; members[i] = si participa del reparto (miembro actual).
-------------------------------------------------------------------------------
create or replace function public.split_ratios(
  incomes numeric[], members boolean[], mode text, pmin numeric, pmax numeric
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

-------------------------------------------------------------------------------
-- Resumen del período con modos de división
-------------------------------------------------------------------------------
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
  ids uuid[]; incs numeric[]; mems boolean[]; ratios numeric[];
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
           0::numeric as ratio, 0::numeric as share, 0::numeric as balance
    from _people p left join profiles pr on pr.id = p.user_id;

  select coalesce(sum(income), 0), coalesce(sum(paid), 0) into v_total_income, v_total_exp from _stats;

  select array_agg(user_id order by user_id), array_agg(income order by user_id), array_agg(member order by user_id)
    into ids, incs, mems from _stats;
  ratios := split_ratios(incs, mems, v_group.split_mode, v_group.split_min, v_group.split_max);
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

-------------------------------------------------------------------------------
-- Bloqueos de cierre: en modo equitativo los ingresos no son obligatorios.
-------------------------------------------------------------------------------
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
      where m.group_id = p.group_id and p.split_mode <> 'equal'
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
  if v_mode <> 'equal' and (v_summary ->> 'total_income')::numeric <= 0 then
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

-------------------------------------------------------------------------------
-- Quitar miembro (o salir): borra sus movimientos del mes en curso.
-------------------------------------------------------------------------------
create or replace function public.remove_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period uuid;
begin
  if not is_member(p_group) then raise exception 'not a member'; end if;
  select id into v_period from periods where group_id = p_group and closed_at is null;
  if v_period is not null then
    delete from expenses where period_id = v_period and paid_by = p_user;
    delete from incomes where period_id = v_period and user_id = p_user;
  end if;
  delete from installment_plans where group_id = p_group and paid_by = p_user and finished_at is null;
  delete from group_members where group_id = p_group and user_id = p_user;
end;
$$;
revoke execute on function public.remove_member(uuid, uuid) from anon;

-- Lo que se borraría al quitar a alguien (para avisar antes).
create or replace function public.member_removal_preview(p_group uuid, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not is_member(p_group) then null else jsonb_build_object(
    'expenses', (select count(*) from expenses e join periods p on p.id = e.period_id
                 where p.group_id = p_group and p.closed_at is null and e.paid_by = p_user),
    'incomes', (select count(*) from incomes i join periods p on p.id = i.period_id
                where p.group_id = p_group and p.closed_at is null and i.user_id = p_user),
    'installments', (select count(*) from installment_plans
                     where group_id = p_group and paid_by = p_user and finished_at is null)
  ) end;
$$;

-- Quitar miembros solo por RPC (que limpia sus movimientos del mes).
drop policy if exists members_delete on public.group_members;
