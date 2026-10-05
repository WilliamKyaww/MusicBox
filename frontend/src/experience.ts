import { moviesPath, parseMoviesRoute } from './movies/routes.ts'

export type Experience = 'video' | 'music' | 'movies'
export type MusicView =
  | 'home'
  | 'search'
  | 'liked'
  | 'recent'
  | 'repeat'
  | 'downloads'
  | 'playlists'
  | 'playlist'
  | 'artist'
  | 'album'
  | 'mix'
  | 'lyrics'
  | 'imports'
  | 'settings'
  | 'artists'
export type MusicRoute = {
  name: 'music'
  view: MusicView
  /** Search text, or the search a mix is built from. */
  query: string
  /** Kept for the playlist view; equal to `id`. */
  playlistId: string
  /** Playlist, channel or YouTube playlist id, depending on the view. */
  id: string
  /** Display name for generated mixes. */
  title: string
  /** Seed video for song radio, or a video whose channel opens an artist page. */
  video: string
}
const VIEWS: MusicView[] = [
  'home',
  'search',
  'liked',
  'recent',
  'repeat',
  'downloads',
  'playlists',
  'playlist',
  'artist',
  'album',
  'mix',
  'lyrics',
  'imports',
  'settings',
  'artists',
]
const QUERY_VIEWS: MusicView[] = ['search', 'mix']
const ID_VIEWS: MusicView[] = ['playlist', 'artist', 'album']
const KEY = 'musicbox-experience'

export function parseMusicRoute(hash: string): MusicRoute | null {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  if (path !== '/music' && !path.startsWith('/music/')) return null
  const view = path.split('/')[2] as MusicView
  const params = new URLSearchParams(query)
  const id = params.get('id') ?? ''
  return {
    name: 'music',
    view: VIEWS.includes(view) ? view : 'home',
    query: params.get('q') ?? '',
    playlistId: id,
    id,
    title: params.get('title') ?? '',
    video: params.get('v') ?? '',
  }
}

/**
 * `value` is the search text for search and mix views and the id for playlist,
 * artist and album views; `extra` adds `title` or `v`.
 */
export function musicPath(
  view: MusicView = 'home',
  value = '',
  extra: { title?: string; v?: string } = {},
) {
  const params = new URLSearchParams()
  if (QUERY_VIEWS.includes(view) && value) params.set('q', value)
  if (ID_VIEWS.includes(view) && value) params.set('id', value)
  if (extra.title) params.set('title', extra.title)
  if (extra.v) params.set('v', extra.v)
  return `#/music/${view}${params.size ? `?${params}` : ''}`
}

/** Opens an artist page by channel id, or by a video whose channel is looked up first. */
export function artistPath(channelId: string, videoId = '') {
  if (channelId) return musicPath('artist', channelId)
  return musicPath('artist', '', { v: videoId })
}

export function rememberExperience(hash: string) {
  const mode = parseMoviesRoute(hash) ? 'movies' : parseMusicRoute(hash) ? 'music' : 'video'
  try {
    localStorage.setItem(KEY, mode)
    localStorage.setItem(`${KEY}-${mode}-route`, hash || '#/')
  } catch {
    /* Continue in memory when browser storage is disabled. */
  }
}

export function experiencePath(mode: Experience) {
  const fallback = mode === 'movies' ? moviesPath() : mode === 'music' ? musicPath() : '#/'
  try {
    const saved = localStorage.getItem(`${KEY}-${mode}-route`)
    if (!saved?.startsWith('#/')) return fallback
    if (Boolean(parseMoviesRoute(saved)) !== (mode === 'movies')) return fallback
    if (Boolean(parseMusicRoute(saved)) !== (mode === 'music')) return fallback
    // Returning to a view must not auto-start a video over the persistent audio player.
    if (mode === 'video' && saved.startsWith('#/watch')) return '#/'
    return saved
  } catch {
    return fallback
  }
}

export function restoreExperience() {
  if (window.location.hash) return
  try {
    const mode = localStorage.getItem(KEY)
    if (mode === 'music' || mode === 'movies')
      window.history.replaceState(null, '', experiencePath(mode))
  } catch {
    /* Explicit links still work without storage. */
  }
}
