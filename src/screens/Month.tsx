import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ExpenseForm from '../components/ExpenseForm'
import { GroupPicker } from '../components/GroupPicker'
import IncomeSheet from '../components/IncomeSheet'
import { Avatar, Icon, Money, Sheet, Spinner } from '../components/ui'
import { dayLabel, installmentAmount, money, pct, periodName, shortDate } from '../lib/format'
import type { Expense, Income, InstallmentPlan, Summary } from '../lib/types'
import {
  useBlockers, useCategories, useExpenses, useFixed, useIncomes, useMembers, useNames, useOpenPeriod, usePlans, useSummary,
} from '../state/data'
import { useGroup } from '../state/session'

/** Barra de gasto sobre ingresos. Si se pasan, el excedente se pinta en rojo. */
export function SpendBar({ s, currency }: { s: Summary; currency: string }) {
  if (s.total_income <= 0) return null
  const over = s.total_expenses > s.total_income
  const greenW = over ? (s.total_income / s.total_expenses) * 100 : (s.total_expenses / s.total_income) * 100
  return (
    <div style={{ marginTop: 10 }}>
      <div className="bar">
        <span style={{ width: `${Math.max(0, greenW)}%`, borderRadius: over ? '99px 0 0 99px' : undefined }} />
        {over && <span className="bar-over" style={{ width: `${100 - greenW}%` }} />}
      </div>
      <div className="between small" style={{ marginTop: 6 }}>
        {over ? (
          <span className="over-text">Gastos superan ingresos en {money(s.total_expenses - s.total_income, currency)} (+{pct(s.total_expenses - s.total_income, s.total_income)})</span>
        ) : (
          <>
            <span className="muted">{pct(s.total_expenses, s.total_income)} de los ingresos</span>
            <span className="muted">Queda {pct(s.savings, s.total_income)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function Month() {
  const { group, userId } = useGroup()
  const period = useOpenPeriod()
  const pid = period.data?.id
  const expenses = useExpenses(pid)
  const incomes = useIncomes(pid)
  const plans = usePlans()
  const summary = useSummary(pid)
  const blockers = useBlockers(pid)
  const fixed = useFixed()
  const members = useMembers().data ?? []
  const { byId } = useCategories()
  const { name } = useNames()

  const [editing, setEditing] = useState<Expense | null>(null)
  const [editingPlan, setEditingPlan] = useState<InstallmentPlan | null>(null)
  const [incomeSheet, setIncomeSheet] = useState<{ userId: string; income?: Income } | null>(null)

  const byDay = useMemo(() => {
    const out: [string, Expense[]][] = []
    for (const e of expenses.data ?? []) {
      const last = out[out.length - 1]
      if (last && last[0] === e.spent_at) last[1].push(e)
      else out.push([e.spent_at, [e]])
    }
    return out
  }, [expenses.data])

  const incomesByUser = useMemo(() => {
    const m = new Map<string, Income[]>()
    for (const i of incomes.data ?? []) m.set(i.user_id, [...(m.get(i.user_id) ?? []), i])
    return m
  }, [incomes.data])

  if (period.isLoading) return <div className="page"><Spinner /></div>
  if (!period.data) return <div className="page"><p className="error">No se encontró el mes abierto.</p></div>

  const s = summary.data
  const me = s?.members.find((m) => m.user_id === userId)
  const missingIncomes = blockers.data?.missing_incomes ?? []
  const missingFixed = blockers.data?.missing_fixed ?? []
  const fixedTotal = fixed.data?.length ?? 0
  const cur = group.currency
  const pname = periodName(period.data.month, period.data.number)
  const equal = group.split_mode === 'equal'

  return (
    <div className="page">
      <div className="top">
        <div>
          <GroupPicker big />
          <div className="sub">{pname} · desde el {shortDate(period.data.started_at)}</div>
        </div>
      </div>

      {/* Resumen */}
      <div className="card" data-tour="summary">
        <div className="small muted">Gastos de {pname}</div>
        <div className="big">{money(s?.total_expenses ?? 0, cur)}</div>
        {s && <SpendBar s={s} currency={cur} />}
        <div className="stats">
          <div className="stat"><div className="label">Ingresos</div><div className="value">{money(s?.total_income ?? 0, cur)}</div></div>
          <div className="stat"><div className="label">Pusiste</div><div className="value">{money(me?.paid ?? 0, cur)}</div></div>
          <div className="stat"><div className="label">Te toca</div><div className="value">{money(me?.share ?? 0, cur)}</div></div>
        </div>
        {me && s && Math.abs(me.balance) >= 0.01 && (s.total_income > 0 || equal) && (
          <div className={`badge ${me.balance > 0 ? 'ok' : 'warn'}`} style={{ marginTop: 12 }}>
            {me.balance > 0 ? `Te tienen que devolver ${money(me.balance, cur)}` : `Te falta poner ${money(-me.balance, cur)}`}
          </div>
        )}
      </div>

      {/* Pendientes para cerrar */}
      <Link to="/close" data-tour="close" className={`card ${missingIncomes.length || missingFixed.length ? 'warn' : 'accent'}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, color: 'inherit' }}>
        <Icon name={missingIncomes.length || missingFixed.length ? 'alert' : 'check'} />
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Resumen y cierre de {pname}</div>
          <div className="small muted">
            {missingIncomes.length || missingFixed.length
              ? [
                  missingFixed.length ? `Fijos ${fixedTotal - missingFixed.length}/${fixedTotal}` : null,
                  missingIncomes.length ? `Falta ingreso de ${missingIncomes.map((u) => name(u, { me: true })).join(', ')}` : null,
                ].filter(Boolean).join(' · ')
              : 'Todo listo para cerrar'}
          </div>
        </div>
        <Icon name="chevron" size={18} />
      </Link>

      {/* Ingresos */}
      <div className="section-title" data-tour="incomes">Ingresos{equal && <span className="faint" style={{ textTransform: 'none', fontWeight: 400 }}> · opcionales (división equitativa)</span>}</div>
      <div className="stack" style={{ gap: 8 }}>
        {members.map((m) => {
          const list = incomesByUser.get(m.user_id) ?? []
          const total = list.reduce((a, i) => a + i.amount, 0)
          return (
            <div className="list" key={m.user_id}>
              <div className="item" style={{ cursor: 'default' }}>
                <Avatar name={m.profile?.display_name ?? '?'} />
                <div className="grow">
                  <div className="title">{name(m.user_id, { me: true })}</div>
                  <div className="meta">
                    {list.length === 0 ? 'Sin cargar' : s && s.total_income > 0 ? `${pct(total, s.total_income)} del total` : ''}
                  </div>
                </div>
                {list.length > 0 && <Money value={total} currency={cur} />}
              </div>
              {list.map((i) => (
                <button key={i.id} className="item sub-item" onClick={() => setIncomeSheet({ userId: m.user_id, income: i })}>
                  <span className="grow muted ellipsis">{i.note || 'Ingreso'}</span>
                  <span className="amount small">{money(i.amount, cur)}</span>
                </button>
              ))}
              <button className="item sub-item add-row" onClick={() => setIncomeSheet({ userId: m.user_id })}>
                <Icon name="plus" size={18} /> {list.length ? 'Agregar otro ingreso' : 'Cargar ingreso'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Cuotas */}
      {(plans.data?.length ?? 0) > 0 && (
        <>
          <div className="section-title">En cuotas</div>
          <div className="list">
            {plans.data!.map((p) => {
              const n = p.installments_paid + 1
              const cat = p.category_id ? byId.get(p.category_id) : undefined
              return (
                <button className="item" key={p.id} onClick={() => setEditingPlan(p)}>
                  <span className="dot" style={{ background: cat?.color ?? 'var(--text-3)' }} />
                  <div className="grow">
                    <div className="title ellipsis">{p.description}</div>
                    <div className="meta">
                      Cuota {n}/{p.installments_total} · {name(p.paid_by, { me: true })} · {p.installments_total - n === 0 ? 'última' : `faltan ${p.installments_total - n}`}
                    </div>
                    <div className="meta">Comprado el {shortDate(p.spent_at)} · total {money(p.total_amount, cur)}</div>
                  </div>
                  <Money value={installmentAmount(p.total_amount, p.installments_total, n)} currency={cur} />
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Gastos */}
      <div className="section-title">Gastos</div>
      {expenses.isLoading ? <Spinner /> : byDay.length === 0 ? (
        <div className="empty card">
          Todavía no hay gastos en {pname}.<br />
          <Link to="/add">Cargar el primero</Link>
        </div>
      ) : (
        byDay.map(([day, list]) => (
          <div key={day}>
            <div className="day-label">{dayLabel(day)}</div>
            <div className="list">
              {list.map((e) => {
                const cat = e.category_id ? byId.get(e.category_id) : undefined
                return (
                  <button className="item" key={e.id} onClick={() => setEditing(e)}>
                    <span className="dot" style={{ background: cat?.color ?? 'var(--text-3)' }} />
                    <div className="grow">
                      <div className="title ellipsis">{e.description}</div>
                      <div className="meta">
                        {e.fixed_expense_id && <span className="badge" style={{ marginRight: 6 }}>Fijo</span>}
                        {cat?.name ?? 'Sin categoría'} · {name(e.paid_by, { me: true })}
                      </div>
                    </div>
                    <Money value={e.amount} currency={cur} />
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.fixed_expense_id ? 'Gasto fijo' : 'Editar gasto'}>
        {editing && <ExpenseForm key={editing.id} mode="edit-expense" expense={editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!editingPlan} onClose={() => setEditingPlan(null)} title="Gasto en cuotas">
        {editingPlan && <ExpenseForm key={editingPlan.id} mode="edit-plan" plan={editingPlan} onDone={() => setEditingPlan(null)} />}
      </Sheet>
      {incomeSheet && pid && (
        <IncomeSheet key={incomeSheet.income?.id ?? `new-${incomeSheet.userId}`} onClose={() => setIncomeSheet(null)}
          periodId={pid} userId={incomeSheet.userId} income={incomeSheet.income} />
      )}
    </div>
  )
}
