import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { seedCatalogIfEmpty } from './lib/seedCatalog.ts'
import './index.css'

seedCatalogIfEmpty()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
