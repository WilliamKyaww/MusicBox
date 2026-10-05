import { StatusPanel } from '../components/StatusPanel'
import { moviesPath } from './routes'
import type { Movie } from './api'

export function MovieFailure({ text, retry }: { text: string; retry?: () => void }) {
  return <div role="alert"><StatusPanel title="Unable to Load" body={text} tone="error" />{retry && <button className="movies-action" onClick={retry}>Try again</button>}</div>
}
export function MovieLoading() { return <p className="movies-loading" role="status">Loading your cinema...</p> }
export function MovieCard({ movie }: { movie: Movie }) {
  return <a className="movie-card" href={moviesPath('details', movie.id)} aria-label={`Details for ${movie.title}`}>
    <div className="movie-card__art">{movie.poster ? <img src={movie.poster} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span aria-hidden="true">{movie.title.slice(0, 1)}</span>}
      <span className="movie-card__badge">{movie.playable ? 'Ready to play' : movie.kind === 'show' ? 'TV series' : 'Details only'}</span>
    </div><strong>{movie.title}</strong><small>{movie.date.slice(0, 4)}{movie.runtime ? ` / ${movie.runtime} min` : ''}</small>
    {movie.progress && <progress aria-label={`Progress for ${movie.title}`} value={movie.progress.position} max={movie.progress.duration || 1} />}
  </a>
}
export function MovieRow({ title, items }: { title: string; items: Movie[] }) {
  if (!items.length) return null
  return <section className="movie-row"><h2>{title}</h2><div className="movie-row__items">{items.map(item => <MovieCard key={item.id} movie={item} />)}</div></section>
}
export function MovieCredits() {
  return <footer className="movies-credits"><h2>Credits and Availability</h2>
    <p>Local files stay on your computer. Profiles separate viewing history, not user accounts or parental permissions.</p>
    <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="/tmdb-logo.svg" alt="TMDB" width="70" /></a>
    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    <p>Availability data: JustWatch via TMDB. Catalogue listings, ratings, trailers and availability links do not grant film streaming rights.</p>
  </footer>
}
