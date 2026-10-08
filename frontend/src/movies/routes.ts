export type MoviesView = 'home' | 'movies' | 'tv' | 'search' | 'free' | 'list' | 'history' | 'library' | 'profiles' | 'details' | 'watch' | 'settings'
export type MoviesRoute = { name: 'movies'; view: MoviesView | 'not-found'; id: string; query: string }
const VIEWS: MoviesView[] = ['home','movies','tv','search','free','list','history','library','profiles','details','watch','settings']

export function moviesPath(view: MoviesView = 'home', id = '', query = '') {
  const params = new URLSearchParams()
  if (id) params.set('id', id)
  if (query) params.set('q', query)
  return `#/movies/${view}${params.size ? `?${params}` : ''}`
}

export function parseMoviesRoute(hash: string): MoviesRoute | null {
  const [path, search = ''] = hash.replace(/^#/, '').split('?')
  if (path !== '/movies' && !path.startsWith('/movies/')) return null
  const candidate = path === '/movies' || path === '/movies/' ? 'home' : path.slice('/movies/'.length)
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? ''
  let view: MoviesRoute['view'] = VIEWS.includes(candidate as MoviesView) ? candidate as MoviesView : 'not-found'
  if ((view === 'details' || view === 'watch') && !/^(tmdb|local|open):(movie|show|episode):[A-Za-z0-9:-]+$/.test(id)) view = 'not-found'
  return { name: 'movies', view, id, query: params.get('q') ?? '' }
}
