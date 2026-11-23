export type UUID = string

export interface Profile {
  id: UUID
  display_name: string
  email: string | null
}

export type SplitMode = 'proportional' | 'proportional_capped' | 'equal' | 'fixed' | 'none'

export interface Group {
  id: UUID
  name: string
  currency: string
  split_mode: SplitMode
  split_min: number | null
  split_max: number | null
}

export interface Member {
  user_id: UUID
  joined_at: string
  /** fracción fija (0..1) para el modo 'fixed' */
  split_pct: number | null
  profile: Profile | null
}

export interface Category {
  id: UUID
  group_id: UUID
  name: string
  color: string
  sort: number
  archived: boolean
}

export interface FixedExpense {
  id: UUID
  group_id: UUID
  description: string
  category_id: UUID | null
  sort: number
  active: boolean
}

export interface Period {
  id: UUID
  group_id: UUID
  number: number
  /** primer día del mes que nombra al período (YYYY-MM-01) */
  month: string
  started_at: string
  closed_at: string | null
  summary: Summary | null
}

export interface Income {
  id: UUID
  period_id: UUID
  user_id: UUID
  amount: number
  note: string | null
  created_at: string
}

export interface Expense {
  id: UUID
  group_id: UUID
  period_id: UUID
  description: string
  amount: number
  paid_by: UUID
  category_id: UUID | null
  spent_at: string
  fixed_expense_id: UUID | null
  created_by: UUID | null
  created_at: string
}

export interface InstallmentPlan {
  id: UUID
  group_id: UUID
  description: string
  category_id: UUID | null
  paid_by: UUID
  total_amount: number
  installments_total: number
  installments_paid: number
  spent_at: string
  finished_at: string | null
  created_at: string
}

export interface SummaryMember {
  user_id: UUID
  name: string
  income: number
  paid: number
  /** fracción 0..1 del total que le toca */
  ratio?: number
  share: number
  balance: number
}

export interface Summary {
  month?: string
  split_mode?: SplitMode
  split_min?: number | null
  split_max?: number | null
  total_income: number
  total_expenses: number
  savings: number
  members: SummaryMember[]
  categories: { category_id: UUID | null; name: string; color: string; total: number }[]
  installments: { plan_id: UUID; description: string; paid_by: UUID; number: number; of: number; amount: number }[]
  settlements: { from: UUID; to: UUID; amount: number }[]
  /** devoluciones / reintegros (en positivo), ya descontados de sus categorías */
  refunds_total?: number
  refunds?: { category_id: UUID | null; name: string; color: string; total: number }[]
}

export interface Blockers {
  missing_incomes: UUID[]
  missing_fixed: UUID[]
}
