import { useState, type FormEvent } from 'react'
import { errorText, supabase } from '../lib/supabase'
import type { Category, FixedExpense } from '../lib/types'
import { useCategories, useFixed, useInvalidate } from '../state/data'
import { useGroup } from '../state/session'
import { CategoryChips, Sheet } from './ui'

export const PALETTE = [
  '#3b82f6', '#ef4444', '#f59e0b', '#eab308', '#a16207', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#6366f1', '#f43f5e', '#0ea5e9', '#d946ef', '#78350f', '#64748b', '#14b8a6',
]

export function CategorySheet({ cat, onClose, onSaved }: { cat: Category | 'new'; onClose: () => void; onSaved?: (id: string) => void }) {
  const { group } = useGroup()
  const { active } = useCategories()
  const invalidate = useInvalidate()
  const isNew = cat === 'new'
  const [name, setName] = useState(isNew ? '' : cat.name)
  const [color, setColor] = useState(isNew ? (PALETTE.find((c) => !active.some((a) => a.color === c)) ?? PALETTE[active.length % PALETTE.length]) : cat.color)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const { data, error } = isNew
      ? await supabase.from('categories').insert({ group_id: group.id, name: n, color, sort: active.length + 1 }).select('id').single()
      : await supabase.from('categories').update({ name: n, color }).eq('id', cat.id).select('id').single()
    if (error) return setErr(errorText(error))
    await invalidate()
    onSaved?.(data.id)
    onClose()
  }

  async function remove() {
    if (isNew || !confirm(`¿Eliminar «${cat.name}»? Los gastos ya cargados la conservan.`)) return
    const { error } = await supabase.from('categories').update({ archived: true }).eq('id', cat.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nueva categoría' : 'Editar categoría'}>
      <form className="stack" onSubmit={save}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" autoFocus={isNew} />
        <div className="chips">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}
              style={{ width: 36, height: 36, borderRadius: 99, background: c, cursor: 'pointer',
                border: color === c ? '3px solid var(--text)' : '3px solid transparent' }} />
          ))}
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!name.trim()}>Guardar</button>
        {!isNew && <button type="button" className="btn ghost danger" onClick={remove}>Eliminar categoría</button>}
      </form>
    </Sheet>
  )
}


export function FixedTemplateSheet({ fixed, onClose }: { fixed: FixedExpense | 'new'; onClose: () => void }) {
  const { group } = useGroup()
  const { active } = useCategories()
  const all = useFixed().data ?? []
  const invalidate = useInvalidate()
  const isNew = fixed === 'new'
  const [desc, setDesc] = useState(isNew ? '' : fixed.description)
  const [cat, setCat] = useState<string | null>(isNew ? null : fixed.category_id)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const d = desc.trim()
    if (!d || !cat) return
    const { error } = isNew
      ? await supabase.from('fixed_expenses').insert({ group_id: group.id, description: d, category_id: cat, sort: all.length + 1 })
      : await supabase.from('fixed_expenses').update({ description: d, category_id: cat }).eq('id', fixed.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  async function remove() {
    if (isNew || !confirm(`¿Eliminar el fijo «${fixed.description}»? Deja de ser obligatorio para cerrar el mes.`)) return
    const { error } = await supabase.from('fixed_expenses').update({ active: false }).eq('id', fixed.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}>
      <form className="stack" onSubmit={save}>
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Alquiler, Luz, Internet" autoFocus={isNew} />
        <span className="label">Categoría</span>
        <CategoryChips categories={active} value={cat} onChange={setCat} />
        <p className="small faint" style={{ margin: 0 }}>Cada mes solo hay que completar quién pagó y cuánto.</p>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!desc.trim() || !cat}>Guardar</button>
        {!isNew && <button type="button" className="btn ghost danger" onClick={remove}>Eliminar fijo</button>}
      </form>
    </Sheet>
  )
}
