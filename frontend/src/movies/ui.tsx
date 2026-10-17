import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { StatusPanel } from '../components/StatusPanel'
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from '../components/Icons'
import { moviesPath } from './routes'
import type { Movie } from './api'
import { actionFor, artFor, artStyle, formatRuntime, metaParts, progressFraction, qualityBadge, releaseYear, seasonsLabel, sourceLabel, sourceOf } from './format'

export function MovieFailure({ text, retry, title = 'Unable to Load' }: { text: string; retry?: () => void; title?: string }) {
  return <div role="alert"><StatusPanel title={title} body={text} tone="error" />{retry && <button className="movies-action" onClick={retry}>Try again</button>}</div>
}

/** Placeholder rows shaped like the real ones, so the page does not jump when titles arrive. */
export function MovieLoading({ rows = 1 }: { rows?: number }) {
  return <div className="movies-loading" role="status" aria-label="Loading titles">
    {Array.from({ length: rows }, (_, row) => <div className="movies-loading__row" key={row} aria-hidden="true">
      {Array.from({ length: 6 }, (_, card) => <span key={card} />)}
    </div>)}
  </div>
}

export function MovieEmpty({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return <section className="movies-empty"><StatusPanel title={title} body={body} />{children}</section>
}

/** Year, maturity rating, length and quality on one line. */
export function MetaLine({ movie }: { movie: Movie }) {
  const year = releaseYear(movie.date)
  const length = movie.kind === 'show' ? seasonsLabel(movie) : formatRuntime(movie.runtime)
  const quality = qualityBadge(movie)
  if (!year && !movie.certification && !length && !quality) return null
  return <p className="movies-meta">
    {year && <span>{year}</span>}
    {movie.certification && <span className="movies-chip">{movie.certification}</span>}
    {length && <span>{length}</span>}
    {quality && <span className="movies-chip movies-chip--solid">{quality}</span>}
  </p>
}

/** The picture for a title, with a lettered tile when it has none or it will not load. */
export function MovieArt({ movie, shape = 'wide', eager = false }: { movie: Movie; shape?: 'wide' | 'tall'; eager?: boolean }) {
  const source = artFor(movie, shape)
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = source && source !== failed
  return <span className={`movie-art movie-art--${shape}`}>
    {showImage
      ? <img src={source} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" style={artStyle(movie)} onError={() => setFailed(source)} />
      : <span className="movie-art__fallback" aria-hidden="true">{Array.from(movie.title)[0]?.toLocaleUpperCase('en-GB')}</span>}
  </span>
}

export function MovieCard({ movie, children }: { movie: Movie; children?: ReactNode }) {
  const progress = progressFraction(movie)
  const action = actionFor(movie)
  const parts = metaParts(movie)
  return <article className="movie-card">
    <a className="movie-card__link" href={moviesPath('details', movie.id)} aria-label={`Details for ${movie.title}`}>
      <span className="movie-card__art">
        <MovieArt movie={movie} />
        <span className={`movie-card__badge movie-card__badge--${sourceOf(movie)}`}>{sourceOf(movie) === 'free' ? 'Free' : 'Your file'}</span>
        {progress > 0 && <span className="movie-card__progress" role="progressbar" aria-label={`Progress for ${movie.title}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></span>}
      </span>
      <span className="movie-card__title">{movie.title}</span>
      <span className="movie-card__meta">{parts.join(' · ') || sourceLabel(movie)}</span>
    </a>
    {action.plays && <a className="movie-card__play" href={moviesPath('watch', movie.id)} aria-label={`${action.label} ${movie.title}`}><span className="movie-card__play-icon"><PlayIcon className="yt-icon" /></span></a>}
    {children}
  </article>
}

/** A labelled row that scrolls sideways; arrows appear only when there is more to reveal. */
export function MovieRow({ title, items }: { title: string; items: Movie[] }) {
  const heading = useId()
  const scroller = useRef<HTMLDivElement>(null)
  // The arrows are shown by CSS from these data attributes, so scrolling never re-renders the row.
  const sync = useCallback(() => {
    const element = scroller.current
    const frame = element?.parentElement
    if (!element || !frame) return
    frame.dataset.start = String(element.scrollLeft > 4)
    frame.dataset.end = String(element.scrollLeft + element.clientWidth < element.scrollWidth - 4)
  }, [])
  useEffect(() => {
    sync()
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => observer.disconnect()
  }, [items, sync])
  if (!items.length) return null
  const slide = (direction: -1 | 1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  return <section className="movie-row" aria-labelledby={heading}>
    <h2 id={heading}>{title}</h2>
    <div className="movie-row__frame" data-start="false" data-end="false">
      <button type="button" className="movie-row__nav movie-row__nav--prev" aria-label={`Scroll ${title} back`} title="Previous" onClick={() => slide(-1)}><ChevronLeftIcon className="yt-icon" /></button>
      <div className="movie-row__items" ref={scroller} onScroll={sync}>{items.map(item => <MovieCard key={item.id} movie={item} />)}</div>
      <button type="button" className="movie-row__nav movie-row__nav--next" aria-label={`Scroll ${title} forward`} title="Next" onClick={() => slide(1)}><ChevronRightIcon className="yt-icon" /></button>
    </div>
  </section>
}

/** The featured title across the top of the home page. */
export function Hero({ movie }: { movie: Movie }) {
  const action = actionFor(movie)
  const art = artFor(movie, 'wide')
  return <section className="movies-hero" aria-label="Featured title">
    <div className="movies-hero__art">{art && <img src={art} alt="" fetchPriority="high" style={artStyle(movie)} />}</div>
    <div className="movies-hero__copy">
      <p className="movies-eyebrow">{sourceLabel(movie)}</p>
      <h1>{movie.title}</h1>
      <MetaLine movie={movie} />
      {movie.description && <p className="movies-hero__synopsis">{movie.description}</p>}
      {movie.genres.length > 0 && <p className="movies-hero__genres">{movie.genres.join(' · ')}</p>}
      <div className="movies-actions">
        <a className="movies-action movies-action--primary" href={moviesPath(action.view, movie.id)}>
          {action.plays && <PlayIcon className="yt-icon" />}{action.label}
        </a>
        <a className="movies-action movies-action--secondary" href={moviesPath('details', movie.id)}>More info</a>
      </div>
    </div>
  </section>
}

export function MovieCredits() {
  return <footer className="movies-credits"><h2>Credits and Availability</h2>
    <p>Local files stay on your computer. Profiles separate viewing history, not user accounts or parental permissions.</p>
    <p>Free streams connect directly to the creator's service and use your internet connection. Each curated film includes its licence and attribution; the full film credits are retained.</p>
    <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="/tmdb-logo.svg" alt="TMDB" width="70" /></a>
    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    <p>Availability data: JustWatch via TMDB. Catalogue listings, ratings, trailers and availability links do not grant film streaming rights.</p>
  </footer>
}
