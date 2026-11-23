import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { money, pct } from '../lib/format'
import type { Summary } from '../lib/types'
import { useNames } from '../state/data'
import { Avatar, Money } from './ui'

const REMAINING_COLOR = 'var(--surface-2)'

/**
 * Torta de categorías (montos netos: las devoluciones ya restan en su categoría).
 * Los % son siempre sobre los ingresos. `showRemaining` agrega lo que queda (no se usa en el historial).
 */
export function CategoryPie({ summary, currency, showRemaining = true }: { summary: Summary; currency: string; showRemaining?: boolean }) {
  const over = summary.total_expenses > summary.total_income
  const base = summary.total_income > 0 ? summary.total_income : summary.total_expenses
  const slices = summary.categories.filter((c) => c.total > 0).map((c) => ({ name: c.name, value: c.total, color: c.color }))
  if (showRemaining && summary.savings > 0) slices.push({ name: 'Restante', value: summary.savings, color: REMAINING_COLOR })

  return (
    <div className="card">
      <div style={{ position: 'relative', height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" innerRadius={62} outerRadius={92} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          {summary.total_income <= 0 ? (
            <>
              <span className="small muted">Gastado</span>
              <b style={{ fontSize: 20 }}>{money(summary.total_expenses, currency)}</b>
            </>
          ) : over ? (
            <>
              <span className="small over-text">Excedido</span>
              <b className="over-text" style={{ fontSize: 22 }}>+{pct(-summary.savings, summary.total_income)}</b>
            </>
          ) : showRemaining ? (
            <>
              <span className="small muted">Queda</span>
              <b style={{ fontSize: 22 }}>{pct(summary.savings, summary.total_income)}</b>
            </>
          ) : (
            <>
              <span className="small muted">Gastado</span>
              <b style={{ fontSize: 22 }}>{pct(summary.total_expenses, summary.total_income)}</b>
            </>
          )}
        </div>
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {summary.categories.map((c) => (
          <div className="between" key={c.category_id ?? 'none'}>
            <span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: c.color }} />{c.name}</span>
            <span className="num"><span className="muted">{pct(c.total, base)}</span> · {money(c.total, currency)}</span>
          </div>
        ))}
        {over && summary.total_income > 0 && (
          <div className="small over-text" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            Los gastos superan los ingresos en {money(-summary.savings, currency)} (las categorías suman {pct(summary.total_expenses, summary.total_income)} de los ingresos).
          </div>
        )}
        {showRemaining && !over && summary.total_income > 0 && (
          <div className="between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: REMAINING_COLOR, border: '1px solid var(--line)' }} />Restante</span>
            <span className="num"><span className="muted">{pct(summary.savings, summary.total_income)}</span> · {money(summary.savings, currency)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Devoluciones y reintegros del período, aparte (ya están descontados de sus categorías). */
export function RefundsCard({ summary, currency }: { summary: Summary; currency: string }) {
  if (!summary.refunds_total) return null
  return (
    <>
      <div className="section-title">Devoluciones y reintegros</div>
      <div className="list">
        {(summary.refunds ?? []).map((r) => (
          <div className="item" key={r.category_id ?? 'none'} style={{ cursor: 'default' }}>
            <span className="dot" style={{ background: r.color }} />
            <span className="grow">{r.name}</span>
            <span className="amount refund-text">−{money(r.total, currency)}</span>
          </div>
        ))}
        <div className="item" style={{ cursor: 'default' }}>
          <span className="grow small muted">Total devuelto (ya restado de cada categoría)</span>
          <span className="amount refund-text">−{money(summary.refunds_total, currency)}</span>
        </div>
      </div>
    </>
  )
}

function useMemberName(summary: Summary) {
  const { name } = useNames()
  return (id: string) => {
    const n = name(id, { me: true })
    return n === 'Ex miembro' ? (summary.members.find((m) => m.user_id === id)?.name ?? n) : n
  }
}

export function MembersTable({ summary, currency }: { summary: Summary; currency: string }) {
  const nm = useMemberName(summary)
  const none = summary.split_mode === 'none'
  return (
    <div className="list">
      {summary.members.map((m) => (
        <div className="item" key={m.user_id} style={{ alignItems: 'flex-start' }}>
          <Avatar name={m.name} />
          <div className="grow">
            <div className="between">
              <span className="title">{nm(m.user_id)}</span>
              {none ? (
                <span className="badge">{pct(m.ratio ?? 0, 1)} de los gastos</span>
              ) : (
                <span className={`badge ${m.balance > 0.005 ? 'ok' : m.balance < -0.005 ? 'warn' : ''}`}>
                  {m.balance > 0.005 ? `Recupera ${money(m.balance, currency)}` : m.balance < -0.005 ? `Pone ${money(-m.balance, currency)}` : 'Al día'}
                </span>
              )}
            </div>
            <div className="meta num" style={{ marginTop: 4 }}>
              Ingreso {money(m.income, currency)}{summary.total_income > 0 ? ` (${pct(m.income, summary.total_income)})` : ''}<br />
              {none
                ? <>Gastó {money(m.paid, currency)}</>
                : <>Le toca {money(m.share, currency)}{m.ratio !== undefined ? ` (${pct(m.ratio, 1)})` : ''} · Puso {money(m.paid, currency)}</>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Settlements({ summary, currency }: { summary: Summary; currency: string }) {
  const nm = useMemberName(summary)
  if (!summary.settlements.length) return <div className="card empty">Nadie le debe nada a nadie 🎉</div>
  return (
    <div className="list">
      {summary.settlements.map((t, i) => (
        <div className="settle" key={i}>
          <span style={{ fontWeight: 560 }}>{nm(t.from)}</span>
          <span className="arrow num">→ <Money value={t.amount} currency={currency} /></span>
          <span style={{ fontWeight: 560, textAlign: 'right' }}>{nm(t.to)}</span>
        </div>
      ))}
    </div>
  )
}

/** Modo "no dividir": qué parte de los gastos le correspondió a cada uno. */
export function Shares({ summary, currency }: { summary: Summary; currency: string }) {
  const nm = useMemberName(summary)
  return (
    <div className="list">
      {summary.members.map((m) => (
        <div className="item" key={m.user_id} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div className="between">
            <span style={{ fontWeight: 560 }}>{nm(m.user_id)}</span>
            <span className="num"><b>{pct(m.ratio ?? 0, 1)}</b> <span className="muted">· {money(m.paid, currency)}</span></span>
          </div>
          <div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, (m.ratio ?? 0) * 100))}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

export function splitLabel(s: Pick<Summary, 'split_mode' | 'split_min' | 'split_max'>): string {
  if (s.split_mode === 'none') return 'Sin división: cada uno se hace cargo de lo que paga'
  if (s.split_mode === 'equal') return 'División en partes iguales'
  if (s.split_mode === 'fixed') return 'Porcentajes fijos por persona'
  if (s.split_mode === 'proportional_capped') {
    const parts = [
      s.split_min != null ? `mínimo ${Math.round(s.split_min * 100)}%` : null,
      s.split_max != null ? `máximo ${Math.round(s.split_max * 100)}%` : null,
    ].filter(Boolean)
    return `Proporcional a ingresos${parts.length ? ` (${parts.join(', ')} por persona)` : ''}`
  }
  return 'Proporcional a ingresos'
}

export default function SummaryView({ summary, currency, history = false }: { summary: Summary; currency: string; history?: boolean }) {
  const none = summary.split_mode === 'none'
  return (
    <>
      <div className="card">
        <div className="stats" style={{ marginTop: 0 }}>
          <div className="stat"><div className="label">Ingresos</div><div className="value">{money(summary.total_income, currency)}</div></div>
          <div className="stat"><div className="label">Gastos</div><div className="value">{money(summary.total_expenses, currency)}</div></div>
          {history
            ? <div className="stat"><div className="label">% de ingresos</div><div className={`value ${summary.savings < 0 ? 'over-text' : ''}`}>{summary.total_income > 0 ? pct(summary.total_expenses, summary.total_income) : '—'}</div></div>
            : <div className="stat"><div className="label">Queda</div><div className="value">{money(summary.savings, currency)}</div></div>}
        </div>
      </div>
      <div data-tour="settle">
        <div className="section-title">{none ? 'Cuánto le correspondió a cada uno' : 'Quién le da a quién'}</div>
        {none ? <Shares summary={summary} currency={currency} /> : <Settlements summary={summary} currency={currency} />}
      </div>
      <div className="section-title">Por persona</div>
      {summary.split_mode && <p className="small faint" style={{ margin: '0 4px 8px' }}>{splitLabel(summary)}</p>}
      <MembersTable summary={summary} currency={currency} />
      <div className="section-title">Por categoría</div>
      <CategoryPie summary={summary} currency={currency} showRemaining={!history} />
      <RefundsCard summary={summary} currency={currency} />
    </>
  )
}
