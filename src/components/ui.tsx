import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { initials, money } from '../lib/format'
import type { Category, Member } from '../lib/types'

/* ---------- Íconos (trazo simple, 24px) ---------- */
const paths = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  plus: 'M12 5v14M5 12h14',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 18l-6-6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  card: 'M3 6h18v12H3zM3 10h18',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 13.5h.5',
} as const
export type IconName = keyof typeof paths

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="BaroB">
      <rect width="512" height="512" rx="112" fill="#111412" />
      <g fill="none" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#3a7d58">
          <path d="M256 132 H216 a56 56 0 0 0 0 112 H256" />
          <path d="M256 244 H206 a68 68 0 0 0 0 136 H256" />
        </g>
        <g stroke="#5cc38a">
          <path d="M256 132 H296 a56 56 0 0 1 0 112 H256" />
          <path d="M256 244 H306 a68 68 0 0 1 0 136 H256" />
          <path d="M256 132 V380" />
        </g>
      </g>
    </svg>
  )
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <b>B</b>aro<b>B</b>
    </span>
  )
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Cargando" />
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar">{initials(name)}</span>
}

export function Money({ value, currency, className = '' }: { value: number; currency?: string; className?: string }) {
  return <span className={`amount ${value < 0 ? 'neg' : ''} ${className}`}>{money(value, currency)}</span>
}

/* ---------- Sheet ---------- */
export function Sheet({ open, onClose, children, title }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && (
          <div className="between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  const show = useCallback((m: string) => setMsg(m), [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Selectores ---------- */
export function PayerChips({ members, value, onChange, meId }: {
  members: Member[]; value: string; onChange: (id: string) => void; meId: string
}) {
  const sorted = [...members].sort((a, b) => (a.user_id === meId ? -1 : b.user_id === meId ? 1 : 0))
  return (
    <div className="chips scroll">
      {sorted.map((m) => (
        <button key={m.user_id} type="button" className="chip" aria-pressed={value === m.user_id}
          onClick={() => onChange(m.user_id)}>
          {m.user_id === meId ? 'Yo' : m.profile?.display_name || '?'}
        </button>
      ))}
    </div>
  )
}

export function CategoryChips({ categories, value, onChange }: {
  categories: Category[]; value: string | null; onChange: (id: string) => void
}) {
  return (
    <div className="chips">
      {categories.map((c) => (
        <button key={c.id} type="button" className="chip" aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

export function Stepper({ value, onChange, min = 1, max = 120 }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n || min))
  const [text, setText] = useState<string | null>(null)
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - 1))} aria-label="Menos">−</button>
      <input inputMode="numeric" aria-label="Cantidad" value={text ?? value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 3)
          setText(t)
          const n = parseInt(t, 10)
          if (n >= min && n <= max) onChange(n)
        }}
        onBlur={() => { onChange(clamp(parseInt(text ?? String(value), 10))); setText(null) }} />
      <button type="button" onClick={() => onChange(clamp(value + 1))} aria-label="Más">+</button>
    </div>
  )
}
