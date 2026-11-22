const moneyFmt = new Map<string, Intl.NumberFormat>()

export function money(n: number | string | null | undefined, currency = 'ARS'): string {
  const v = Number(n ?? 0)
  let f = moneyFmt.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 })
    moneyFmt.set(currency, f)
  }
  return f.format(v)
}

export function pct(part: number, total: number): string {
  if (!total) return '—'
  return `${Math.round((part / total) * 1000) / 10}%`
}

const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
const shortFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })

/** Fechas `YYYY-MM-DD` se interpretan en hora local. */
function toDate(d: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d)
}
export const dayLabel = (d: string) => dayFmt.format(toDate(d))
export const shortDate = (d: string) => shortFmt.format(toDate(d))
export const monthLabel = (d: string) => monthFmt.format(toDate(d))

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Acepta "1.234,56", "1234.56", "-500" → número o null. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/\s|\$/g, '')
  if (!t || t === '-') return null
  let norm = t
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) norm = t.replace(/\./g, '')
  else if (/^-?\d{1,3}\.\d{3}$/.test(t)) norm = t.replace('.', '')
  const n = Number(norm)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Monto de la cuota k (1..n). Igual que installment_amount() en SQL. */
export function installmentAmount(total: number, n: number, k: number): number {
  const base = Math.round((total / n) * 100) / 100
  return k < n ? base : Math.round((total - base * (n - 1)) * 100) / 100
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}
