import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LogoMark, Spinner } from '../components/ui'
import { errorText, supabase } from '../lib/supabase'
import { useSession } from '../state/session'

export default function Join() {
  const { code = '' } = useParams()
  const { groups, refreshGroups, selectGroup, profile, userId } = useSession()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const info = useQuery({
    queryKey: ['invite', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invite_info', { p_code: code })
      if (error) throw error
      return (data as { group_id: string; group_name: string; members: number }[])[0] ?? null
    },
  })

  const already = info.data && groups.some((g) => g.id === info.data!.group_id)

  async function accept() {
    setBusy(true)
    setErr(null)
    try {
      if (name.trim()) {
        await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId!)
        qc.invalidateQueries({ queryKey: ['profile'] })
      }
      const { data, error } = await supabase.rpc('join_group', { p_code: code })
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

  if (info.isLoading) return <div className="center-screen"><Spinner /></div>

  return (
    <div className="center-screen stack" style={{ gap: 16 }}>
      <LogoMark size={56} />
      {!info.data ? (
        <>
          <h2 style={{ margin: 0 }}>Invitación inválida</h2>
          <p className="muted">El link no existe o venció. Pedí uno nuevo.</p>
          <button className="btn block" onClick={() => nav('/', { replace: true })}>Volver</button>
        </>
      ) : already ? (
        <>
          <h2 style={{ margin: 0 }}>Ya sos parte de «{info.data.group_name}»</h2>
          <button className="btn primary block" onClick={() => { selectGroup(info.data!.group_id); nav('/', { replace: true }) }}>Ir al grupo</button>
        </>
      ) : (
        <>
          <h2 style={{ margin: 0 }}>Te invitaron a «{info.data.group_name}»</h2>
          <p className="muted" style={{ margin: 0 }}>{info.data.members} miembro{info.data.members === 1 ? '' : 's'}. Todos pueden ver y editar todo.</p>
          {!profile?.display_name || profile.display_name === profile.email?.split('@')[0] ? (
            <div className="field">
              <label htmlFor="n">Tu nombre</label>
              <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={profile?.display_name} />
            </div>
          ) : null}
          <button className="btn primary block" disabled={busy} onClick={accept}>Unirme</button>
          <button className="btn ghost" onClick={() => nav('/', { replace: true })}>Ahora no</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  )
}
