import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Convierte errores de Supabase/Postgres en texto legible. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (msg.includes('invite_invalid')) return 'La invitación no existe o venció.'
  if (msg.includes('cannot_close')) return 'Todavía hay cosas pendientes para cerrar el mes.'
  if (msg.includes('row-level security')) return 'No se puede modificar: el mes ya está cerrado o no tenés acceso.'
  if (msg.includes('Token has expired') || msg.includes('otp_expired')) return 'El código venció o es incorrecto.'
  if (msg.includes('rate limit')) return 'Demasiados intentos. Esperá unos minutos.'
  return msg
}
