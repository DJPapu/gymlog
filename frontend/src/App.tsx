import { useState } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import SplashScreen from './components/SplashScreen'
import SyncBadge from './components/SyncBadge'
import AdminApp from './pages/admin/AdminApp'
import Ejercicios from './pages/Ejercicios'
import Hoy from './pages/Hoy'
import Perfil from './pages/Perfil'
import Progreso from './pages/Progreso'
import Rutinas from './pages/Rutinas'
import Sesion from './pages/Sesion'
import { useSyncStatus } from './sync/useSyncStatus'

function MobileShell() {
  const location = useLocation()
  const inSession = location.pathname.startsWith('/sesion/')
  const { state, pendingCount, doSync, lastError } = useSyncStatus()

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto">
      {!inSession && (
        <div className="flex justify-end px-4 pt-2 pb-0">
          <SyncBadge state={state} pendingCount={pendingCount} onSync={doSync} lastError={lastError} />
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<Hoy />} />
          <Route path="/sesion/:id" element={<Sesion />} />
          <Route path="/rutinas" element={<Rutinas />} />
          <Route path="/ejercicios" element={<Ejercicios />} />
          <Route path="/progreso" element={<Progreso />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!inSession && <BottomNav />}
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <Router>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<MobileShell />} />
      </Routes>
    </Router>
  )
}
