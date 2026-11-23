import { useState, type FormEvent } from 'react'
import { LogoMark, Wordmark } from '../components/ui'
import { errorText, supabase } from '../lib/supabase'
import { useSession } from '../state/session'

type Mode = 'signin' | 'signup' | 'forgot'

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const { linkError } = useSession()
  const [err, setErr] = useState<string | null>(linkError)
  const [info, setInfo] = useState<string | null>(null)

  const cleanEmail = email.trim().toLowerCase()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: name.trim() || undefined } },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin + window.location.pathname,
        })
        if (error) throw error
        setInfo('Te mandamos un mail con un link para elegir una contraseña nueva. Abrilo, cambiala y después volvé a entrar acá.')
      }
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (m: Mode) => {
    setMode(m)
    setErr(null)
    setInfo(null)
  }

  return (
    <div className="center-screen">
      <div className="stack" style={{ alignItems: 'center', marginBottom: 28, gap: 14 }}>
        <LogoMark size={72} />
        <Wordmark size={30} />
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Tu app de gestión de gastos personales y familiares.</p>
      </div>

      {mode !== 'forgot' && (
        <div className="chips" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <button type="button" className="chip" aria-pressed={mode === 'signin'} onClick={() => switchTo('signin')}>Entrar</button>
          <button type="button" className="chip" aria-pressed={mode === 'signup'} onClick={() => switchTo('signup')}>Crear cuenta</button>
        </div>
      )}

      <form className="stack" onSubmit={submit}>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="name">Tu nombre</label>
            <input id="name" className="input" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te ven los demás" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@mail.com" />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" className="input" type="password" required minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : ''} />
          </div>
        )}
        <button className="btn primary block" disabled={busy || !email || (mode !== 'forgot' && password.length < 6)}>
          {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Mandarme el link'}
        </button>
      </form>

      {err && <p className="error">{err}</p>}
      {info && <p className="muted small">{info}</p>}

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        {mode === 'forgot' ? (
          <button className="btn ghost sm" onClick={() => switchTo('signin')}>Volver</button>
        ) : mode === 'signin' ? (
          <button className="btn ghost sm" onClick={() => switchTo('forgot')}>¿Olvidaste tu contraseña?</button>
        ) : null}
      </div>
    </div>
  )
}
