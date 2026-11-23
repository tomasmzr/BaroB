/**
 * Modo demo: mientras corre el tutorial la app muestra un grupo de ejemplo con datos ficticios
 * (no toca la base). Al terminar el tutorial se apaga y se ven los datos reales.
 */
import { useSyncExternalStore } from 'react'
import { installmentAmount } from '../lib/format'
import type {
  Blockers, Category, Expense, FixedExpense, Group, Income, InstallmentPlan, Member, Period, Summary,
} from '../lib/types'

let demo = false
const listeners = new Set<() => void>()
export function setDemo(v: boolean) {
  if (demo === v) return
  demo = v
  listeners.forEach((l) => l())
}
export function isDemo() {
  return demo
}
export function useDemo(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => demo)
}

export const DEMO_ID = 'demo'
export const DEMO_GROUP: Group = {
  id: DEMO_ID, name: 'Casa (ejemplo)', currency: 'ARS', split_mode: 'proportional', split_min: null, split_max: null,
}
const ANA = 'demo-ana'

const categories: Category[] = [
  ['c1', 'Casa', '#3b82f6'], ['c2', 'Servicios', '#f59e0b'], ['c3', 'Supermercado', '#ef4444'], ['c4', 'Auto', '#8b5cf6'],
  ['c5', 'Salud', '#ec4899'], ['c6', 'Salidas', '#f97316'], ['c7', 'Educación', '#06b6d4'], ['c8', 'Otros', '#a16207'],
].map(([id, name, color], i) => ({ id, group_id: DEMO_ID, name, color, sort: i + 1, archived: false }))

const fixed: FixedExpense[] = [
  ['f1', 'Expensas', 'c1'], ['f2', 'Luz', 'c2'], ['f3', 'Gas', 'c2'], ['f4', 'Agua', 'c2'], ['f5', 'Medicina prepaga', 'c5'],
].map(([id, description, category_id], i) => ({ id, group_id: DEMO_ID, description, category_id, sort: i + 1, active: true }))

const period: Period = {
  id: 'demo-p4', group_id: DEMO_ID, number: 4, month: '2026-11-01', started_at: '2026-10-30T20:00:00Z', closed_at: null, summary: null,
}

function exp(id: string, description: string, amount: number, paid_by: string, category_id: string, spent_at: string, fixed_expense_id: string | null = null): Expense {
  return {
    id, group_id: DEMO_ID, period_id: period.id, description, amount, paid_by, category_id, spent_at,
    fixed_expense_id, created_by: paid_by, created_at: `${spent_at}T12:00:00Z`,
  }
}

const catName = (id: string | null) => categories.find((c) => c.id === id)

function summaryOf(me: string, expenses: Expense[], plans: InstallmentPlan[], incomes: Income[]): Summary {
  const charges = [
    ...expenses.map((e) => ({ user: e.paid_by, cat: e.category_id, amount: e.amount })),
    ...plans.map((p) => ({ user: p.paid_by, cat: p.category_id, amount: installmentAmount(p.total_amount, p.installments_total, p.installments_paid + 1) })),
  ]
  const people = [me, ANA]
  const income = (u: string) => incomes.filter((i) => i.user_id === u).reduce((a, i) => a + i.amount, 0)
  const paid = (u: string) => charges.filter((c) => c.user === u).reduce((a, c) => a + c.amount, 0)
  const ti = people.reduce((a, u) => a + income(u), 0)
  const te = charges.reduce((a, c) => a + c.amount, 0)
  const members = people.map((u) => {
    const ratio = ti ? income(u) / ti : 0.5
    const share = Math.round(te * ratio * 100) / 100
    return { user_id: u, name: u === me ? 'Vos' : 'Ana', income: income(u), paid: paid(u), ratio, share, balance: Math.round((paid(u) - share) * 100) / 100 }
  })
  const byCat = new Map<string | null, number>()
  for (const c of charges) byCat.set(c.cat, (byCat.get(c.cat) ?? 0) + c.amount)
  const debtor = members.find((m) => m.balance < 0)
  const creditor = members.find((m) => m.balance > 0)
  return {
    month: period.month, split_mode: 'proportional', total_income: ti, total_expenses: te, savings: ti - te, members,
    categories: [...byCat.entries()].map(([id, total]) => ({ category_id: id, name: catName(id)?.name ?? 'Sin categoría', color: catName(id)?.color ?? '#7a8f82', total }))
      .sort((a, b) => b.total - a.total),
    installments: plans.map((p) => ({ plan_id: p.id, description: p.description, paid_by: p.paid_by, number: p.installments_paid + 1, of: p.installments_total, amount: installmentAmount(p.total_amount, p.installments_total, p.installments_paid + 1) })),
    settlements: debtor && creditor ? [{ from: debtor.user_id, to: creditor.user_id, amount: Math.min(-debtor.balance, creditor.balance) }] : [],
  }
}

function closed(n: number, month: string, me: string, totals: [string, number][], incMe: number, incAna: number, transfer: number): Period {
  const ti = incMe + incAna
  const te = totals.reduce((a, [, t]) => a + t, 0)
  const s: Summary = {
    month, split_mode: 'proportional', total_income: ti, total_expenses: te, savings: ti - te,
    members: [
      { user_id: me, name: 'Vos', income: incMe, paid: Math.round(te * incMe / ti) - transfer, ratio: incMe / ti, share: Math.round(te * incMe / ti), balance: -transfer },
      { user_id: ANA, name: 'Ana', income: incAna, paid: Math.round(te * incAna / ti) + transfer, ratio: incAna / ti, share: Math.round(te * incAna / ti), balance: transfer },
    ],
    categories: totals.map(([id, total]) => ({ category_id: id, name: catName(id)!.name, color: catName(id)!.color, total })),
    installments: [],
    settlements: [{ from: me, to: ANA, amount: transfer }],
  }
  return { id: `demo-p${n}`, group_id: DEMO_ID, number: n, month, started_at: `${month}T12:00:00Z`, closed_at: `${month.slice(0, 8)}28T20:00:00Z`, summary: s }
}

/** Todos los datos del grupo de ejemplo, armados alrededor del usuario real. */
export function demoData(me: string) {
  const members: Member[] = [
    { user_id: me, joined_at: '2026-08-01', split_pct: null, profile: { id: me, display_name: 'Vos', email: null } },
    { user_id: ANA, joined_at: '2026-08-01', split_pct: null, profile: { id: ANA, display_name: 'Ana', email: 'ana@ejemplo.com' } },
  ]
  const expenses: Expense[] = [
    exp('e1', 'Expensas', 85000, me, 'c1', '2026-11-03', 'f1'),
    exp('e2', 'Luz', 32000, ANA, 'c2', '2026-11-05', 'f2'),
    exp('e3', 'Gas', 18000, me, 'c2', '2026-11-06', 'f3'),
    exp('e4', 'Coto', 64500, ANA, 'c3', '2026-11-09'),
    exp('e5', 'Nafta', 40000, me, 'c4', '2026-11-12'),
    exp('e6', 'Cena con amigos', 28000, ANA, 'c6', '2026-11-15'),
    exp('e7', 'Farmacia', 12000, me, 'c5', '2026-11-18'),
    exp('e8', 'Devolución compra online', -5000, ANA, 'c8', '2026-11-19'),
  ].sort((a, b) => b.spent_at.localeCompare(a.spent_at))
  const incomes: Income[] = [
    { id: 'i1', period_id: period.id, user_id: me, amount: 900000, note: 'Sueldo', created_at: '2026-11-01' },
    { id: 'i2', period_id: period.id, user_id: ANA, amount: 600000, note: 'Sueldo', created_at: '2026-11-01' },
    { id: 'i3', period_id: period.id, user_id: ANA, amount: 80000, note: 'Freelance', created_at: '2026-11-10' },
  ]
  const plans: InstallmentPlan[] = [{
    id: 'pl1', group_id: DEMO_ID, description: 'Heladera', category_id: 'c1', paid_by: me, total_amount: 720000,
    installments_total: 12, installments_paid: 3, spent_at: '2026-08-14', finished_at: null, created_at: '2026-08-14',
  }]
  const blockers: Blockers = { missing_incomes: [], missing_fixed: ['f4', 'f5'] }
  const history: Period[] = [
    closed(3, '2026-10-01', me, [['c1', 145000], ['c2', 70000], ['c3', 210000], ['c4', 60000], ['c6', 95000], ['c5', 25000]], 900000, 600000, 18000),
    closed(2, '2026-09-01', me, [['c1', 140000], ['c2', 82000], ['c3', 190000], ['c4', 45000], ['c6', 150000], ['c7', 60000]], 880000, 600000, 41000),
    closed(1, '2026-08-01', me, [['c1', 860000], ['c2', 95000], ['c3', 220000], ['c4', 80000], ['c6', 120000], ['c8', 300000]], 880000, 560000, 9000),
  ]
  return {
    members, categories, fixed, period, expenses, incomes, plans, blockers, history,
    summary: summaryOf(me, expenses, plans, incomes),
  }
}
