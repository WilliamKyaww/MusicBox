import { useEffect, useState } from 'react'
import { apiFetchJson, apiFetchVoid } from '../api/client'

export type Progress = { position: number; duration: number; completed: boolean; updated_at: number }
export type Movie = {
  id: string; kind: 'movie' | 'show' | 'episode'; title: string; description: string
  date: string; runtime: number; poster: string | null; backdrop: string | null; genres: string[]
  rating: number; cast: string[]; crew: string[]; certification: string; available_providers: string[]
  seasons: { number: number; name: string; count: number }[]; trailer_url: string | null; provider_url: string | null
  assets: { id: string; label: string; available: boolean; duration: number; height: number; video_codec: string; audio_codec: string; intro_start?: number; intro_end?: number }[]
  playable: boolean; progress?: Progress; show_id?: string; season?: number; episode?: number
}
export type Profile = { id: string; name: string; local_default: number }
export type Catalogue = { items: Movie[]; page: number; total_pages: number; source: 'local' | 'tmdb' }
export type MovieSession = { session_id: string; title: Movie; asset_id: string; url: string; resume: number; duration: number; subtitles: { name: string; label: string; url: string }[] }
const base = '/api/movies'
const guard = { 'X-MusicBox-Movies': '1' }
export const movieApi = {
  get: <T,>(path: string, signal?: AbortSignal) => apiFetchJson<T>(base + path, { signal }),
  post: <T,>(path: string, body: unknown = {}) => apiFetchJson<T>(base + path, { method: 'POST', headers: guard, body: JSON.stringify(body) }),
  put: <T,>(path: string, body: unknown, keepalive = false) => apiFetchJson<T>(base + path, { method: 'PUT', headers: guard, body: JSON.stringify(body), keepalive }),
  delete: (path: string) => apiFetchVoid(base + path, { method: 'DELETE', headers: guard }),
}
export const idPath = (id: string) => encodeURIComponent(id)
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

export function useMovieResource<T>(path: string | null) {
  const [version, setVersion] = useState(0)
  const key = `${path}:${version}`
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({ key: '' })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    movieApi.get<T>(path, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: errorText(error) }) })
    return () => controller.abort()
  }, [path, key])
  return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined,
    loading: !!path && result.key !== key, refresh: () => setVersion(v => v + 1) }
}
