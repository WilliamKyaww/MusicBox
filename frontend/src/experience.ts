export type Experience = 'video' | 'music'
export type MusicView =
  | 'home'
  | 'search'
  | 'liked'
  | 'recent'
  | 'downloads'
  | 'playlists'
  | 'playlist'
  | 'imports'
  | 'settings'
  | 'artists'
export type MusicRoute = {
  name: 'music'
  view: MusicView
  query: string
  playlistId: string
}
const VIEWS: MusicView[] = [
  'home',
  'search',
  'liked',
  'recent',
  'downloads',
  'playlists',
  'playlist',
  'imports',
  'settings',
  'artists',
]
const KEY = 'musicbox-experience'

export function parseMusicRoute(hash: string): MusicRoute | null {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  if (path !== '/music' && !path.startsWith('/music/')) return null
  const view = path.split('/')[2] as MusicView
  const params = new URLSearchParams(query)
  return {
    name: 'music',
    view: VIEWS.includes(view) ? view : 'home',
    query: params.get('q') ?? '',
    playlistId: params.get('id') ?? '',
  }
}

export function musicPath(view: MusicView = 'home', value = '') {
  const params = new URLSearchParams()
  if (view === 'search' && value) params.set('q', value)
  if (view === 'playlist' && value) params.set('id', value)
  return `#/music/${view}${params.size ? `?${params}` : ''}`
}

export function rememberExperience(hash: string) {
  const mode = parseMusicRoute(hash) ? 'music' : 'video'
  try {
    localStorage.setItem(KEY, mode)
    localStorage.setItem(`${KEY}-${mode}-route`, hash || '#/')
  } catch {
    /* Continue in memory when browser storage is disabled. */
  }
}

export function experiencePath(mode: Experience) {
  const fallback = mode === 'music' ? musicPath() : '#/'
  try {
    const saved = localStorage.getItem(`${KEY}-${mode}-route`)
    if (!saved?.startsWith('#/')) return fallback
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
    if (localStorage.getItem(KEY) === 'music')
      window.history.replaceState(null, '', experiencePath('music'))
  } catch {
    /* Explicit links still work without storage. */
  }
}
