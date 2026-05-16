export const COLOR_THEMES = [
  { id: "stone",  label: "Stone",  swatch: "oklch(0.553 0.013 58.071)" },
  { id: "zinc",   label: "Zinc",   swatch: "oklch(0.552 0.016 285.938)" },
  { id: "slate",  label: "Slate",  swatch: "oklch(0.554 0.022 257.417)" },
  { id: "blue",   label: "Blue",   swatch: "oklch(0.546 0.245 262.881)" },
  { id: "green",  label: "Green",  swatch: "oklch(0.527 0.154 155.938)" },
  { id: "rose",   label: "Rose",   swatch: "oklch(0.553 0.213 13.071)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.646 0.222 41.116)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.541 0.281 293.009)" },
] as const

export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"]

export const COLOR_THEME_STORAGE_KEY = "dashacdn-color-theme"
export const DEFAULT_COLOR_THEME: ColorThemeId = "stone"
