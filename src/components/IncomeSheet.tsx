import { useState, type FormEvent } from 'react'
import { parseAmount } from '../lib/format'
import { notify } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Income } from '../lib/types'
import { useInvalidate, useNames } from '../state/data'
import { useGroup } from '../state/session'
import { Sheet, useToast } from './ui'

/** Alta o edición de un ingreso. Se cierra sola al guardar. */
export default function IncomeSheet({ onClose, periodId, userId, income }: {
  onClose: () => void; periodId: string; userId: string; income?: Income
}) {
  const { group } = useGroup()
  const { name } = useNames()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [amountText, setAmountText] = useState(income ? String(income.amount).replace('.', ',') : '')
  const [note, setNote] = useState(income?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const amount = parseAmount(amountText)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (amount === null) return
    setBusy(true)
    setErr(null)
    try {
      if (income) {
        const { error } = await supabase.from('incomes').update({ amount, note: note.trim() || null }).eq('id', income.id)
        if (error) throw error
        toast('Ingreso actualizado')
      } else {
        const { data, error } = await supabase.from('incomes')
          .insert({ group_id: group.id, period_id: periodId, user_id: userId, amount, note: note.trim() || null })
          .select('id').single()
        if (error) throw error
        notify({ type: 'income', id: data.id })
        toast('Ingreso guardado')
      }
      await invalidate()
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  async function remove() {
    if (!income || !confirm('¿Eliminar este ingreso?')) return
    setBusy(true)
    const { error } = await supabase.from('incomes').delete().eq('id', income.id)
    if (error) {
      setBusy(false)
      return setErr(errorText(error))
    }
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={`${income ? 'Editar ingreso' : 'Ingreso'} de ${name(userId, { me: true })}`}>
      <form className="stack" onSubmit={save}>
        <input className="amount-input num" inputMode="decimal" placeholder="$0" aria-label="Monto del ingreso" autoFocus
          value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,-]/g, ''))} />
        <input className="input" placeholder="Nota (opcional): sueldo, aguinaldo…" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={busy || amount === null || amount === 0}>
          {income ? 'Guardar cambios' : 'Agregar ingreso'}
        </button>
        {income && <button type="button" className="btn ghost danger" onClick={remove} disabled={busy}>Eliminar</button>}
      </form>
    </Sheet>
  )
}
