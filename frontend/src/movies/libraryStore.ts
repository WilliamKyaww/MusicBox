import { useSyncExternalStore } from 'react'
import { type Movie, type MovieLibraryResponse, errorText, movieApi } from './api'

/**
 * Every title that can be played here, shared by the header search and each page.
 * Browsing is limited to this list, so nothing shown is a dead end.
 */
type Snapshot = { items: Movie[] | null; error: string; loading: boolean }

const STALE_AFTER = 30_000
let snapshot: Snapshot = { items: null, error: '', loading: true }
let loadedAt = 0
let requestId = 0
let inFlight = false
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach(listener => listener())
}

export async function refreshMovieLibrary() {
  const id = ++requestId
  inFlight = true
  publish({ ...snapshot, loading: true, error: '' })
  try {
    const data = await movieApi.get<MovieLibraryResponse>('/library')
    if (!Array.isArray(data.items)) throw new Error('The Movies library response was not understood.')
    if (id === requestId) { loadedAt = Date.now(); publish({ items: data.items, error: '', loading: false }) }
  } catch (error) {
    if (id === requestId) publish({ items: snapshot.items, error: errorText(error), loading: false })
  } finally {
    if (id === requestId) inFlight = false
  }
}

/** Call after registering or unregistering a file so the lists catch up straight away. */
export function invalidateMovieLibrary() {
  loadedAt = 0
  void refreshMovieLibrary()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!inFlight && Date.now() - loadedAt > STALE_AFTER) void refreshMovieLibrary()
  return () => { listeners.delete(listener) }
}

export function useMovieLibrary() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
