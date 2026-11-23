// BaroB · notificaciones push a los demás miembros del grupo.
// Lo invoca el cliente después de guardar algo: { type, id }.
// Secrets necesarios: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej: mailto:vos@mail.com)
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type EventType = 'expense' | 'fixed' | 'installment' | 'income' | 'period_closed' | 'test'
interface Payload { title: string; body: string; url: string; tag?: string }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:barob@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

function money(n: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n)
}
function installment(total: number, n: number, k: number) {
  const base = Math.round((total / n) * 100) / 100
  return k < n ? base : Math.round((total - base * (n - 1)) * 100) / 100
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { type, id } = (await req.json()) as { type: EventType; id: string }
  const db = createClient(SUPABASE_URL, SERVICE)

  // Prueba: solo a los dispositivos del que la pide.
  if (type === 'test') {
    const sent = await send(db, new Map([[user.id, {
      title: 'Notificación de prueba', body: 'Las notificaciones funcionan en este dispositivo ✓', url: '#/settings', tag: 'test',
    }]]))
    return json({ sent })
  }

  // 1) Resolver grupo del evento
  const table = type === 'installment' ? 'installment_plans' : type === 'income' ? 'incomes'
    : type === 'period_closed' ? 'periods' : 'expenses'
  const { data: row } = await db.from(table).select('*').eq('id', id).single()
  if (!row) return json({ error: 'not found' }, 404)
  const groupId: string = row.group_id

  const { data: members } = await db.from('group_members').select('user_id, profiles(display_name)').eq('group_id', groupId)
  if (!members?.some((m) => m.user_id === user.id)) return json({ error: 'forbidden' }, 403)
  const { data: group } = await db.from('groups').select('name, currency').eq('id', groupId).single()
  const cur = group?.currency ?? 'ARS'
  // deno-lint-ignore no-explicit-any
  const nameOf = (uid: string) => (members.find((m) => m.user_id === uid)?.profiles as any)?.display_name ?? 'Alguien'
  const actor = nameOf(user.id)
  const recipients = members.map((m) => m.user_id).filter((u) => u !== user.id)

  // 2) Armar mensaje por destinatario
  const messages = new Map<string, Payload>()
  if (type === 'period_closed') {
    const s = row.summary as {
      split_mode?: string
      members: { user_id: string; balance: number; paid: number; ratio?: number }[]
      settlements: { from: string; to: string; amount: number }[]
    } | null
    if (!s) return json({ error: 'period not closed' }, 400)
    for (const uid of recipients) {
      const me = s.members.find((m) => m.user_id === uid)
      const gives = s.settlements.filter((t) => t.from === uid).map((t) => `${money(t.amount, cur)} a ${nameOf(t.to)}`)
      const gets = s.settlements.filter((t) => t.to === uid).map((t) => `${nameOf(t.from)} te da ${money(t.amount, cur)}`)
      let body = 'Estás al día, no hay que pasar plata.'
      if (s.split_mode === 'none' && me) {
        body = `Te correspondió el ${Math.round((me.ratio ?? 0) * 1000) / 10}% de los gastos (${money(me.paid, cur)}).`
      } else if (me && me.balance > 0.005) body = `Te tienen que devolver ${money(me.balance, cur)}. ${gets.join(' · ')}`
      else if (me && me.balance < -0.005) body = `Tenés que poner ${money(-me.balance, cur)}: ${gives.join(' · ')}`
      messages.set(uid, { title: `${group?.name}: ${monthName(row.month) ?? `mes ${row.number}`} cerrado`, body, url: `#/history/${row.id}`, tag: `close-${row.id}` })
    }
  } else {
    let p: Payload
    if (type === 'installment') {
      p = {
        title: `${actor} cargó un gasto en cuotas`,
        body: `${row.description} · ${row.installments_total} × ${money(installment(Number(row.total_amount), row.installments_total, 1), cur)} · pagó ${nameOf(row.paid_by)}`,
        url: '#/',
      }
    } else if (type === 'income') {
      p = { title: `${actor} cargó un ingreso`, body: `Ingreso de ${nameOf(row.user_id)} para el mes en curso`, url: '#/' }
    } else if (type === 'fixed') {
      p = { title: `${actor} completó un gasto fijo`, body: `${row.description} · ${money(Number(row.amount), cur)} · pagó ${nameOf(row.paid_by)}`, url: '#/fixed' }
    } else if (Number(row.amount) < 0) {
      p = { title: `${actor} cargó una devolución`, body: `${row.description} · ${money(-Number(row.amount), cur)} · recibió ${nameOf(row.paid_by)}`, url: '#/' }
    } else {
      p = { title: `${actor} cargó un gasto`, body: `${row.description} · ${money(Number(row.amount), cur)} · pagó ${nameOf(row.paid_by)}`, url: '#/' }
    }
    for (const uid of recipients) messages.set(uid, p)
  }

  return json({ sent: await send(db, messages) })
})

// deno-lint-ignore no-explicit-any
async function send(db: any, messages: Map<string, Payload>): Promise<number> {
  if (!messages.size) return 0
  const { data: subs } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', [...messages.keys()])
  let sent = 0
  await Promise.all((subs ?? []).map(async (s: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(messages.get(s.user_id)),
        { TTL: 60 * 60 * 24 },
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push error', code, (e as Error).message)
    }
  }))
  return sent
}

function monthName(month?: string | null): string | null {
  if (!month) return null
  const t = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month.slice(0, 10)}T12:00:00Z`)).replace(' de ', ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
