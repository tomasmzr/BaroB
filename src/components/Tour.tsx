import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { prefs } from '../lib/prefs'
import { isStandalone } from '../lib/push'
import { setDemo } from '../state/demo'
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
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const on = () => setCanPrompt(true)
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  if (isStandalone() || installed) return <>¡Listo! BaroB ya está en tu pantalla de inicio. Abrila siempre desde ese ícono.</>
  if (canPrompt) {
    return (
      <>
        <p style={{ margin: '0 0 10px' }}>Así se abre como una app y te llegan las notificaciones.</p>
        <button className="btn primary block" onClick={async () => {
          await deferredInstall?.prompt()
          deferredInstall = null
          setCanPrompt(false)
          setInstalled(true)
        }}>Agregar a la pantalla de inicio</button>
      </>
    )
  }
  if (isIOS) {
    return (
      <>
        <p style={{ margin: '0 0 8px' }}>En iPhone, Apple no deja que una página web se instale sola, así que son 3 toques:</p>
        <ol className="tour-list">
          <li>Tocá <b>Compartir</b> <ShareGlyph /> en la barra de Safari (si no lo ves, tocá <b>•••</b> y después Compartir).</li>
          <li>Elegí <b>«Agregar a inicio»</b> (o «Agregar a pantalla de inicio»).</li>
          <li>Tocá <b>Agregar</b> y abrí BaroB desde el ícono nuevo.</li>
        </ol>
        <div className="tour-arrow" aria-hidden="true">↓</div>
      </>
    )
  }
  return (
    <ol className="tour-list">
      <li>Abrí el menú del navegador (<b>⋮</b>).</li>
      <li>Elegí <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.</li>
      <li>Abrí BaroB desde el ícono nuevo.</li>
    </ol>
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
    body: <>Acá registran los gastos de la casa y BaroB calcula cuánto le toca poner a cada uno. Te lo muestro con un <b>grupo de ejemplo</b> lleno de datos; al terminar arrancás con el tuyo, de cero.</>,
  },
  {
    target: '.group-bar', route: '/',
    title: 'Tus grupos',
    body: <>Arriba de todo está el grupo en el que estás. Tocalo para cambiar a otro o crear uno nuevo (puede ser solo para vos, para tus finanzas personales).</>,
  },
  {
    target: '.nav .fab', route: '/',
    title: 'Cargar un gasto',
    body: <>Con este botón cargás un gasto: monto, en qué, categoría y quién pagó (por defecto vos). Si es en cuotas, activás «En cuotas». Al tocar el ícono de la app se abre directo acá.</>,
  },
  {
    target: '[data-tour="summary"]', route: '/',
    title: 'El mes en curso',
    body: <>Cuánto se gastó, qué parte de los ingresos representa, cuánto pusiste vos y cuánto te toca. Si los gastos superan los ingresos, el excedente se pinta en rojo.</>,
  },
  {
    target: '[data-tour="incomes"]', route: '/',
    title: 'Ingresos',
    body: <>Cada uno carga lo que ganó en el mes (pueden ser varios). Con eso se calcula qué parte de los gastos le toca a cada uno.</>,
  },
  {
    target: '[data-tour="fixed"]', route: '/fixed',
    title: 'Gastos fijos',
    body: <>Expensas, luz, prepaga… ya vienen cargados. Cada mes solo completás quién pagó y cuánto. Acá faltan Agua y Prepaga: hasta completarlos no se puede cerrar el mes.</>,
  },
  {
    target: '[data-tour="settle"]', route: '/close',
    title: 'Cerrar el mes',
    body: <>Cuando están todos los fijos e ingresos, BaroB dice quién le pasa plata a quién. Se cierra cuando ustedes deciden; el mes lleva nombre (p. ej. «Noviembre 2026») y arranca el siguiente.</>,
  },
  {
    target: '[data-tour="chart"]', route: '/history',
    title: 'Historial',
    body: <>Cada mes cerrado, y el mes en curso (●), con cada categoría como % de los ingresos. Si una barra pasa la línea del 100%, ese mes se gastó más de lo que entró.</>,
  },
  {
    target: '[data-tour="split"]', route: '/settings',
    title: 'Ajustes',
    body: <>Elegí cómo dividir (proporcional, con topes, % fijos o partes iguales), invitá al resto con un link, editá categorías y fijos, y activá las notificaciones.</>,
  },
  {
    route: '/',
    title: '¡Listo para arrancar!',
    body: <>Ahora se borra el ejemplo y quedás en tu grupo real. Podés volver a ver este recorrido desde Ajustes.</>,
  },
]

export default function Tour() {
  const [open, setOpen] = useState(() => !prefs.get('tourDone', false))
  const [i, setI] = useState(() => (isStandalone() ? 1 : 0))
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const step = steps[i]

  useEffect(() => {
    const start = () => { setI(isStandalone() ? 1 : 0); setOpen(true) }
    window.addEventListener('barob:tour', start)
    return () => window.removeEventListener('barob:tour', start)
  }, [])

  // Mientras dura el tutorial se muestran datos de ejemplo
  useEffect(() => {
    setDemo(open)
    return () => setDemo(false)
  }, [open])

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

  const finish = () => { prefs.set('tourDone', true); setOpen(false); setDemo(false); nav('/', { replace: true }) }
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
