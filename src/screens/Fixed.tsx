import { useMemo, useState, type FormEvent } from 'react'
import { FixedTemplateSheet } from '../components/CatalogSheets'
import { AmountInput, Icon, Money, PayerChips, Sheet, Spinner, useToast } from '../components/ui'
import { amountToInput, money, parseAmount, todayISO } from '../lib/format'
import { notify } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Expense, FixedExpense } from '../lib/types'
import { useCategories, useExpenses, useFixed, useInvalidate, useMembers, useNames, useOpenPeriod } from '../state/data'
import { useGroup } from '../state/session'

export default function Fixed() {
  const { group } = useGroup()
  const period = useOpenPeriod().data
  const fixed = useFixed()
  const expenses = useExpenses(period?.id)
  const { byId } = useCategories()
  const { name } = useNames()
  const [open, setOpen] = useState<FixedExpense | null>(null)
  const [adding, setAdding] = useState(false)

  const paid = useMemo(() => {
    const m = new Map<string, Expense>()
    for (const e of expenses.data ?? []) if (e.fixed_expense_id) m.set(e.fixed_expense_id, e)
    return m
  }, [expenses.data])

  const list = fixed.data ?? []
  const done = list.filter((f) => paid.has(f.id)).length
  const pending = list.filter((f) => !paid.has(f.id))
  const completed = list.filter((f) => paid.has(f.id))

  if (fixed.isLoading) return <div className="page"><Spinner /></div>

  return (
    <div className="page">
      <div className="top">
        <div>
          <h1>Gastos fijos</h1>
          <div className="sub">Todos tienen que estar completos para cerrar el mes</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="list">
          <div className="item muted" style={{ cursor: 'default' }}>No hay gastos fijos definidos.</div>
          <button className="item add-row" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Agregar gasto fijo
            </button>
        </div>
      ) : (
        <>
          <div className="card" data-tour="fixed">
            <div className="between">
              <b>{done} de {list.length} completos</b>
              {done === list.length ? <span className="badge ok">Listo</span> : <span className="badge warn">Faltan {list.length - done}</span>}
            </div>
            <div className="bar" style={{ marginTop: 10 }}><span style={{ width: `${(done / list.length) * 100}%` }} /></div>
          </div>

          {pending.length > 0 && (
            <>
              <div className="section-title">Pendientes</div>
              <div className="list">
                {pending.map((f) => {
                  const cat = f.category_id ? byId.get(f.category_id) : undefined
                  return (
                    <button key={f.id} className="item" onClick={() => setOpen(f)}>
                      <span className="dot" style={{ background: 'transparent', border: `2px solid ${cat?.color ?? 'var(--text-3)'}` }} />
                      <div className="grow">
                        <div className="title">{f.description}</div>
                        <div className="meta">{cat?.name ?? 'Sin categoría'}</div>
                      </div>
                      <span className="badge warn">Completar</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <div className="section-title">Completos</div>
              <div className="list">
                {completed.map((f) => {
                  const e = paid.get(f.id)!
                  const cat = f.category_id ? byId.get(f.category_id) : undefined
                  return (
                    <button key={f.id} className="item" onClick={() => setOpen(f)}>
                      <span className="dot" style={{ background: cat?.color ?? 'var(--text-3)' }} />
                      <div className="grow">
                        <div className="title">{f.description}</div>
                        <div className="meta">Pagó {name(e.paid_by, { me: true })}</div>
                      </div>
                      <Money value={e.amount} currency={group.currency} />
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div className="list" style={{ marginTop: 12 }}>
            <button className="item add-row" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Agregar gasto fijo
            </button>
          </div>
        </>
      )}

      {adding && <FixedTemplateSheet fixed="new" onClose={() => setAdding(false)} />}
      {open && period && (
        <FixedSheet key={open.id} fixed={open} existing={paid.get(open.id)} periodId={period.id} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

function FixedSheet({ fixed, existing, periodId, onClose }: {
  fixed: FixedExpense; existing?: Expense; periodId: string; onClose: () => void
}) {
  const { group, userId } = useGroup()
  const members = useMembers().data ?? []
  const invalidate = useInvalidate()
  const toast = useToast()
  const [amountText, setAmountText] = useState(existing ? amountToInput(existing.amount) : '')
  const [payer, setPayer] = useState(existing?.paid_by ?? userId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const amount = parseAmount(amountText)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (amount === null) return
    setBusy(true)
    setErr(null)
    try {
      if (existing) {
        const { error } = await supabase.from('expenses').update({ amount, paid_by: payer }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('expenses').insert({
          group_id: group.id, period_id: periodId, fixed_expense_id: fixed.id, description: fixed.description,
          category_id: fixed.category_id, amount, paid_by: payer, spent_at: todayISO(),
        }).select('id').single()
        if (error) throw error
        notify({ type: 'fixed', id: data.id })
      }
      toast(`${fixed.description}: ${money(amount, group.currency)}`)
      await invalidate()
      onClose()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (!existing || !confirm('¿Dejar este fijo sin completar?')) return
    setBusy(true)
    const { error } = await supabase.from('expenses').delete().eq('id', existing.id)
    setBusy(false)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={fixed.description}>
      <form className="stack" onSubmit={save} style={{ gap: 18 }}>
        <AmountInput value={amountText} onChange={setAmountText} autoFocus />
        <div className="field">
          <span className="label">Pagó</span>
          <PayerChips members={members} value={payer} onChange={setPayer} meId={userId} />
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={busy || amount === null}>
          <Icon name="check" /> {existing ? 'Guardar' : 'Marcar como pagado'}
        </button>
        {existing && <button type="button" className="btn ghost danger" onClick={clear} disabled={busy}>Quitar pago</button>}
      </form>
    </Sheet>
  )
}
