export type MoviesRoute = { name: 'movies'; view: 'home' | 'settings' | 'not-found' }

export function moviesPath(view: 'home' | 'settings' = 'home') {
  return `#/movies/${view}`
}

export function parseMoviesRoute(hash: string): MoviesRoute | null {
  const path = hash.replace(/^#/, '').split('?')[0]
  if (path !== '/movies' && !path.startsWith('/movies/')) return null
  const view = path === '/movies' || path === '/movies/' || path === '/movies/home'
    ? 'home' : path === '/movies/settings' ? 'settings' : 'not-found'
  return { name: 'movies', view }
}
