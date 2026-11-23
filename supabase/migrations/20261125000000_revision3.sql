-- BaroB · revisión 3
-- * Devoluciones / reintegros: siguen guardándose como montos negativos (restan en su categoría)
--   pero se marcan y se informan aparte en el resumen.
-- * Modo de división "none" (no dividir): cada uno se hace cargo de lo suyo; se informa el % de cada uno.

alter table public.expenses add column is_refund boolean generated always as (amount < 0) stored;

alter table public.groups drop constraint groups_split_mode_check;
alter table public.groups add constraint groups_split_mode_check
  check (split_mode in ('proportional', 'proportional_capped', 'equal', 'fixed', 'none'));

-- Los ingresos no pueden ser negativos.
alter table public.incomes add constraint incomes_amount_positive check (amount > 0) not valid;

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
  v_refunds jsonb;
  v_refunds_total numeric;
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
    select e.paid_by as user_id, e.category_id, e.amount, e.amount < 0 as refund
    from expenses e where e.period_id = p_period
    union all
    select ip.paid_by, ip.category_id,
           installment_amount(ip.total_amount, ip.installments_total, ip.installments_paid + 1), false
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
  if v_group.split_mode = 'none' then
    -- sin división: a cada uno le corresponde lo que pagó; solo se informa su % del total
    update _stats set share = paid,
                      ratio = case when v_total_exp <> 0 then paid / v_total_exp else 0 end
     where true;
  else
    ratios := split_ratios(incs, mems, v_group.split_mode, v_group.split_min, v_group.split_max, pcts);
    for i in 1..coalesce(array_length(ids, 1), 0) loop
      update _stats set ratio = ratios[i], share = round(v_total_exp * ratios[i], 2) where user_id = ids[i];
    end loop;
  end if;
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

  -- Devoluciones / reintegros (montos negativos), aparte y por categoría.
  select coalesce(-sum(amount), 0) into v_refunds_total from _charges where refund;
  select coalesce(jsonb_agg(jsonb_build_object(
           'category_id', t.category_id, 'name', coalesce(c.name, 'Sin categoría'),
           'color', coalesce(c.color, '#7a8f82'), 'total', t.total) order by t.total desc), '[]'::jsonb)
    into v_refunds
  from (select category_id, -sum(amount) as total from _charges where refund group by category_id) t
  left join categories c on c.id = t.category_id;

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
    'refunds_total', v_refunds_total,
    'refunds', v_refunds,
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
      where m.group_id = p.group_id and p.split_mode not in ('equal', 'fixed', 'none')
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
  if v_mode not in ('equal', 'fixed', 'none') and (v_summary ->> 'total_income')::numeric <= 0 then
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
