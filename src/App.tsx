import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Icon, Spinner } from './components/ui'
import { configured } from './lib/supabase'
import { prefs } from './lib/prefs'
import { useRealtime } from './state/data'
import { useSession } from './state/session'
import AddExpense from './screens/AddExpense'
import CloseMonth from './screens/CloseMonth'
import Fixed from './screens/Fixed'
import History from './screens/History'
import HistoryDetail from './screens/HistoryDetail'
import Join from './screens/Join'
import Login from './screens/Login'
import Month from './screens/Month'
import Onboarding from './screens/Onboarding'
import Settings from './screens/Settings'
import Setup from './screens/Setup'

const PENDING_JOIN = 'barob.pendingJoin'

function Shell() {
  useRealtime()
  return (
    <>
      <Outlet />
      <nav className="nav" aria-label="Navegación">
        <NavLink to="/" end><Icon name="home" />Mes</NavLink>
        <NavLink to="/fixed"><Icon name="pin" />Fijos</NavLink>
        <NavLink to="/add" className="fab" aria-label="Nuevo gasto"><Icon name="plus" size={28} stroke={2.2} /></NavLink>
        <NavLink to="/history"><Icon name="chart" />Historial</NavLink>
        <NavLink to="/settings"><Icon name="gear" />Ajustes</NavLink>
      </nav>
    </>
  )
}

/** Punto de entrada del ícono en la pantalla de inicio. */
function Start() {
  return <Navigate to={prefs.get('openOnAdd', true) ? '/add' : '/'} replace />
}

export default function App() {
  const { session, loading, groups, groupsLoading, group } = useSession()
  const loc = useLocation()
  const nav = useNavigate()

  // Si alguien abre un link de invitación sin sesión, lo recordamos para después del login.
  const joinMatch = loc.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1] ?? null
  useEffect(() => {
    if (joinMatch && !session && !loading) sessionStorage.setItem(PENDING_JOIN, joinMatch)
  }, [joinMatch, session, loading])
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_JOIN)
    if (session && pending && !joinMatch) {
      sessionStorage.removeItem(PENDING_JOIN)
      nav(`/join/${pending}`, { replace: true })
    }
  }, [session, joinMatch, nav])

  if (!configured) return <Setup />
  if (loading || groupsLoading) return <div className="center-screen"><Spinner /></div>
  if (!session) return <Login />

  if (joinMatch) return <Routes><Route path="/join/:code" element={<Join />} /></Routes>
  if (!groups.length || !group) return <Onboarding />

  return (
    <Routes>
      <Route path="/start" element={<Start />} />
      <Route path="/add" element={<AddExpense />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Month />} />
        <Route path="/fixed" element={<Fixed />} />
        <Route path="/close" element={<CloseMonth />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<HistoryDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
