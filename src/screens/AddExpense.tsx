import { useNavigate } from 'react-router-dom'
import ExpenseForm from '../components/ExpenseForm'
import { Icon } from '../components/ui'
import { useGroup } from '../state/session'

/** Pantalla de carga rápida: es lo primero que se abre al tocar el ícono. */
export default function AddExpense() {
  const nav = useNavigate()
  const { group } = useGroup()
  const close = () => nav('/', { replace: true })
  return (
    <div className="page no-nav">
      <div className="top">
        <button className="icon-btn" onClick={close} aria-label="Cerrar"><Icon name="close" /></button>
        <span className="muted small">Nuevo gasto · {group.name}</span>
        <span style={{ width: 40 }} />
      </div>
      <ExpenseForm mode="add" onDone={close} />
    </div>
  )
}
