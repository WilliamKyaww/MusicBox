import { useSyncExternalStore } from 'react'
import { apiFetchJson } from '../api/client'

type MoviesStatus = {
  enabled: boolean
  stage: 'foundation' | 'local'
  metadata_configured?: boolean
  media_configured?: boolean
  local_access?: boolean
  catalogue_available: boolean
  playback_available: boolean
  schema_version: number
}
type Snapshot = { data: MoviesStatus | null; error: boolean; loading: boolean }
let snapshot: Snapshot = { data: null, error: false, loading: true }
let started = false
let requestId = 0
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

export async function refreshMoviesStatus() {
  const id = ++requestId
  publish({ ...snapshot, loading: true, error: false })
  try {
    const data = await apiFetchJson<MoviesStatus>('/api/movies/status', {
      signal: AbortSignal.timeout(10_000),
    })
    if (typeof data.enabled !== 'boolean' || !['foundation','local'].includes(data.stage)) {
      throw new Error('Unsupported Movies status')
    }
    if (id === requestId) publish({ data, error: false, loading: false })
  } catch {
    if (id === requestId) publish({ data: null, error: true, loading: false })
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    void refreshMoviesStatus()
  }
  if (listeners.size === 1) {
    window.addEventListener('musicbox-movies-settings-changed', refreshMoviesStatus)
    window.addEventListener('focus', refreshMoviesStatus)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      window.removeEventListener('musicbox-movies-settings-changed', refreshMoviesStatus)
      window.removeEventListener('focus', refreshMoviesStatus)
    }
  }
}

export function useMoviesStatus() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
