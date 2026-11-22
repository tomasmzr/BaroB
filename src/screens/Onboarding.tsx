import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/ui'
import { errorText, supabase } from '../lib/supabase'
import { useSession } from '../state/session'

/** Primer ingreso: nombre visible + crear un grupo o unirse con un código. */
export default function Onboarding() {
  const { profile, userId, refreshGroups, selectGroup } = useSession()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [groupName, setGroupName] = useState('Casa')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function saveName() {
    if (name.trim() && name.trim() !== profile?.display_name) {
      const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId!)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await saveName()
      const { data, error } = await supabase.rpc('create_group', { p_name: groupName.trim() || 'Casa' })
      if (error) throw error
      selectGroup(data as string)
      await refreshGroups()
      nav('/settings', { replace: true })
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await saveName()
      const c = code.trim().split('/').pop()!.toUpperCase()
      const { data, error } = await supabase.rpc('join_group', { p_code: c })
      if (error) throw error
      selectGroup(data as string)
      await refreshGroups()
      nav('/', { replace: true })
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen stack" style={{ gap: 18 }}>
      <div className="row"><LogoMark size={40} /><Wordmark size={24} /></div>
      <div className="field">
        <label htmlFor="name">¿Cómo te llamamos?</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
      </div>

      <form className="card stack" onSubmit={create}>
        <b>Crear un grupo nuevo</b>
        <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nombre del grupo" />
        <button className="btn primary block" disabled={busy || !name.trim()}>Crear grupo</button>
        <span className="faint small">Después invitás al resto con un link.</span>
      </form>

      <form className="card stack" onSubmit={join}>
        <b>Unirme con una invitación</b>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código o link de invitación" autoCapitalize="characters" />
        <button className="btn block" disabled={busy || !name.trim() || !code.trim()}>Unirme</button>
      </form>

      {err && <p className="error">{err}</p>}
      <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Salir</button>
    </div>
  )
}
