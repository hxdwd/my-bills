import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 设计系统为纯浅色方案，固定 light
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')
  }, [])

  const toggleTheme = () => {
    // 纯浅色方案，暂不切换深色
    setThemeState('light')
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState('light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
