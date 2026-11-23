import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { errorText, supabase } from '../lib/supabase'
import { useGroup } from '../state/session'
import { Sheet } from './ui'

const NEW = '__new__'

/** Barra superior presente en todas las pantallas: grupo actual + lista para cambiar o crear otro. */
export function GroupBar() {
  const { group, groups, selectGroup } = useGroup()
  const nav = useNavigate()
  const loc = useLocation()
  const [creating, setCreating] = useState(false)

  function change(id: string) {
    if (id === NEW) return setCreating(true)
    selectGroup(id)
    // el detalle de un mes cerrado pertenece al grupo anterior
    if (loc.pathname.startsWith('/history/')) nav('/history', { replace: true })
  }

  return (
    <div className="group-bar">
      <label className="group-picker">
        <select value={group.id} onChange={(e) => change(e.target.value)} aria-label="Grupo actual">
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          <option value={NEW}>+ Crear grupo nuevo…</option>
        </select>
        <span className="group-name">{group.name}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </label>
      {creating && <NewGroupSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

export function NewGroupSheet({ onClose }: { onClose: () => void }) {
  const { selectGroup, refreshGroups } = useGroup()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name.trim(), p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    setBusy(false)
    if (error) return setErr(errorText(error))
    selectGroup(data as string)
    await refreshGroups()
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Nuevo grupo">
      <form className="stack" onSubmit={create}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Casa, Viaje, Personal" autoFocus />
        <p className="small faint" style={{ margin: 0 }}>
          Viene con categorías y gastos fijos típicos (expensas, luz, gas, agua, prepaga) que podés editar.
          Un grupo de una sola persona sirve para tus finanzas personales.
        </p>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!name.trim() || busy}>Crear</button>
      </form>
    </Sheet>
  )
}
