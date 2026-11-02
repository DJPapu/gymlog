import { useState } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import SplashScreen from './components/SplashScreen'
import SyncBadge from './components/SyncBadge'
import { useAuth } from './lib/auth'
import Ejercicios from './pages/Ejercicios'
import Hoy from './pages/Hoy'
import Login from './pages/Login'
import Progreso from './pages/Progreso'
import Rutinas from './pages/Rutinas'
import Sesion from './pages/Sesion'
import { useSyncStatus } from './sync/useSyncStatus'

// En dev (VITE_SUPABASE_URL = placeholder) se salta el login
const AUTH_REQUIRED = !import.meta.env.VITE_SUPABASE_URL?.includes('placeholder')

function AppShell() {
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!inSession && <BottomNav />}
    </div>
  )
}

export default function App() {
  const { loading, session } = useAuth()
  const [showSplash, setShowSplash] = useState(true)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (AUTH_REQUIRED && !session) {
    return <Login />
  }

  return (
    <Router>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <AppShell />
    </Router>
  )
}
