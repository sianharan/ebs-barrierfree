import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { SettingsProvider } from './lib/settings.jsx'
import { RouterProvider } from './lib/router.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </SettingsProvider>
  </StrictMode>,
)
