import { useEffect, useLayoutEffect } from 'react'

/**
 * Back/forward returns to where you were on the previous page, while following a
 * link starts at the top. Each history entry gets a key in `history.state`, so an
 * entry we have seen before is a back/forward visit.
 */

const positions = new Map<string, number>()
let entryCounter = 0

function currentEntryKey(): string | null {
  const state = window.history.state as { musicboxKey?: string } | null
  return state?.musicboxKey ?? null
}

function ensureEntryKey() {
  const existing = currentEntryKey()
  if (existing) return { key: existing, isNew: false }

  entryCounter += 1
  const key = `${Date.now()}-${entryCounter}`
  window.history.replaceState({ ...(window.history.state ?? {}), musicboxKey: key }, '')
  return { key, isNew: true }
}

export function useScrollRestoration(hash: string) {
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    let frame = 0
    function handleScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const key = currentEntryKey()
        if (key) positions.set(key, window.scrollY)
      })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Runs after the new page rendered, so cached content is already in place.
  useLayoutEffect(() => {
    const { key, isNew } = ensureEntryKey()
    const saved = positions.get(key)
    window.scrollTo(0, isNew || saved === undefined ? 0 : saved)
  }, [hash])
}
