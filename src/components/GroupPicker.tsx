import { useGroup } from '../state/session'

/** Selector de grupo compacto. Con un solo grupo muestra solo el nombre. */
export function GroupPicker({ label, big }: { label?: string; big?: boolean }) {
  const { group, groups, selectGroup } = useGroup()
  const text = big ? { fontSize: 22, fontWeight: 650 } : { fontSize: 14, fontWeight: 600 }
  if (groups.length < 2) {
    return (
      <span className="group-picker" style={text}>
        {label && <span className="muted small" style={{ fontWeight: 400 }}>{label} </span>}{group.name}
      </span>
    )
  }
  return (
    <label className="group-picker" style={text}>
      {label && <span className="muted small" style={{ fontWeight: 400 }}>{label} </span>}
      <select value={group.id} onChange={(e) => selectGroup(e.target.value)} aria-label="Grupo" style={text}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  )
}
