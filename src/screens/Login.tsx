import { useState, type FormEvent } from 'react'
import { LogoMark, Wordmark } from '../components/ui'
import { errorText, supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) setErr(errorText(error))
    else setStep('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(errorText(error))
  }

  return (
    <div className="center-screen">
      <div className="stack" style={{ alignItems: 'center', marginBottom: 32, gap: 14 }}>
        <LogoMark size={72} />
        <Wordmark size={30} />
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Los gastos de la casa, en proporción a lo que gana cada uno.</p>
      </div>

      {step === 'email' ? (
        <form className="stack" onSubmit={sendCode}>
          <div className="field">
            <label htmlFor="email">Tu email</label>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@mail.com" />
          </div>
          <button className="btn primary block" disabled={busy || !email}>{busy ? 'Enviando…' : 'Recibir código'}</button>
          <p className="faint small" style={{ textAlign: 'center', margin: 0 }}>Sin contraseñas: te mandamos un código de un solo uso.</p>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <p className="muted" style={{ margin: 0 }}>Te mandamos un código a <b>{email}</b>.</p>
          <div className="field">
            <label htmlFor="code">Código</label>
            <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456"
              style={{ fontSize: 24, letterSpacing: '0.3em', textAlign: 'center' }} />
          </div>
          <button className="btn primary block" disabled={busy || code.length < 6}>{busy ? 'Verificando…' : 'Entrar'}</button>
          <div className="between">
            <button type="button" className="btn ghost sm" onClick={() => { setStep('email'); setCode('') }}>Cambiar email</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => sendCode()}>Reenviar</button>
          </div>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  )
}
