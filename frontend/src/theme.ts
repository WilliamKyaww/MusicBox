import { useSyncExternalStore } from 'react'

/** The Video experience's light or dark theme; Music is always dark. */
export type Theme = 'light' | 'dark'

const KEY = 'spotimy-theme'
const listeners = new Set<() => void>()

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    return 'light'
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let theme: Theme = initialTheme()

export function getTheme() {
  return theme
}

export function setTheme(next: Theme) {
  theme = next
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Some private browsing modes block storage writes.
  }
  listeners.forEach((listener) => listener())
}

export function toggleTheme() {
  setTheme(theme === 'light' ? 'dark' : 'light')
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => theme,
  )
}
