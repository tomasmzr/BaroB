import { useState, type FormEvent } from 'react'
import { money, parseAmount } from '../lib/format'
import { notify } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Income } from '../lib/types'
import { useInvalidate, useMembers, useNames } from '../state/data'
import { useGroup } from '../state/session'
import { Icon, PayerChips, Sheet, useToast } from './ui'

export default function IncomeSheet({ open, onClose, periodId, incomes, initialUser }: {
  open: boolean; onClose: () => void; periodId: string; incomes: Income[]; initialUser?: string
}) {
  const { group, userId } = useGroup()
  const members = useMembers().data ?? []
  const { name } = useNames()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [who, setWho] = useState(initialUser ?? userId)
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const amount = parseAmount(amountText)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (amount === null) return
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase.from('incomes')
      .insert({ group_id: group.id, period_id: periodId, user_id: who, amount, note: note.trim() || null })
      .select('id').single()
    setBusy(false)
    if (error) return setErr(errorText(error))
    notify({ type: 'income', id: data.id })
    setAmountText('')
    setNote('')
    toast('Ingreso guardado')
    invalidate()
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este ingreso?')) return
    const { error } = await supabase.from('incomes').delete().eq('id', id)
    if (error) return setErr(errorText(error))
    invalidate()
  }

  const mine = incomes.filter((i) => i.user_id === who)

  return (
    <Sheet open={open} onClose={onClose} title="Ingresos del mes">
      <form className="stack" onSubmit={add}>
        <PayerChips members={members} value={who} onChange={setWho} meId={userId} />
        <input className="amount-input num" inputMode="decimal" placeholder="$0" aria-label="Monto del ingreso"
          value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,-]/g, ''))} />
        <input className="input" placeholder="Nota (opcional): sueldo, aguinaldo…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary block" disabled={busy || amount === null || amount === 0}>Agregar ingreso</button>
        {err && <p className="error">{err}</p>}
      </form>
      {mine.length > 0 && (
        <>
          <div className="section-title">Cargados de {name(who, { me: true })}</div>
          <div className="list">
            {mine.map((i) => (
              <div className="item" key={i.id}>
                <div className="grow">
                  <div className="title">{money(i.amount, group.currency)}</div>
                  {i.note && <div className="meta">{i.note}</div>}
                </div>
                <button className="icon-btn" onClick={() => remove(i.id)} aria-label="Eliminar"><Icon name="trash" size={20} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}
