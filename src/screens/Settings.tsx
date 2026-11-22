import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, CategoryChips, Icon, LogoMark, Sheet, Switch, useToast, Wordmark } from '../components/ui'
import { applyTheme, currentTheme, prefs, type Theme } from '../lib/prefs'
import { currentSubscription, disablePush, enablePush, isStandalone, pushSupported } from '../lib/push'
import { errorText, supabase } from '../lib/supabase'
import type { Category, FixedExpense } from '../lib/types'
import { useCategories, useFixed, useInvalidate, useMembers } from '../state/data'
import { useGroup } from '../state/session'

export const PALETTE = [
  '#2f7d4f', '#4a9d6b', '#6bb88a', '#8fd0a8', '#1f5c3a', '#3c6e55',
  '#5b8c85', '#7a9e9f', '#a3b18a', '#c2a878', '#b5835a', '#8c6d62',
  '#7a8f82', '#9a8fb0', '#6d7f99', '#c48b8b',
]

export default function Settings() {
  const { group, groups, selectGroup, userId, profile, refreshGroups } = useGroup()
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
    if (!confirm(self ? `¿Salir de «${group.name}»?` : `¿Quitar a ${label} del grupo?`)) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', id)
    if (error) return toast(errorText(error))
    if (self) {
      await refreshGroups()
      nav('/', { replace: true })
    } else invalidate()
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
        {groups.length > 1 && (
          <div className="field">
            <span className="label">Cambiar de grupo</span>
            <div className="chips">
              {groups.map((g) => (
                <button key={g.id} className="chip" aria-pressed={g.id === group.id} onClick={() => selectGroup(g.id)}>{g.name}</button>
              ))}
            </div>
          </div>
        )}
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNewGroup(true)}>+ Crear otro grupo</button>
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
        <div className="item">
          <div className="grow">
            <div className="title">Abrir directo en «Nuevo gasto»</div>
            <div className="meta">Al tocar el ícono de la app.</div>
          </div>
          <Switch checked={openOnAdd} onChange={(v) => { setOpenOnAdd(v); prefs.set('openOnAdd', v) }} label="Abrir en nuevo gasto" />
        </div>
      </div>

      <div style={{ marginTop: 28 }} className="stack">
        <button className="btn block" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        <div className="row" style={{ justifyContent: 'center', opacity: 0.7 }}>
          <LogoMark size={22} /><Wordmark size={15} />
        </div>
      </div>

      {editCat && <CategorySheet key={editCat === 'new' ? 'new' : editCat.id} cat={editCat} onClose={() => setEditCat(null)} />}
      {editFixed && <FixedSheet key={editFixed === 'new' ? 'new' : editFixed.id} fixed={editFixed} onClose={() => setEditFixed(null)} />}
      {newGroup && <NewGroupSheet onClose={() => setNewGroup(false)} />}
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

function NewGroupSheet({ onClose }: { onClose: () => void }) {
  const { selectGroup, refreshGroups } = useGroup()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function create(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim() })
    if (error) return setErr(errorText(error))
    selectGroup(data as string)
    await refreshGroups()
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Nuevo grupo">
      <form className="stack" onSubmit={create}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo" autoFocus />
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={!name.trim()}>Crear</button>
      </form>
    </Sheet>
  )
}
