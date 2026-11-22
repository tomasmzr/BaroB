-- Supabase activa pg_safeupdate en la API: todo UPDATE necesita WHERE.
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
    share = case when v_total_income > 0 then round(v_total_exp * income / v_total_income, 2) else 0 end
    where true;
  update _stats set balance = paid - share where true;

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
