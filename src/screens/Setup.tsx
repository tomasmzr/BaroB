import { LogoMark, Wordmark } from '../components/ui'

export default function Setup() {
  return (
    <div className="center-screen stack">
      <LogoMark size={64} />
      <Wordmark size={28} />
      <p className="muted">
        Falta configurar Supabase. Copiá <code>.env.example</code> a <code>.env.local</code> y completá
        <code> VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
      </p>
    </div>
  )
}
