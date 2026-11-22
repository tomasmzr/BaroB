/** Preferencias locales del dispositivo (no críticas: si no hay storage, se usan defaults). */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`barob.${key}`)
      return v === null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`barob.${key}`, JSON.stringify(value))
    } catch {
      /* sin storage */
    }
  },
}

export type Theme = 'system' | 'light' | 'dark'

export function applyTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem('barob.theme')
    else localStorage.setItem('barob.theme', t)
  } catch {
    /* sin storage */
  }
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

export function currentTheme(): Theme {
  try {
    const t = localStorage.getItem('barob.theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}
