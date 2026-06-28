import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/ibm-plex-sans-hebrew/400.css'
import '@fontsource/ibm-plex-sans-hebrew/500.css'
import '@fontsource/ibm-plex-sans-hebrew/600.css'
import '@fontsource/ibm-plex-sans-hebrew/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import './styles/index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import BootError from './components/BootError.jsx'
import { isSupabaseConfigured } from './lib/config.js'

const root = ReactDOM.createRoot(document.getElementById('root'))

if (!isSupabaseConfigured()) {
  root.render(
    <BootError
      title="חסרה הגדרת Supabase"
      message="צור קובץ .env בשורש הפרויקט עם VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY, ואז הפעל מחדש את npm run dev."
      details={"VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\nVITE_ADMIN_EMAIL=your@gmail.com"}
    />,
  )
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
