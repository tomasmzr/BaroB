import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon, Spinner } from '../components/ui'
import { money, monthLabel, pct, periodName, shortDate } from '../lib/format'
import type { Summary } from '../lib/types'
import { useCategories, useHistory, useOpenPeriod, useSummary } from '../state/data'
import { useGroup } from '../state/session'

export default function History() {
  const { group } = useGroup()
  const history = useHistory()
  const open = useOpenPeriod().data
  const current = useSummary(open?.id).data
  const { data: cats } = useCategories()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // Barras apiladas: cada categoría como % de los ingresos del mes (si se gastó de más, pasa el 100%).
  // Las categorías se apilan siempre en el mismo orden (el de la lista de categorías), de abajo hacia arriba.
  // La última barra (●) es el mes en curso, como quedaría si se cerrara ahora.
  const { data, series, ticks } = useMemo(() => {
    const months: { label: string; s: Summary; live?: boolean }[] = [...(history.data ?? [])]
      .filter((p) => p.summary).reverse().slice(-11)
      .map((p) => ({ label: monthLabel(p.month ?? p.closed_at!), s: p.summary! }))
    if (open && current) months.push({ label: `${monthLabel(open.month)} ●`, s: current, live: true })

    const order = new Map((cats ?? []).map((c) => [c.name, c.sort]))
    const colors = new Map<string, string>()
    let top = 100
    const rows = months.map(({ label, s, live }) => {
      const row: Record<string, number | string | boolean> = { label, live: !!live }
      const base = s.total_income || s.total_expenses || 1
      let sum = 0
      for (const c of s.categories) {
        if (c.total <= 0) continue
        colors.set(c.name, c.color)
        const v = Math.round((c.total / base) * 1000) / 10
        row[c.name] = v
        sum += v
      }
      top = Math.max(top, sum)
      return row
    })
    for (const r of rows) for (const k of colors.keys()) if (!(k in r)) r[k] = 0
    const series = [...colors.entries()].sort(([a], [b]) =>
      (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b, 'es'))
    const ticks: number[] = []
    for (let t = 0; t <= Math.ceil(top / 25) * 25; t += 25) ticks.push(t)
    return { data: rows, series, ticks }
  }, [history.data, open, current, cats])

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
              <BarChart data={data} margin={{ top: 10, left: 0, right: 12 }} barCategoryGap="22%">
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis unit="%" ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0}
                  tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
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
                    {data.map((d, i) => <Cell key={i} fillOpacity={d.live ? 0.55 : 1} />)}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="tiny faint" style={{ paddingLeft: 16 }}>
            ● = mes en curso, como quedaría si se cerrara ahora. Si una barra pasa el 100%, ese mes se gastó más de lo que entró. Tocá una categoría para ocultarla.
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
                    <div className={`meta ${p.summary.savings < 0 ? 'over-text' : ''}`}>{p.summary.total_income > 0 ? `${pct(p.summary.total_expenses, p.summary.total_income)} de los ingresos` : ''}</div>
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
