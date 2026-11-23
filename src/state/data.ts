import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Blockers, Category, Expense, FixedExpense, Income, InstallmentPlan, Member, Period, Summary,
} from '../lib/types'
import { DEMO_ID, demoData } from './demo'
import { useGroup } from './session'

async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

const numify = <T extends object>(r: T, keys: (keyof T)[]): T => {
  for (const k of keys) (r as Record<string, unknown>)[k as string] = Number(r[k])
  return r
}

/** Escucha cambios del grupo y refresca las consultas. */
export function useRealtime() {
  const { group } = useGroup()
  const qc = useQueryClient()
  useEffect(() => {
    const gid = group.id
    if (gid === DEMO_ID) return
    const ch = supabase.channel(`group:${gid}`)
    for (const table of ['expenses', 'incomes', 'installment_plans', 'periods', 'fixed_expenses', 'categories', 'group_members']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${gid}` }, () => {
        qc.invalidateQueries({ queryKey: [gid] })
      })
    }
    ch.subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') qc.invalidateQueries({ queryKey: [gid] })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
    }
  }, [group.id, qc])
}

export function useInvalidate() {
  const { group } = useGroup()
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [group.id] })
}

export function useMembers() {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'members'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).members : () =>
      rows<Member[]>(
        supabase.from('group_members').select('user_id, joined_at, split_pct, profile:profiles(id, display_name, email)')
          .eq('group_id', group.id).order('joined_at'),
      ),
  })
}

/** Mapa user_id → nombre visible (con "vos" para el usuario actual si se pide). */
export function useNames() {
  const { data } = useMembers()
  const { userId } = useGroup()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const x of data ?? []) m.set(x.user_id, x.profile?.display_name || x.profile?.email || '?')
    return {
      name: (id: string | null | undefined, opts?: { me?: boolean }) =>
        !id ? '—' : opts?.me && id === userId ? 'Vos' : (m.get(id) ?? 'Ex miembro'),
    }
  }, [data, userId])
}

export function useCategories() {
  const { group, userId } = useGroup()
  const q = useQuery({
    queryKey: [group.id, 'categories'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).categories : () =>
      rows<Category[]>(supabase.from('categories').select('*').eq('group_id', group.id).order('sort').order('name')),
  })
  const byId = useMemo(() => new Map((q.data ?? []).map((c) => [c.id, c])), [q.data])
  const active = useMemo(() => (q.data ?? []).filter((c) => !c.archived), [q.data])
  return { ...q, byId, active }
}

export function useFixed() {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'fixed'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).fixed : () =>
      rows<FixedExpense[]>(
        supabase.from('fixed_expenses').select('*').eq('group_id', group.id).eq('active', true).order('sort').order('description'),
      ),
  })
}

export function useOpenPeriod() {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'period'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).period : () =>
      rows<Period>(
        supabase.from('periods').select('id, group_id, number, month, started_at, closed_at').eq('group_id', group.id)
          .is('closed_at', null).single(),
      ),
  })
}

export function useExpenses(periodId: string | undefined) {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'expenses', periodId],
    enabled: !!periodId,
    queryFn: group.id === DEMO_ID ? async () => (periodId === demoData(userId).period.id ? demoData(userId).expenses : []) : async () =>
      (await rows<Expense[]>(
        supabase.from('expenses').select('*').eq('period_id', periodId!)
          .order('spent_at', { ascending: false }).order('created_at', { ascending: false }),
      )).map((e) => numify(e, ['amount'])),
  })
}

export function useIncomes(periodId: string | undefined) {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'incomes', periodId],
    enabled: !!periodId,
    queryFn: group.id === DEMO_ID ? async () => (periodId === demoData(userId).period.id ? demoData(userId).incomes : []) : async () =>
      (await rows<Income[]>(supabase.from('incomes').select('*').eq('period_id', periodId!).order('created_at')))
        .map((e) => numify(e, ['amount'])),
  })
}

export function usePlans() {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'plans'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).plans : async () =>
      (await rows<InstallmentPlan[]>(
        supabase.from('installment_plans').select('*').eq('group_id', group.id).is('finished_at', null)
          .order('created_at', { ascending: false }),
      )).map((e) => numify(e, ['total_amount'])),
  })
}

export function useSummary(periodId: string | undefined) {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'summary', periodId],
    enabled: !!periodId,
    queryFn: group.id === DEMO_ID ? async () => (periodId === demoData(userId).period.id ? demoData(userId).summary : demoData(userId).history.find((h) => h.id === periodId)?.summary ?? demoData(userId).summary) : () => rows<Summary>(supabase.rpc('period_summary', { p_period: periodId! })),
  })
}

export function useBlockers(periodId: string | undefined) {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'blockers', periodId],
    enabled: !!periodId,
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).blockers : () => rows<Blockers>(supabase.rpc('close_blockers', { p_period: periodId! })),
  })
}

export function useHistory() {
  const { group, userId } = useGroup()
  return useQuery({
    queryKey: [group.id, 'history'],
    queryFn: group.id === DEMO_ID ? async () => demoData(userId).history : () =>
      rows<Period[]>(
        supabase.from('periods').select('*').eq('group_id', group.id).not('closed_at', 'is', null)
          .order('number', { ascending: false }),
      ),
  })
}

/** Descripciones recientes → categoría usada, para sugerir al cargar. */
export function useRecentDescriptions() {
  const { group } = useGroup()
  return useQuery({
    queryKey: [group.id, 'recent'],
    staleTime: 5 * 60_000,
    queryFn: group.id === DEMO_ID ? async () => [] as { description: string; category_id: string | null; count: number }[] : async () => {
      const data = await rows<{ description: string; category_id: string | null }[]>(
        supabase.from('expenses').select('description, category_id').eq('group_id', group.id).is('fixed_expense_id', null)
          .order('created_at', { ascending: false }).limit(300),
      )
      const map = new Map<string, { description: string; category_id: string | null; count: number }>()
      for (const r of data) {
        const k = r.description.trim().toLowerCase()
        const cur = map.get(k)
        if (cur) cur.count++
        else map.set(k, { ...r, description: r.description.trim(), count: 1 })
      }
      return [...map.values()].sort((a, b) => b.count - a.count)
    },
  })
}
