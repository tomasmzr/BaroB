import { useMemo, useRef, useState, type FormEvent } from 'react'
import { installmentAmount, money, parseAmount, todayISO } from '../lib/format'
import { notify } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Expense, InstallmentPlan } from '../lib/types'
import { useCategories, useInvalidate, useMembers, useOpenPeriod, useRecentDescriptions } from '../state/data'
import { useGroup } from '../state/session'
import { CategoryChips, PayerChips, Stepper, Switch, useToast } from './ui'

type Props =
  | { mode: 'add'; onDone: () => void }
  | { mode: 'edit-expense'; expense: Expense; onDone: () => void }
  | { mode: 'edit-plan'; plan: InstallmentPlan; onDone: () => void }

function fmtInput(n: number): string {
  return String(n).replace('.', ',')
}

export default function ExpenseForm(props: Props) {
  const { group, userId } = useGroup()
  const members = useMembers().data ?? []
  const { active: categories, byId } = useCategories()
  const period = useOpenPeriod().data
  const recentsData = useRecentDescriptions().data
  const recents = useMemo(() => recentsData ?? [], [recentsData])
  const invalidate = useInvalidate()
  const toast = useToast()

  const exp = props.mode === 'edit-expense' ? props.expense : null
  const plan = props.mode === 'edit-plan' ? props.plan : null

  const [amountText, setAmountText] = useState(
    exp ? fmtInput(exp.amount) : plan ? fmtInput(plan.total_amount) : '',
  )
  const [description, setDescription] = useState(exp?.description ?? plan?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(exp?.category_id ?? plan?.category_id ?? null)
  const [payer, setPayer] = useState(exp?.paid_by ?? plan?.paid_by ?? userId)
  const [date, setDate] = useState(exp?.spent_at ?? todayISO())
  const [inInstallments, setInInstallments] = useState(!!plan)
  const [count, setCount] = useState(plan?.installments_total ?? 3)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [focusDesc, setFocusDesc] = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  const amount = parseAmount(amountText)
  const isFixed = !!exp?.fixed_expense_id
  const minCount = plan ? Math.max(1, plan.installments_paid + 1) : 2

  // Categorías visibles: activas + la actual si fue archivada.
  const cats = useMemo(() => {
    const cur = categoryId ? byId.get(categoryId) : undefined
    return cur && cur.archived ? [...categories, cur] : categories
  }, [categories, byId, categoryId])

  const suggestions = useMemo(() => {
    const q = description.trim().toLowerCase()
    if (!q) return recents.slice(0, 6)
    return recents.filter((r) => r.description.toLowerCase().includes(q) && r.description.toLowerCase() !== q).slice(0, 5)
  }, [recents, description])

  function pickSuggestion(r: { description: string; category_id: string | null }) {
    setDescription(r.description)
    if (r.category_id && byId.get(r.category_id) && !byId.get(r.category_id)!.archived) setCategoryId(r.category_id)
    descRef.current?.blur()
  }

  function onDescChange(v: string) {
    setDescription(v)
    // Si coincide exacto con algo ya cargado, sugerimos su categoría.
    const hit = recents.find((r) => r.description.toLowerCase() === v.trim().toLowerCase())
    if (hit?.category_id && !categoryId) setCategoryId(hit.category_id)
  }

  const canSave = amount !== null && amount !== 0 && description.trim() && (categoryId || isFixed) && payer && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || amount === null) return
    setBusy(true)
    setErr(null)
    try {
      if (props.mode === 'add') {
        if (!period) throw new Error('No hay un mes abierto.')
        if (inInstallments && count > 1) {
          const { data, error } = await supabase.from('installment_plans').insert({
            group_id: group.id, description: description.trim(), category_id: categoryId, paid_by: payer,
            total_amount: amount, installments_total: count,
          }).select('id').single()
          if (error) throw error
          notify({ type: 'installment', id: data.id })
          toast(`Guardado en ${count} cuotas de ${money(installmentAmount(amount, count, 1), group.currency)}`)
        } else {
          const { data, error } = await supabase.from('expenses').insert({
            group_id: group.id, period_id: period.id, description: description.trim(), amount,
            paid_by: payer, category_id: categoryId, spent_at: date,
          }).select('id').single()
          if (error) throw error
          notify({ type: 'expense', id: data.id })
          toast('Gasto guardado')
        }
      } else if (exp) {
        const patch = isFixed ? { amount, paid_by: payer, spent_at: date }
          : { amount, paid_by: payer, spent_at: date, description: description.trim(), category_id: categoryId }
        const { error } = await supabase.from('expenses').update(patch).eq('id', exp.id)
        if (error) throw error
        toast('Cambios guardados')
      } else if (plan) {
        const { error } = await supabase.from('installment_plans').update({
          description: description.trim(), category_id: categoryId, paid_by: payer,
          total_amount: amount, installments_total: count,
        }).eq('id', plan.id)
        if (error) throw error
        toast('Cuotas actualizadas')
      }
      await invalidate()
      props.onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const what = exp ? 'este gasto' : 'este gasto en cuotas (y sus cuotas pendientes)'
    if (!confirm(`¿Eliminar ${what}?`)) return
    setBusy(true)
    const { error } = exp
      ? await supabase.from('expenses').delete().eq('id', exp.id)
      : await supabase.from('installment_plans').delete().eq('id', plan!.id)
    setBusy(false)
    if (error) return setErr(errorText(error))
    toast('Eliminado')
    await invalidate()
    props.onDone()
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 18 }}>
      <div>
        <input
          className="amount-input num"
          inputMode="decimal"
          placeholder="$0"
          aria-label="Monto"
          autoFocus={props.mode === 'add'}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,-]/g, ''))}
        />
        {amount !== null && amount < 0 && (
          <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Monto negativo: devolución o compensación</p>
        )}
        <input
          ref={descRef}
          className="desc-input"
          placeholder="¿En qué?"
          aria-label="Descripción"
          value={description}
          disabled={isFixed}
          onFocus={() => setFocusDesc(true)}
          onBlur={() => setTimeout(() => setFocusDesc(false), 150)}
          onChange={(e) => onDescChange(e.target.value)}
          autoCapitalize="sentences"
        />
        {focusDesc && !isFixed && suggestions.length > 0 && (
          <div className="chips scroll" style={{ marginTop: 10 }}>
            {suggestions.map((s) => (
              <button key={s.description} type="button" className="chip" onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(s)}>{s.description}</button>
            ))}
          </div>
        )}
      </div>

      {!isFixed && (
        <div className="field">
          <span className="label">Categoría</span>
          <CategoryChips categories={cats} value={categoryId} onChange={setCategoryId} />
        </div>
      )}

      <div className="field">
        <span className="label">Pagó</span>
        <PayerChips members={members} value={payer} onChange={setPayer} meId={userId} />
      </div>

      {(props.mode === 'add' || plan) && (
        <div className="card" style={{ padding: 12 }}>
          <div className="between">
            <div>
              <div style={{ fontWeight: 560 }}>En cuotas</div>
              {inInstallments && amount ? (
                <div className="small muted num">
                  {count} × {money(installmentAmount(amount, count, 1), group.currency)} por mes
                </div>
              ) : (
                <div className="small faint">Se imputa una cuota por mes</div>
              )}
            </div>
            {plan ? (
              <Stepper value={count} onChange={setCount} min={minCount} />
            ) : (
              <div className="row">
                {inInstallments && <Stepper value={count} onChange={setCount} min={2} />}
                <Switch checked={inInstallments} onChange={setInInstallments} label="En cuotas" />
              </div>
            )}
          </div>
          {plan && (
            <div className="small muted" style={{ marginTop: 8 }}>
              Cuotas ya cerradas: {plan.installments_paid} de {plan.installments_total}. Este mes corre la {plan.installments_paid + 1}.
            </div>
          )}
        </div>
      )}

      {!(inInstallments && props.mode === 'add') && !plan && (
        <div className="between">
          <span className="label">Fecha</span>
          <input type="date" className="input" style={{ width: 'auto', height: 40 }} value={date}
            max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </div>
      )}

      {err && <p className="error">{err}</p>}

      <button className="btn primary block" disabled={!canSave} style={{ height: 54, fontSize: 17 }}>
        {busy ? 'Guardando…' : props.mode === 'add' ? 'Guardar' : 'Guardar cambios'}
      </button>
      {props.mode !== 'add' && !isFixed && (
        <button type="button" className="btn ghost danger block" onClick={remove} disabled={busy}>Eliminar</button>
      )}
    </form>
  )
}
