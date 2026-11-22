import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SummaryView from '../components/SummaryView'
import { Icon, Money, Spinner } from '../components/ui'
import { shortDate } from '../lib/format'
import { useCategories, useExpenses, useHistory, useNames } from '../state/data'
import { useGroup } from '../state/session'

export default function HistoryDetail() {
  const { id } = useParams()
  const { group } = useGroup()
  const nav = useNavigate()
  const history = useHistory()
  const [showAll, setShowAll] = useState(false)
  const expenses = useExpenses(showAll ? id : undefined)
  const { byId } = useCategories()
  const { name } = useNames()

  if (history.isLoading) return <div className="page"><Spinner /></div>
  const p = history.data?.find((x) => x.id === id)
  if (!p || !p.summary) return <div className="page"><p className="muted">No se encontró ese mes.</p></div>

  return (
    <div className="page">
      <div className="top">
        <button className="icon-btn" onClick={() => nav('/history')} aria-label="Volver"><Icon name="back" /></button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 18 }}>Mes {p.number}</h1>
          <div className="sub">{shortDate(p.started_at)} → {shortDate(p.closed_at!)}</div>
        </div>
        <span style={{ width: 40 }} />
      </div>

      <SummaryView summary={p.summary} currency={group.currency} />

      {p.summary.installments.length > 0 && (
        <>
          <div className="section-title">Cuotas imputadas</div>
          <div className="list">
            {p.summary.installments.map((i) => (
              <div className="item" key={i.plan_id}>
                <div className="grow">
                  <div className="title">{i.description}</div>
                  <div className="meta">Cuota {i.number}/{i.of} · {name(i.paid_by, { me: true })}</div>
                </div>
                <Money value={i.amount} currency={group.currency} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Gastos</div>
      {!showAll ? (
        <button className="btn block" onClick={() => setShowAll(true)}>Ver todos los gastos del mes</button>
      ) : expenses.isLoading ? <Spinner /> : (
        <div className="list">
          {(expenses.data ?? []).map((e) => {
            const cat = e.category_id ? byId.get(e.category_id) : undefined
            return (
              <div className="item" key={e.id}>
                <span className="dot" style={{ background: cat?.color ?? 'var(--text-3)' }} />
                <div className="grow">
                  <div className="title ellipsis">{e.description}</div>
                  <div className="meta">{shortDate(e.spent_at)} · {cat?.name ?? 'Sin categoría'} · {name(e.paid_by, { me: true })}</div>
                </div>
                <Money value={e.amount} currency={group.currency} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
