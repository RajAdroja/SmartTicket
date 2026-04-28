import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import './index.css'
import App from './App.tsx'
import { createAppTheme } from './theme/theme'

type ThemePreference = 'system' | 'light' | 'dark'
type SavedSettings = { theme?: ThemePreference }

const SETTINGS_KEY = 'customer_settings'
const THEME_CHANGE_EVENT = 'app-theme-change'

const getStoredThemePreference = (): ThemePreference => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return 'system'
    const parsed = JSON.parse(raw) as SavedSettings
    if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
      return parsed.theme
    }
  } catch {
    // Ignore malformed settings.
  }
  return 'system'
}

function Root() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference)
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleSystemTheme)
    return () => mediaQuery.removeEventListener('change', handleSystemTheme)
  }, [])

  useEffect(() => {
    const refreshThemePreference = () => {
      setThemePreference(getStoredThemePreference())
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_KEY) {
        refreshThemePreference()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(THEME_CHANGE_EVENT, refreshThemePreference)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(THEME_CHANGE_EVENT, refreshThemePreference)
    }
  }, [])

  const resolvedMode = themePreference === 'system' ? systemTheme : themePreference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedMode === 'dark')
    document.documentElement.style.colorScheme = resolvedMode
  }, [resolvedMode])

  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
