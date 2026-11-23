import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { prefs } from '../lib/prefs'
import { isStandalone } from '../lib/push'
import { Icon, LogoMark } from './ui'

interface Step {
  /** selector del elemento a resaltar; sin selector = burbuja centrada */
  target?: string
  title: string
  body: ReactNode
  /** pantalla donde vive el elemento */
  route?: string
}

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

// Android/Chrome ofrece un prompt de instalación que podemos disparar desde un botón.
type InstallEvent = Event & { prompt: () => Promise<void> }
let deferredInstall: InstallEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredInstall = e as InstallEvent
})

function InstallStep() {
  const [canPrompt, setCanPrompt] = useState(!!deferredInstall)
  if (isStandalone()) return <>¡Ya tenés BaroB instalada! Abrila siempre desde el ícono de tu pantalla de inicio.</>
  if (isIOS) {
    return (
      <ol className="tour-list">
        <li>Abrí esta página en <b>Safari</b>.</li>
        <li>Tocá el botón <b>Compartir</b> <ShareGlyph /> (abajo en el centro, o arriba a la derecha en iPad).</li>
        <li>Elegí <b>«Agregar a inicio»</b> y después <b>Agregar</b>.</li>
        <li>Abrí BaroB desde el ícono nuevo. Así funciona como una app y te llegan las notificaciones.</li>
      </ol>
    )
  }
  return (
    <>
      {canPrompt ? (
        <button className="btn primary block" style={{ margin: '4px 0 10px' }}
          onClick={async () => { await deferredInstall?.prompt(); deferredInstall = null; setCanPrompt(false) }}>
          Instalar BaroB
        </button>
      ) : null}
      <ol className="tour-list">
        <li>En Chrome, tocá el menú <b>⋮</b> (arriba a la derecha).</li>
        <li>Elegí <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.</li>
        <li>Abrí BaroB desde el ícono nuevo.</li>
      </ol>
    </>
  )
}

function ShareGlyph() {
  return (
    <span style={{ display: 'inline-flex', verticalAlign: '-4px', color: 'var(--green)' }}><Icon name="share" size={18} /></span>
  )
}

const steps: Step[] = [
  { title: 'Primero: instalala en tu teléfono', body: <InstallStep /> },
  {
    title: 'Bienvenido a BaroB',
    body: <>Acá registran los gastos de la casa y BaroB calcula cuánto le toca poner a cada uno según lo que gana. Te muestro cómo se usa en 1 minuto.</>,
  },
  {
    target: '.nav .fab', route: '/',
    title: 'Cargar un gasto',
    body: <>Este botón es para cargar un gasto: monto, en qué, categoría y quién pagó (por defecto vos). Si es en cuotas, activás «En cuotas» y elegís cuántas. Al tocar el ícono de la app se abre directo acá.</>,
  },
  {
    target: '[data-tour="summary"]', route: '/',
    title: 'El mes en curso',
    body: <>Cuánto se gastó, qué parte de los ingresos representa, cuánto pusiste vos y cuánto te toca. Si los gastos superan los ingresos, la barra se pone en rojo.</>,
  },
  {
    target: '[data-tour="incomes"]', route: '/',
    title: 'Ingresos',
    body: <>Cada uno carga lo que ganó en el mes (pueden ser varios ingresos). Con eso se calcula la proporción de cada uno.</>,
  },
  {
    target: '.nav a[href="#/fixed"]', route: '/',
    title: 'Gastos fijos',
    body: <>Alquiler, expensas, luz… Ya tienen descripción y categoría: cada mes solo completás quién pagó y cuánto.</>,
  },
  {
    target: '[data-tour="close"]', route: '/',
    title: 'Cerrar el mes',
    body: <>Muestra quién le tiene que dar a quién. Se puede cerrar cuando todos cargaron su ingreso y todos los fijos están completos. Los meses llevan nombre (p. ej. «Noviembre 2026») pero se cierran cuando ustedes deciden.</>,
  },
  {
    target: '.nav a[href="#/history"]', route: '/',
    title: 'Historial',
    body: <>Cada mes cerrado queda guardado, con un gráfico de cómo evoluciona cada categoría.</>,
  },
  {
    target: '.nav a[href="#/settings"]', route: '/',
    title: 'Ajustes',
    body: <>Invitá al resto con un link, editá categorías y gastos fijos, elegí cómo dividir los gastos, el tema claro u oscuro y activá las notificaciones.</>,
  },
]

export default function Tour() {
  const [open, setOpen] = useState(() => !prefs.get('tourDone', false))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const step = steps[i]

  useEffect(() => {
    const start = () => { setI(0); setOpen(true) }
    window.addEventListener('barob:tour', start)
    return () => window.removeEventListener('barob:tour', start)
  }, [])

  useEffect(() => {
    if (open && step.route && loc.pathname !== step.route) nav(step.route)
  }, [open, step, loc.pathname, nav])

  useLayoutEffect(() => {
    if (!open || !step.target) { setRect(null); return }
    let raf = 0
    const measure = () => {
      const el = document.querySelector(step.target!)
      if (!el) { raf = requestAnimationFrame(measure); return }
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
      setRect(el.getBoundingClientRect())
    }
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [open, step, loc.pathname])

  if (!open) return null

  const finish = () => { prefs.set('tourDone', true); setOpen(false); setI(0) }
  const last = i === steps.length - 1
  const pad = 6

  // La burbuja va arriba del elemento si este está en la mitad de abajo.
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false
  const bubbleStyle: React.CSSProperties = rect
    ? below
      ? { top: Math.min(rect.bottom + pad + 12, window.innerHeight - 260) }
      : { bottom: Math.max(window.innerHeight - rect.top + pad + 12, 16) }
    : { top: '50%', transform: 'translateY(-50%)' }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tutorial">
      {rect ? (
        <div className="tour-hole" style={{
          top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
        }} />
      ) : <div className="tour-scrim" />}
      <div className="tour-bubble" style={bubbleStyle}>
        {i <= 1 && <div style={{ marginBottom: 8 }}><LogoMark size={36} /></div>}
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <b style={{ fontSize: 17 }}>{step.title}</b>
          <span className="tiny faint" style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>{i + 1}/{steps.length}</span>
        </div>
        <div className="small" style={{ marginTop: 6, color: 'var(--text-2)' }}>{step.body}</div>
        <div className="between" style={{ marginTop: 14 }}>
          {last ? <span /> : <button className="btn ghost sm" onClick={finish}>Saltar</button>}
          <div className="row">
            {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Atrás</button>}
            <button className="btn primary sm" onClick={() => (last ? finish() : setI(i + 1))}>{last ? '¡Listo!' : 'Siguiente'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
