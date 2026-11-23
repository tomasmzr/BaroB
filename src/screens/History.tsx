import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon, Spinner } from '../components/ui'
import { money, monthLabel, pct, periodName, shortDate } from '../lib/format'
import type { Summary } from '../lib/types'
import { useHistory, useOpenPeriod, useSummary } from '../state/data'
import { useGroup } from '../state/session'

const SAVINGS = 'Ahorro y vida'

export default function History() {
  const { group } = useGroup()
  const history = useHistory()
  const open = useOpenPeriod().data
  const current = useSummary(open?.id).data
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // Barras apiladas: cada categoría como % de los ingresos del mes. Si se gastó de más, la pila pasa el 100%.
  // La última barra es el mes en curso: cómo quedaría si se cerrara ahora.
  const { data, series } = useMemo(() => {
    const months: { label: string; s: Summary; live?: boolean }[] = [...(history.data ?? [])]
      .filter((p) => p.summary).reverse().slice(-11)
      .map((p) => ({ label: monthLabel(p.month ?? p.closed_at!), s: p.summary! }))
    if (open && current) months.push({ label: `${monthLabel(open.month)} ●`, s: current, live: true })
    const colors = new Map<string, string>()
    const rows = months.map(({ label, s, live }) => {
      const row: Record<string, number | string | boolean> = { label, live: !!live }
      const base = s.total_income || s.total_expenses || 1
      for (const c of s.categories) {
        if (c.total <= 0) continue
        colors.set(c.name, c.color)
        row[c.name] = Math.round((c.total / base) * 1000) / 10
      }
      row[SAVINGS] = s.total_income > 0 ? Math.max(0, Math.round((s.savings / base) * 1000) / 10) : 0
      return row
    })
    colors.set(SAVINGS, '#94a3b8')
    for (const r of rows) for (const k of colors.keys()) if (!(k in r)) r[k] = 0
    return { data: rows, series: [...colors.entries()] }
  }, [history.data, open, current])

  if (history.isLoading) return <div className="page"><Spinner /></div>
  const list = history.data ?? []

  return (
    <div className="page">
      <div className="top"><h1>Historial</h1></div>

      {data.length > 0 && (
        <div className="card" data-tour="chart" style={{ padding: '16px 8px 8px 0' }}>
          <div className="small muted" style={{ paddingLeft: 16, marginBottom: 8 }}>Cada categoría como % de los ingresos del mes</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: 0, right: 12 }} barCategoryGap="22%">
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis unit="%" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                <ReferenceLine y={100} stroke="var(--text-3)" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)', opacity: 0.4 }}
                  formatter={(v) => `${v}%`}
                  contentStyle={{ background: 'var(--sheet)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: 'var(--text-2)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
                  onClick={(e) => {
                    const k = String(e.dataKey)
                    setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n })
                  }} />
                {series.map(([name, color]) => (
                  <Bar key={name} dataKey={name} stackId="m" fill={color} hide={hidden.has(name)} isAnimationActive={false}>
                    {data.map((d, i) => <Cell key={i} fillOpacity={(name === SAVINGS ? 0.3 : 1) * (d.live ? 0.55 : 1)} />)}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="tiny faint" style={{ paddingLeft: 16 }}>
            ● = mes en curso, como quedaría si se cerrara ahora. La línea punteada es el 100% de los ingresos. Tocá una categoría para ocultarla.
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="card empty" style={{ marginTop: 12 }}>Todavía no se cerró ningún mes.<br />Acá vas a ver cómo evoluciona cada categoría.</div>
      ) : (
        <>
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
