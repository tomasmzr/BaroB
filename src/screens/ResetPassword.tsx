import { useState, type FormEvent } from 'react'
import { LogoMark, Wordmark } from '../components/ui'
import { errorText, supabase } from '../lib/supabase'

/** Se muestra al abrir el link de "olvidé mi contraseña" (puede abrirse en Safari, fuera de la app instalada). */
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(errorText(error))
    setOk(true)
  }

  return (
    <div className="center-screen stack" style={{ gap: 16 }}>
      <div className="row"><LogoMark size={40} /><Wordmark size={24} /></div>
      {ok ? (
        <>
          <h2 style={{ margin: 0 }}>Contraseña actualizada</h2>
          <p className="muted" style={{ margin: 0 }}>Si tenés BaroB instalada en el celular, abrila desde el ícono y entrá con la contraseña nueva.</p>
          <button className="btn primary block" onClick={onDone}>Seguir acá</button>
        </>
      ) : (
        <form className="stack" onSubmit={save}>
          <h2 style={{ margin: 0 }}>Elegí una contraseña nueva</h2>
          <input className="input" type="password" autoComplete="new-password" minLength={6} required autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          {err && <p className="error">{err}</p>}
          <button className="btn primary block" disabled={busy || password.length < 6}>Guardar</button>
        </form>
      )}
    </div>
  )
}
