import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { applyCachedTheme } from './themes/themes.ts'
import './app.css'

// Apply the last-used theme before first paint to avoid a flash of the default theme.
applyCachedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
