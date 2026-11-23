import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, CategoryChips, Icon, LogoMark, Sheet, Switch, useToast, Wordmark } from '../components/ui'
import { applyTheme, currentTheme, prefs, type Theme } from '../lib/prefs'
import { currentSubscription, disablePush, enablePush, isStandalone, pushSupported } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Category, FixedExpense, SplitMode } from '../lib/types'
import { useCategories, useFixed, useInvalidate, useMembers, useNames } from '../state/data'
import { useGroup } from '../state/session'
import { NewGroupSheet } from '../components/GroupPicker'

export const PALETTE = [
  '#3b82f6', '#ef4444', '#f59e0b', '#eab308', '#a16207', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#6366f1', '#f43f5e', '#0ea5e9', '#d946ef', '#78350f', '#64748b', '#14b8a6',
]

export default function Settings() {
  const { group, userId, profile, refreshGroups } = useGroup()
  const members = useMembers().data ?? []
  const cats = useCategories()
  const fixed = useFixed().data ?? []
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  const toast = useToast()
  const nav = useNavigate()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [groupName, setGroupName] = useState(group.name)
  const [theme, setTheme] = useState<Theme>(currentTheme())
  const [openOnAdd, setOpenOnAdd] = useState(prefs.get('openOnAdd', true))
  const [push, setPush] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)
  const [editCat, setEditCat] = useState<Category | 'new' | null>(null)
  const [editFixed, setEditFixed] = useState<FixedExpense | 'new' | null>(null)
  const [newGroup, setNewGroup] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => setGroupName(group.name), [group.name])
  useEffect(() => setDisplayName(profile?.display_name ?? ''), [profile?.display_name])
  useEffect(() => {
    currentSubscription().then((s) => setPush(!!s)).catch(() => {})
  }, [])

  async function saveName() {
    const v = displayName.trim()
    if (!v || v === profile?.display_name) return
    const { error } = await supabase.from('profiles').update({ display_name: v }).eq('id', userId)
    if (error) return toast(errorText(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
    invalidate()
    toast('Nombre actualizado')
  }

  async function saveGroupName() {
    const v = groupName.trim()
    if (!v || v === group.name) return
    const { error } = await supabase.from('groups').update({ name: v }).eq('id', group.id)
    if (error) return toast(errorText(error))
    refreshGroups()
    toast('Grupo renombrado')
  }

  async function invite() {
    const { data, error } = await supabase.rpc('create_invite', { p_group: group.id })
    if (error) return toast(errorText(error))
    const url = `${location.origin}${location.pathname}#/join/${data}`
    const text = `Sumate a «${group.name}» en BaroB`
    try {
      if (navigator.share) await navigator.share({ title: 'BaroB', text, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Link copiado')
      }
    } catch {
      /* el usuario canceló */
    }
  }

  async function removeMember(id: string, label: string) {
    const self = id === userId
    const { data: pv } = await supabase.rpc('member_removal_preview', { p_group: group.id, p_user: id })
    const c = (pv ?? { expenses: 0, incomes: 0, installments: 0 }) as { expenses: number; incomes: number; installments: number }
    const lost = [
      c.expenses ? `${c.expenses} gasto${c.expenses === 1 ? '' : 's'}` : null,
      c.incomes ? `${c.incomes} ingreso${c.incomes === 1 ? '' : 's'}` : null,
      c.installments ? `${c.installments} gasto${c.installments === 1 ? '' : 's'} en cuotas pendiente${c.installments === 1 ? '' : 's'}` : null,
    ].filter(Boolean)
    const who = self ? 'tus' : `de ${label}:`
    const warn = lost.length
      ? `\n\nSe van a borrar ${who} ${lost.join(', ')} del mes en curso. El historial de meses cerrados no se toca.`
      : '\n\nEl historial de meses cerrados no se toca.'
    if (!confirm((self ? `¿Salir de «${group.name}»?` : `¿Quitar a ${label} del grupo?`) + warn)) return
    const { error } = await supabase.rpc('remove_member', { p_group: group.id, p_user: id })
    if (error) return toast(errorText(error))
    if (self) {
      await refreshGroups()
      nav('/', { replace: true })
    } else invalidate()
  }

  async function testPush() {
    const { data, error } = await supabase.functions.invoke('notify', { body: { type: 'test' } })
    if (error) return toast('No se pudo enviar la prueba')
    const n = (data as { sent?: number })?.sent ?? 0
    toast(n ? `Notificación enviada a ${n} dispositivo${n === 1 ? '' : 's'}` : 'No hay dispositivos con notificaciones activadas')
  }

  async function togglePush(v: boolean) {
    setPushErr(null)
    try {
      if (v) await enablePush()
      else await disablePush()
      setPush(v)
    } catch (e) {
      setPushErr(errorText(e))
    }
  }

  return (
    <div className="page">
      <div className="top"><h1>Ajustes</h1></div>

      <div className="section-title">Tu perfil</div>
      <div className="card stack">
        <div className="field">
          <label htmlFor="dn">Nombre visible</label>
          <input id="dn" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={saveName} />
        </div>
        <span className="small faint">{profile?.email}</span>
      </div>

      <div className="section-title">Grupo</div>
      <div className="card stack">
        <div className="field">
          <label htmlFor="gn">Nombre del grupo</label>
          <input id="gn" className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} onBlur={saveGroupName} />
        </div>
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNewGroup(true)}>+ Crear otro grupo</button>
        <span className="tiny faint">Podés estar en varios grupos, incluso uno solo para tus finanzas personales.</span>
      </div>

      <div data-tour="split">
        <div className="section-title">División de gastos</div>
        <SplitSettings key={group.id} />
      </div>

      <div className="section-title">Miembros</div>
      <div className="list">
        {members.map((m) => {
          const label = m.profile?.display_name || m.profile?.email || '?'
          return (
            <div className="item" key={m.user_id}>
              <Avatar name={label} />
              <div className="grow">
                <div className="title">{label}{m.user_id === userId && <span className="faint"> (vos)</span>}</div>
                <div className="meta ellipsis">{m.profile?.email}</div>
              </div>
              <button className="btn ghost sm danger" onClick={() => removeMember(m.user_id, label)}>
                {m.user_id === userId ? 'Salir' : 'Quitar'}
              </button>
            </div>
          )
        })}
        <button className="item" onClick={invite} style={{ color: 'var(--green)', fontWeight: 600 }}>
          <Icon name="share" /> Invitar con un link
        </button>
      </div>
      <p className="tiny faint" style={{ margin: '6px 4px' }}>No hay administradores: todos pueden hacer todo. Los links vencen en 14 días.</p>

      <div className="section-title">Categorías</div>
      <div className="list">
        {cats.active.map((c) => (
          <button key={c.id} className="item" onClick={() => setEditCat(c)}>
            <span className="dot" style={{ background: c.color }} />
            <span className="grow">{c.name}</span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
        <button className="item" onClick={() => setEditCat('new')} style={{ color: 'var(--green)', fontWeight: 600 }}>
          <Icon name="plus" /> Nueva categoría
        </button>
      </div>

      <div className="section-title">Gastos fijos</div>
      <div className="list">
        {fixed.map((f) => {
          const c = f.category_id ? cats.byId.get(f.category_id) : undefined
          return (
            <button key={f.id} className="item" onClick={() => setEditFixed(f)}>
              <span className="dot" style={{ background: c?.color ?? 'var(--text-3)' }} />
              <span className="grow">{f.description}<span className="meta"> · {c?.name ?? 'Sin categoría'}</span></span>
              <Icon name="chevron" size={18} />
            </button>
          )
        })}
        <button className="item" onClick={() => setEditFixed('new')} style={{ color: 'var(--green)', fontWeight: 600 }}>
          <Icon name="plus" /> Nuevo gasto fijo
        </button>
      </div>

      <div className="section-title">Apariencia</div>
      <div className="card">
        <div className="chips">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} className="chip" aria-pressed={theme === t} onClick={() => { setTheme(t); applyTheme(t) }}>
              {t === 'system' ? 'Automático' : t === 'light' ? 'Claro' : 'Oscuro'}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Este dispositivo</div>
      <div className="list">
        <div className="item">
          <div className="grow">
            <div className="title">Notificaciones</div>
            <div className="meta">
              {!pushSupported()
                ? (/iPhone|iPad/.test(navigator.userAgent) && !isStandalone()
                    ? 'En iPhone: primero agregá BaroB a la pantalla de inicio (Compartir → Agregar a inicio).'
                    : 'Este navegador no las soporta.')
                : 'Avisos cuando otro carga un gasto o se cierra el mes.'}
            </div>
            {pushErr && <div className="error small">{pushErr}</div>}
          </div>
          <Switch checked={push} onChange={togglePush} label="Notificaciones" />
        </div>
        {push && (
          <button className="item" onClick={testPush} style={{ color: 'var(--green)', fontWeight: 600 }}>
            <Icon name="check" size={20} /> Enviarme una notificación de prueba
          </button>
        )}
        <div className="item">
          <div className="grow">
            <div className="title">Abrir directo en «Nuevo gasto»</div>
            <div className="meta">Al tocar el ícono de la app.</div>
          </div>
          <Switch checked={openOnAdd} onChange={(v) => { setOpenOnAdd(v); prefs.set('openOnAdd', v) }} label="Abrir en nuevo gasto" />
        </div>
      </div>

      <div style={{ marginTop: 28 }} className="stack">
        <button className="btn block" onClick={() => { prefs.set('tourDone', false); nav('/', { replace: true }); window.dispatchEvent(new Event('barob:tour')) }}>Ver el tutorial</button>
        <button className="btn block" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        <button className="btn ghost danger block" onClick={() => setResetting(true)}>Borrar todos mis datos y empezar de cero</button>
        <div className="row" style={{ justifyContent: 'center', opacity: 0.7 }}>
          <LogoMark size={22} /><Wordmark size={15} />
        </div>
      </div>

      {editCat && <CategorySheet key={editCat === 'new' ? 'new' : editCat.id} cat={editCat} onClose={() => setEditCat(null)} />}
      {editFixed && <FixedSheet key={editFixed === 'new' ? 'new' : editFixed.id} fixed={editFixed} onClose={() => setEditFixed(null)} />}
      {newGroup && <NewGroupSheet onClose={() => setNewGroup(false)} />}
      {resetting && <ResetSheet onClose={() => setResetting(false)} />}
    </div>
  )
}

function CategorySheet({ cat, onClose }: { cat: Category | 'new'; onClose: () => void }) {
  const { group } = useGroup()
  const { active } = useCategories()
  const invalidate = useInvalidate()
  const isNew = cat === 'new'
  const [name, setName] = useState(isNew ? '' : cat.name)
  const [color, setColor] = useState(isNew ? PALETTE[active.length % PALETTE.length] : cat.color)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const { error } = isNew
      ? await supabase.from('categories').insert({ group_id: group.id, name: n, color, sort: active.length + 1 })
      : await supabase.from('categories').update({ name: n, color }).eq('id', cat.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  async function remove() {
    if (isNew || !confirm(`¿Eliminar «${cat.name}»? Los gastos ya cargados la conservan.`)) return
    const { error } = await supabase.from('categories').update({ archived: true }).eq('id', cat.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nueva categoría' : 'Editar categoría'}>
      <form className="stack" onSubmit={save}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" autoFocus={isNew} />
        <div className="chips">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}
              style={{ width: 36, height: 36, borderRadius: 99, background: c, cursor: 'pointer',
                border: color === c ? '3px solid var(--text)' : '3px solid transparent' }} />
          ))}
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!name.trim()}>Guardar</button>
        {!isNew && <button type="button" className="btn ghost danger" onClick={remove}>Eliminar categoría</button>}
      </form>
    </Sheet>
  )
}

function FixedSheet({ fixed, onClose }: { fixed: FixedExpense | 'new'; onClose: () => void }) {
  const { group } = useGroup()
  const { active } = useCategories()
  const all = useFixed().data ?? []
  const invalidate = useInvalidate()
  const isNew = fixed === 'new'
  const [desc, setDesc] = useState(isNew ? '' : fixed.description)
  const [cat, setCat] = useState<string | null>(isNew ? null : fixed.category_id)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const d = desc.trim()
    if (!d || !cat) return
    const { error } = isNew
      ? await supabase.from('fixed_expenses').insert({ group_id: group.id, description: d, category_id: cat, sort: all.length + 1 })
      : await supabase.from('fixed_expenses').update({ description: d, category_id: cat }).eq('id', fixed.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  async function remove() {
    if (isNew || !confirm(`¿Eliminar el fijo «${fixed.description}»? Deja de ser obligatorio para cerrar el mes.`)) return
    const { error } = await supabase.from('fixed_expenses').update({ active: false }).eq('id', fixed.id)
    if (error) return setErr(errorText(error))
    await invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}>
      <form className="stack" onSubmit={save}>
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Alquiler, Luz, Internet" autoFocus={isNew} />
        <span className="label">Categoría</span>
        <CategoryChips categories={active} value={cat} onChange={setCat} />
        <p className="small faint" style={{ margin: 0 }}>Cada mes solo hay que completar quién pagó y cuánto.</p>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!desc.trim() || !cat}>Guardar</button>
        {!isNew && <button type="button" className="btn ghost danger" onClick={remove}>Eliminar fijo</button>}
      </form>
    </Sheet>
  )
}

function SplitSettings() {
  const { group, refreshGroups } = useGroup()
  const members = useMembers().data ?? []
  const { name } = useNames()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [mode, setMode] = useState<SplitMode>(group.split_mode)
  const [minTxt, setMinTxt] = useState(group.split_min != null ? String(Math.round(group.split_min * 100)) : '')
  const [maxTxt, setMaxTxt] = useState(group.split_max != null ? String(Math.round(group.split_max * 100)) : '')
  const [pcts, setPcts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const n = Math.max(1, members.length)
  const pctOf = (uid: string) => {
    if (pcts[uid] !== undefined) return pcts[uid]
    const m = members.find((x) => x.user_id === uid)
    return m?.split_pct != null ? String(Math.round(m.split_pct * 1000) / 10) : String(Math.round(1000 / n) / 10)
  }
  const pctSum = members.reduce((a, m) => a + (Number(pctOf(m.user_id).replace(',', '.')) || 0), 0)
  const min = minTxt.trim() ? Number(minTxt) / 100 : null
  const max = maxTxt.trim() ? Number(maxTxt) / 100 : null
  const invalidCaps = mode === 'proportional_capped' && (
    (min !== null && (isNaN(min) || min < 0 || min >= 1)) || (max !== null && (isNaN(max) || max <= 0 || max > 1)) ||
    (min !== null && max !== null && min > max) || (min === null && max === null))
  const infeasible = mode === 'proportional_capped' && !invalidCaps &&
    ((min !== null && min * n > 1) || (max !== null && max * n < 1))
  const invalidPcts = mode === 'fixed' && Math.abs(pctSum - 100) > 0.05
  const pctsChanged = mode === 'fixed' && members.some((m) => {
    const cur = m.split_pct != null ? Math.round(m.split_pct * 1000) / 10 : null
    return cur === null || Math.abs(cur - (Number(pctOf(m.user_id).replace(',', '.')) || 0)) > 0.01
  })
  const dirty = mode !== group.split_mode || pctsChanged ||
    (mode === 'proportional_capped' && (min !== group.split_min || max !== group.split_max))

  async function save() {
    setBusy(true)
    const p_pcts = mode === 'fixed'
      ? Object.fromEntries(members.map((m) => [m.user_id, (Number(pctOf(m.user_id).replace(',', '.')) || 0) / 100]))
      : null
    const { error } = await supabase.rpc('set_split', {
      p_group: group.id, p_mode: mode, p_min: min, p_max: max, p_pcts,
    })
    setBusy(false)
    if (error) return toast(errorText(error))
    setPcts({})
    await refreshGroups()
    invalidate()
    toast('División actualizada para el mes en curso')
  }

  const options: { v: SplitMode; t: string; d: string }[] = [
    { v: 'proportional', t: 'Proporcional a ingresos', d: 'Si ganás el 65% del total, ponés el 65% de los gastos.' },
    { v: 'proportional_capped', t: 'Proporcional con topes', d: 'Igual que el anterior, pero nadie paga más (o menos) de un % que elijan.' },
    { v: 'fixed', t: 'Porcentajes fijos', d: 'Cada uno pone un % acordado, sin importar ingresos. Los ingresos pasan a ser opcionales.' },
    { v: 'equal', t: 'Partes iguales', d: 'Todos ponen lo mismo, sin importar ingresos. Los ingresos pasan a ser opcionales.' },
  ]

  return (
    <div className="list">
      {options.map((o) => (
        <button key={o.v} className="item" onClick={() => setMode(o.v)} aria-pressed={mode === o.v} style={{ alignItems: 'flex-start' }}>
          <span className={`radio ${mode === o.v ? 'on' : ''}`} />
          <div className="grow">
            <div className="title">{o.t}</div>
            <div className="meta">{o.d}</div>
          </div>
        </button>
      ))}
      {mode === 'proportional_capped' && (
        <div className="item" style={{ cursor: 'default', flexWrap: 'wrap', gap: 12 }}>
          <label className="field" style={{ flex: 1, minWidth: 120 }}>
            <span className="label">Mínimo (%)</span>
            <input className="input" inputMode="numeric" placeholder="ej. 20" value={minTxt} onChange={(e) => setMinTxt(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 120 }}>
            <span className="label">Máximo (%)</span>
            <input className="input" inputMode="numeric" placeholder="ej. 60" value={maxTxt} onChange={(e) => setMaxTxt(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          {invalidCaps && <div className="error small" style={{ width: '100%' }}>Poné al menos un tope válido (el mínimo no puede superar al máximo).</div>}
          {infeasible && (
            <div className="small" style={{ width: '100%', color: 'var(--warn)' }}>
              Con {n} miembro{n === 1 ? '' : 's'} esos topes no se pueden cumplir; mientras tanto se usa el proporcional puro.
            </div>
          )}
        </div>
      )}
      {mode === 'fixed' && (
        <div className="item" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {members.map((m) => (
            <label key={m.user_id} className="between">
              <span>{name(m.user_id, { me: true })}</span>
              <span className="row" style={{ gap: 6 }}>
                <input className="input" inputMode="decimal" style={{ width: 84, height: 40, textAlign: 'right' }}
                  value={pctOf(m.user_id)} onChange={(e) => setPcts({ ...pcts, [m.user_id]: e.target.value.replace(/[^\d.,]/g, '') })} />
                <span className="muted">%</span>
              </span>
            </label>
          ))}
          <div className={`small ${invalidPcts ? 'error' : 'muted'}`} style={{ textAlign: 'right' }}>
            Total: {Math.round(pctSum * 10) / 10}%{invalidPcts ? ' — tiene que sumar 100%' : ''}
          </div>
        </div>
      )}
      {dirty && (
        <div className="item" style={{ cursor: 'default' }}>
          <span className="grow small muted">Aplica al mes en curso. Los meses cerrados no cambian.</span>
          <button className="btn primary sm" disabled={busy || invalidCaps || invalidPcts} onClick={save}>Guardar</button>
        </div>
      )}
    </div>
  )
}

function ResetSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [confirmTxt, setConfirmTxt] = useState('')
  const [account, setAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ok = confirmTxt.trim().toUpperCase() === 'BORRAR'

  async function wipe() {
    setBusy(true)
    setErr(null)
    try { await disablePush() } catch { /* sin push */ }
    const { error } = await supabase.rpc('delete_my_data', { p_delete_account: account })
    if (error) {
      setBusy(false)
      return setErr(errorText(error))
    }
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('barob.')).forEach((k) => localStorage.removeItem(k))
    } catch { /* sin storage */ }
    qc.clear()
    if (account) await supabase.auth.signOut({ scope: 'local' })
    window.location.hash = '#/'
    window.location.reload()
  }

  return (
    <Sheet open onClose={onClose} title="Borrar todo y empezar de cero">
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>Esto no se puede deshacer:</p>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Los grupos donde estás solo se borran completos, con su historial.</li>
          <li>De los grupos compartidos salís: se borran tus gastos, ingresos y cuotas del mes en curso. Los meses cerrados quedan para los demás.</li>
          <li>Se desactivan las notificaciones y se reinicia el tutorial.</li>
        </ul>
        <label className="row small" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={account} onChange={(e) => setAccount(e.target.checked)} />
          Borrar también mi cuenta (email y contraseña)
        </label>
        <div className="field">
          <label htmlFor="wipe">Escribí <b>BORRAR</b> para confirmar</label>
          <input id="wipe" className="input" autoCapitalize="characters" value={confirmTxt} onChange={(e) => setConfirmTxt(e.target.value)} />
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn block" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
          disabled={!ok || busy} onClick={wipe}>{busy ? 'Borrando…' : 'Borrar todo'}</button>
      </div>
    </Sheet>
  )
}
