import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useSyncStatus } from '../../sync/useSyncStatus'
import SyncBadge from '../../components/SyncBadge'
import AdminRutinas from './AdminRutinas'
import AdminCatalogo from './AdminCatalogo'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined

export default function AdminApp() {
  const { user } = useAuth()

  if (!ADMIN_EMAIL || user?.email !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />
  }

  return <AdminShell />
}

function AdminShell() {
  const location = useLocation()
  const { state, pendingCount, doSync, lastError } = useSyncStatus()
  const tab = location.pathname.split('/')[2] ?? 'rutinas'

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6 shrink-0">
        <span className="text-white font-bold tracking-tight">GymLog Admin</span>
        <nav className="flex gap-1 flex-1">
          <TabLink to="/admin/rutinas" active={tab === 'rutinas'}>Rutinas</TabLink>
          <TabLink to="/admin/catalogo" active={tab === 'catalogo'}>Catálogo</TabLink>
        </nav>
        <SyncBadge state={state} pendingCount={pendingCount} onSync={doSync} lastError={lastError} />
        <Link to="/" className="text-gray-500 hover:text-white text-sm transition-colors">← App móvil</Link>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<Navigate to="rutinas" replace />} />
          <Route path="rutinas" element={<AdminRutinas />} />
          <Route path="catalogo" element={<AdminCatalogo />} />
        </Routes>
      </main>
    </div>
  )
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {children}
    </Link>
  )
}
