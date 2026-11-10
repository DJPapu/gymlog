import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Hoy', icon: '🏋️' },
  { to: '/rutinas', label: 'Rutinas', icon: '📋' },
  { to: '/ejercicios', label: 'Ejercicios', icon: '💪' },
  { to: '/progreso', label: 'Progreso', icon: '📈' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
]

export default function BottomNav() {
  return (
    <nav className="border-t border-gray-200 bg-white flex pb-safe">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors min-h-[56px] ${
              isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
