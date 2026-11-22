import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SummaryView from '../components/SummaryView'
import { Icon, Sheet, Spinner, useToast } from '../components/ui'
import { money } from '../lib/format'
import { notify } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import { useBlockers, useFixed, useInvalidate, useNames, useOpenPeriod, useSummary } from '../state/data'
import { useGroup } from '../state/session'

export default function CloseMonth() {
  const { group, userId } = useGroup()
  const period = useOpenPeriod().data
  const summary = useSummary(period?.id)
  const blockers = useBlockers(period?.id)
  const fixed = useFixed().data ?? []
  const { name } = useNames()
  const invalidate = useInvalidate()
  const toast = useToast()
  const nav = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!period || summary.isLoading || blockers.isLoading) return <div className="page"><Spinner /></div>
  const s = summary.data
  const b = blockers.data
  const missingFixed = fixed.filter((f) => b?.missing_fixed.includes(f.id))
  const canClose = !!b && !b.missing_fixed.length && !b.missing_incomes.length && !!s && s.total_income > 0

  async function close() {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('close_period', { p_period: period!.id })
    setBusy(false)
    if (error) return setErr(errorText(error))
    notify({ type: 'period_closed', id: period!.id })
    const me = s?.members.find((m) => m.user_id === userId)
    toast(me && Math.abs(me.balance) >= 0.01
      ? me.balance > 0 ? `Mes cerrado. Recuperás ${money(me.balance, group.currency)}` : `Mes cerrado. Tenés que poner ${money(-me.balance, group.currency)}`
      : 'Mes cerrado')
    await invalidate()
    nav(`/history/${period!.id}`, { replace: true })
  }

  return (
    <div className="page">
      <div className="top">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Volver"><Icon name="back" /></button>
        <h1 style={{ fontSize: 18 }}>Mes {period.number} · Resumen</h1>
        <span style={{ width: 40 }} />
      </div>

      {!canClose && b && (
        <div className="card warn stack" style={{ gap: 8, marginBottom: 4 }}>
          <b>Para cerrar el mes falta:</b>
          {b.missing_incomes.map((u) => (
            <Link key={u} to="/" className="row small" style={{ color: 'inherit' }}>
              <Icon name="wallet" size={18} /> Ingreso de {name(u, { me: true })}
            </Link>
          ))}
          {missingFixed.map((f) => (
            <Link key={f.id} to="/fixed" className="row small" style={{ color: 'inherit' }}>
              <Icon name="pin" size={18} /> {f.description}
            </Link>
          ))}
          {s && s.total_income <= 0 && !b.missing_incomes.length && <span className="small">El total de ingresos tiene que ser mayor a cero.</span>}
        </div>
      )}

      {s && <SummaryView summary={s} currency={group.currency} />}

      <div style={{ marginTop: 24 }}>
        <button className="btn primary block" disabled={!canClose} onClick={() => setConfirming(true)} style={{ height: 54 }}>
          Cerrar mes {period.number}
        </button>
        <p className="small faint" style={{ textAlign: 'center' }}>
          Cerralo cuando ya se hicieron las devoluciones. Se guarda en el historial, se vacían gastos e ingresos,
          se reinician los fijos y avanzan las cuotas.
        </p>
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title={`¿Cerrar el mes ${period.number}?`}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>No se puede deshacer. Todos van a recibir una notificación con lo que les toca recuperar o poner.</p>
          {err && <p className="error">{err}</p>}
          <button className="btn primary block" disabled={busy} onClick={close}>{busy ? 'Cerrando…' : 'Sí, cerrar mes'}</button>
          <button className="btn block" onClick={() => setConfirming(false)}>Cancelar</button>
        </div>
      </Sheet>
    </div>
  )
}
