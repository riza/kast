"use client"

import * as React from "react"
import {
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  type ColorThemeId,
} from "@/lib/color-themes"

type ColorThemeContextType = {
  colorTheme: ColorThemeId
  setColorTheme: (theme: ColorThemeId) => void
}

const ColorThemeContext = React.createContext<ColorThemeContextType | undefined>(
  undefined
)

export function ColorThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [colorTheme, setColorThemeState] = React.useState<ColorThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_COLOR_THEME
    return (
      (localStorage.getItem(COLOR_THEME_STORAGE_KEY) as ColorThemeId) ||
      DEFAULT_COLOR_THEME
    )
  })

  const setColorTheme = React.useCallback((theme: ColorThemeId) => {
    setColorThemeState(theme)
    if (theme === DEFAULT_COLOR_THEME) {
      document.documentElement.removeAttribute("data-color-theme")
      localStorage.removeItem(COLOR_THEME_STORAGE_KEY)
    } else {
      document.documentElement.setAttribute("data-color-theme", theme)
      localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme)
    }
  }, [])

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

export function useColorTheme() {
  const context = React.useContext(ColorThemeContext)
  if (!context) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider")
  }
  return context
}
