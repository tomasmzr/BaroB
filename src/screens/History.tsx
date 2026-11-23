import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon, Spinner } from '../components/ui'
import { money, monthLabel, pct, periodName, shortDate } from '../lib/format'
import { useHistory } from '../state/data'
import { useGroup } from '../state/session'

export default function History() {
  const { group } = useGroup()
  const history = useHistory()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const { data, series } = useMemo(() => {
    const periods = [...(history.data ?? [])].filter((p) => p.summary).reverse().slice(-12)
    const colors = new Map<string, string>()
    const rows = periods.map((p) => {
      const s = p.summary!
      const row: Record<string, number | string> = { label: monthLabel(p.month ?? p.closed_at!) }
      // con excedente, las categorías se miden sobre el total de gastos
      const base = Math.max(s.total_income, s.total_expenses) || 1
      for (const c of s.categories) {
        colors.set(c.name, c.color)
        row[c.name] = Math.round((c.total / base) * 1000) / 10
      }
      row['Ahorro y vida'] = Math.round((s.savings / base) * 1000) / 10
      return row
    })
    colors.set('Ahorro y vida', 'var(--text-3)')
    // Categorías que no aparecieron en un mes → 0
    for (const r of rows) for (const k of colors.keys()) if (!(k in r)) r[k] = 0
    return { data: rows, series: [...colors.entries()] }
  }, [history.data])

  if (history.isLoading) return <div className="page"><Spinner /></div>
  const list = history.data ?? []

  return (
    <div className="page">
      <div className="top"><h1>Historial</h1></div>

      {list.length === 0 ? (
        <div className="card empty">Todavía no se cerró ningún mes.<br />Acá vas a ver cómo evoluciona cada categoría.</div>
      ) : (
        <>
          {data.length >= 1 && (
            <div className="card" style={{ padding: '16px 8px 8px 0' }}>
              <div className="small muted" style={{ paddingLeft: 16, marginBottom: 8 }}>% por categoría sobre ingresos (o gastos, si se excedieron)</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ left: 0, right: 12 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                    <Tooltip
                      formatter={(v) => `${v}%`}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13 }}
                      labelStyle={{ color: 'var(--text-2)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
                      onClick={(e) => {
                        const k = String(e.dataKey)
                        setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n })
                      }} />
                    {series.map(([name, color]) => (
                      <Line key={name} dataKey={name} stroke={color} strokeWidth={2} dot={{ r: 3, strokeDasharray: '0' }} hide={hidden.has(name)}
                        strokeDasharray={name === 'Ahorro y vida' ? '4 4' : undefined} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="tiny faint" style={{ paddingLeft: 16 }}>Tocá una categoría para ocultarla o mostrarla.</div>
            </div>
          )}

          <div className="section-title">Meses cerrados</div>
          <div className="list">
            {list.map((p) => (
              <Link key={p.id} to={`/history/${p.id}`} className="item" style={{ color: 'inherit' }}>
                <div className="grow">
                  <div className="title">{periodName(p.month, p.number)}</div>
                  <div className="meta">{shortDate(p.started_at)} → {shortDate(p.closed_at!)}</div>
                </div>
                {p.summary && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount">{money(p.summary.total_expenses, group.currency)}</div>
                    <div className={`meta ${p.summary.savings < 0 ? 'over-text' : ''}`}>{p.summary.savings < 0 ? `Excedido ${pct(-p.summary.savings, p.summary.total_income)}` : `Quedó ${pct(p.summary.savings, p.summary.total_income)}`}</div>
                  </div>
                )}
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
