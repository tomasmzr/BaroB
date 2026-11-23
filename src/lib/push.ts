import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type NotifyEvent =
  | { type: 'expense'; id: string }
  | { type: 'fixed'; id: string }
  | { type: 'installment'; id: string }
  | { type: 'income'; id: string }
  | { type: 'period_closed'; id: string }

/** Avisa a los demás miembros (no bloquea la UI si falla). */
export function notify(ev: NotifyEvent): void {
  supabase.functions.invoke('notify', { body: ev }).catch(() => {})
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID
}

/** En iOS las notificaciones solo funcionan con la app agregada a la pantalla de inicio. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** serviceWorker.ready nunca resuelve si no hay SW (p.ej. en desarrollo): le ponemos tiempo límite. */
async function swReady(ms = 4000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await swReady()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado.')
  const reg = await swReady(10000)
  if (!reg) throw new Error('La app todavía no terminó de instalarse. Cerrala, abrila de nuevo y probá otra vez.')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }))
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
