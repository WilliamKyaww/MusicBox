import { useSyncExternalStore } from 'react'

/** Every resizable panel in both experiences, with its default and allowed widths in pixels. */
export const PANELS = {
  'music-library': { initial: 300, min: 280, max: 480 },
  'music-side': { initial: 330, min: 280, max: 480 },
  'yt-sidebar': { initial: 240, min: 200, max: 360 },
  'yt-watch-side': { initial: 402, min: 320, max: 560 },
} as const

export type PanelId = keyof typeof PANELS

const KEY = 'musicbox-panel-sizes'
const listeners = new Set<() => void>()

function clamp(id: PanelId, value: number) {
  const { min, max } = PANELS[id]
  return Math.round(Math.min(max, Math.max(min, value)))
}

function read(): Partial<Record<PanelId, number>> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!saved || typeof saved !== 'object') return {}
    const sizes: Partial<Record<PanelId, number>> = {}
    for (const id of Object.keys(PANELS) as PanelId[])
      if (typeof saved[id] === 'number' && Number.isFinite(saved[id])) sizes[id] = clamp(id, saved[id])
    return sizes
  } catch {
    return {}
  }
}

let sizes = read()

export function getPanelSize(id: PanelId) {
  return sizes[id] ?? PANELS[id].initial
}

export function setPanelSize(id: PanelId, value: number) {
  const next = clamp(id, value)
  if (sizes[id] === next) return
  sizes = { ...sizes, [id]: next }
  try {
    localStorage.setItem(KEY, JSON.stringify(sizes))
  } catch {
    // The width still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

export function resetPanelSize(id: PanelId) {
  setPanelSize(id, PANELS[id].initial)
}

export function usePanelSize(id: PanelId) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => getPanelSize(id),
  )
}
