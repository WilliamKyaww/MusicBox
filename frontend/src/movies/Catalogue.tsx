import { useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { moviesPath, type MoviesRoute } from './routes'
import { type Movie, errorText, movieApi, useMovieResource } from './api'
import { genreRows, inProgress, isWatchable, matchesQuery, pickFeatured, sourceOf } from './format'
import { refreshMovieLibrary, useMovieLibrary } from './libraryStore'
import { useMoviesStatus } from './status'
import { Hero, MovieCard, MovieEmpty, MovieFailure, MovieLoading, MovieRow } from './ui'

const PAGE_SIZE = 60

/** Shown when playback is set up but there is nothing to play yet. */
function EmptyLibrary() {
  const { data } = useMoviesStatus()
  const filesOnly = data?.free_streaming_enabled === false
  return <MovieEmpty title="Nothing to Watch Yet" body={filesOnly
    ? 'Free online films are switched off, and no file has been added. Add a film or episode you are authorised to play, or turn free online films back on in Settings.'
    : 'No titles can be played right now. Add a film or episode you are authorised to play.'}>
    <div className="movies-actions">
      <a className="movies-action movies-action--primary" href={moviesPath('library')}>Add a file</a>
      <a className="movies-action movies-action--secondary" href={moviesPath('settings')}>Open Movies settings</a>
    </div>
  </MovieEmpty>
}

export function Recommendations({ id, heading = 'More Like This' }: { id: string; heading?: string }) {
  const result = useMovieResource<Movie[]>(`/titles/${encodeURIComponent(id)}/recommendations?playable=true`)
  return result.data ? <MovieRow title={heading} items={result.data.filter(isWatchable)} /> : null
}

export function MoviesHome({ profile }: { profile: string }) {
  const library = useMovieLibrary()
  const history = useMovieResource<Movie[]>(`/profiles/${profile}/history`)
  const saved = useMovieResource<Movie[]>(`/profiles/${profile}/watchlist`)
  const items = library.items
  if (!items) return library.error ? <MovieFailure text={library.error} retry={() => void refreshMovieLibrary()} /> : <MovieLoading rows={3} />
  if (!items.length) return <EmptyLibrary />
  const featured = pickFeatured(items)
  const watched = history.data?.filter(isWatchable) ?? []
  const seed = watched[0]
  return <>
    {featured && <Hero movie={featured} />}
    <div className="movies-rows">
      {library.error && <MovieFailure text={library.error} retry={() => void refreshMovieLibrary()} />}
      <MovieRow title="Continue Watching" items={watched.filter(inProgress)} />
      <MovieRow title="My List" items={saved.data?.filter(isWatchable) ?? []} />
      <MovieRow title="Free to Watch Online" items={items.filter(item => sourceOf(item) === 'free')} />
      <MovieRow title="Your Collection" items={items.filter(item => sourceOf(item) === 'collection')} />
      {genreRows(items).map(row => <MovieRow key={row.genre} title={row.genre} items={row.items} />)}
      {seed && <Recommendations id={seed.id} heading={`Because You Watched ${seed.title}`} />}
    </div>
  </>
}

const HEADINGS: Partial<Record<MoviesRoute['view'], string>> = {
  movies: 'Movies', tv: 'TV Shows', free: 'Free to Watch', list: 'My List', history: 'Watch History', search: 'Search Results',
}

export function MovieBrowse({ route, profile }: { route: MoviesRoute; profile: string }) {
  const view = route.view
  const saved = view === 'list' || view === 'history'
  const library = useMovieLibrary()
  const savedResult = useMovieResource<Movie[]>(saved ? `/profiles/${profile}/${view === 'list' ? 'watchlist' : 'history'}` : null)
  const [kind, setKind] = useState<'all' | 'movie' | 'show'>('all')
  const [source, setSource] = useState<'all' | 'free' | 'collection'>('all')
  const [genre, setGenre] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [error, setError] = useState('')

  const pool = saved ? savedResult.data : library.items
  const playable = useMemo(() => (pool ?? []).filter(isWatchable), [pool])
  const scoped = useMemo(() => playable.filter(item =>
    (view !== 'movies' || item.kind === 'movie') && (view !== 'tv' || item.kind === 'show') && (view !== 'free' || sourceOf(item) === 'free')
    && (view !== 'search' || matchesQuery(item, route.query))), [playable, view, route.query])
  const genres = useMemo(() => [...new Set(scoped.flatMap(item => item.genres))].sort((a, b) => a.localeCompare(b, 'en-GB')), [scoped])
  const items = useMemo(() => scoped.filter(item =>
    (kind === 'all' || item.kind === kind || (kind === 'show' && item.kind === 'episode')) && (source === 'all' || sourceOf(item) === source) && (!genre || item.genres.includes(genre))), [scoped, kind, source, genre])
  const hidden = saved && pool ? pool.length - playable.length : 0
  const filtered = kind !== 'all' || source !== 'all' || genre !== ''
  const loading = saved ? savedResult.loading : !library.items && library.loading
  const failure = saved ? savedResult.error : !library.items ? library.error : ''
  const retry = saved ? savedResult.refresh : () => void refreshMovieLibrary()

  async function remove(item?: Movie) {
    if (!item && !window.confirm('Clear viewing history for this Movies profile?')) return
    try {
      await movieApi.delete(`/profiles/${profile}/history${item ? `?title_id=${encodeURIComponent(item.id)}` : ''}`)
      savedResult.refresh()
    } catch (problem) { setError(errorText(problem)) }
  }

  const title = HEADINGS[view] ?? 'Movies'
  return <div className="movies-page">
    <PageHeader title={title}
      subtitle={view === 'search' ? `Results for “${route.query}”` : items.length ? `${items.length} ${items.length === 1 ? 'title' : 'titles'}${filtered ? ' match' : ''}` : undefined}
      actions={view === 'history' && items.length > 0 ? <button type="button" className="movies-action movies-action--secondary" onClick={() => void remove()}>Clear history</button> : undefined}>
      {!saved && scoped.length > 0 && <>
        {view !== 'movies' && view !== 'tv' && <label className="movies-filter">Type
          <select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setLimit(PAGE_SIZE) }}>
            <option value="all">Movies and TV</option><option value="movie">Movies</option><option value="show">TV shows</option></select></label>}
        {view !== 'free' && <label className="movies-filter">Source
          <select value={source} onChange={event => { setSource(event.target.value as typeof source); setLimit(PAGE_SIZE) }}>
            <option value="all">All sources</option><option value="free">Free to watch online</option><option value="collection">My files</option></select></label>}
        {genres.length > 0 && <label className="movies-filter">Genre
          <select value={genre} onChange={event => { setGenre(event.target.value); setLimit(PAGE_SIZE) }}>
            <option value="">All genres</option>{genres.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
      </>}
    </PageHeader>
    {view === 'free' && <p className="movies-notice">Creator-hosted films, with licence and attribution on each title. This small collection is not a free copy of a streaming service's catalogue. Availability depends on the creator's service.</p>}
    {hidden > 0 && <p className="movies-notice">{hidden} saved {hidden === 1 ? 'title is' : 'titles are'} not available to play here, so {hidden === 1 ? 'it is' : 'they are'} not shown.</p>}
    {error && <MovieFailure text={error} />}
    {failure && <MovieFailure text={failure} retry={retry} />}
    {loading && !pool && <MovieLoading rows={2} />}
    {pool && !items.length && !failure && <MovieEmpty
      title={saved && !filtered ? 'Nothing Here Yet' : 'No Matches'}
      body={view === 'search' ? `No playable titles match “${route.query}”. Only titles that can be played here are searched.`
        : filtered ? 'No titles match these filters. Try clearing one.'
        : view === 'list' ? 'Titles you add to My list appear here for this profile.'
        : view === 'history' ? 'Titles you watch appear here for this profile.'
        : 'No playable titles in this section yet.'} />}
    <div className="movie-grid">{items.slice(0, limit).map(item => <MovieCard key={item.id} movie={item}>
      {view === 'history' && <button type="button" className="movies-link" onClick={() => void remove(item)}>Remove from history</button>}
    </MovieCard>)}</div>
    {items.length > limit && <div className="movies-pagination"><button type="button" className="movies-action movies-action--secondary" onClick={() => setLimit(value => value + PAGE_SIZE)}>Show more</button></div>}
  </div>
}
