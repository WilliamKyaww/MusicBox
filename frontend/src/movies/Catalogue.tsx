import { useEffect, useState } from 'react'
import { StatusPanel } from '../components/StatusPanel'
import { moviesPath, type MoviesRoute } from './routes'
import { type Catalogue, type Movie, useMovieResource, movieApi, errorText } from './api'
import { MovieCard, MovieFailure, MovieLoading, MovieRow } from './ui'

function BrowseRow({ title, query }: { title: string; query: string }) {
  const result = useMovieResource<Catalogue>('/catalogue?' + query)
  if (result.error) return <MovieFailure text={result.error} retry={result.refresh} />
  return result.data ? <MovieRow title={title} items={result.data.items} /> : <MovieLoading />
}

export function MoviesHome({ profile, online }: { profile: string; online: boolean }) {
  const featured = useMovieResource<Catalogue>('/catalogue?source=free')
  const collection = useMovieResource<Catalogue>('/catalogue?source=local')
  const history = useMovieResource<Movie[]>(`/profiles/${profile}/history`)
  const hero = featured.data?.items[0] ?? collection.data?.items[0]
  return <>
    <section className="movies-feature" style={hero?.backdrop ? { backgroundImage: `linear-gradient(90deg, #100e12 0%, #100e1240 100%), url("${hero.backdrop}")` } : undefined}>
      <div className="movies-feature__copy"><p className="movies-eyebrow">Your cinema. Your collection.</p>
        <h2>{hero?.title || 'Make Tonight a Movie Night'}</h2><p>{hero?.description || 'Bring your authorised movie and TV collection together, then pick up exactly where you left off.'}</p>
        <div className="movies-actions">{hero ? <><a className="movies-action" href={moviesPath(hero.playable ? 'watch' : 'details', hero.id)}>{hero.playable ? 'Play now' : 'Explore title'}</a><a className="movies-action movies-action--secondary" href={moviesPath('list')}>My list</a></> : <a className="movies-action" href={moviesPath('library')}>Add your first title</a>}</div>
      </div>
    </section>
    <p className="movies-notice">Free to watch streams a curated creator-authorised collection with no paid key or local download. It does not contain every commercial film or series. {online ? 'TMDB discovery below includes titles that may only be available elsewhere.' : <>Add an optional TMDB read access token in <a href={moviesPath('settings')}>Settings</a> for wider discovery, not streaming rights.</>}</p>
    {featured.error && <MovieFailure text={featured.error} retry={featured.refresh} />}
    {history.data && <MovieRow title="Continue Watching" items={history.data.filter(i => !i.progress?.completed)} />}
    <MovieRow title="Free to Watch Online" items={featured.data?.items ?? []} />
    <MovieRow title="Your Collection" items={collection.data?.items ?? []} />
    {collection.error && <MovieFailure text={collection.error} retry={collection.refresh} />}
    {online && <><BrowseRow title="Trending This Week" query="category=trending" /><BrowseRow title="Popular Movies" query="kind=movie&category=popular" /><BrowseRow title="Popular TV" query="kind=show&category=popular" /><BrowseRow title="New Releases" query="kind=movie&category=new" /><BrowseRow title="Critically Acclaimed" query="kind=movie&category=top_rated" /></>}
    {history.data?.[0] && <Recommendations id={history.data[0].id} heading={`Because You Watched ${history.data[0].title}`} />}
  </>
}

export function Recommendations({ id, heading = 'More Like This' }: { id: string; heading?: string }) {
  const result = useMovieResource<Movie[]>(`/titles/${encodeURIComponent(id)}/recommendations`)
  return result.data ? <MovieRow title={heading} items={result.data} /> : null
}

export function MovieBrowse({ route, profile }: { route: MoviesRoute; profile: string }) {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState(route.view === 'tv' ? 'show' : route.view === 'movies' ? 'movie' : 'all')
  const [genre, setGenre] = useState('')
  const [error, setError] = useState('')
  const [source, setSource] = useState(route.view === 'free' ? 'free' : 'online')
  const saved = route.view === 'list' || route.view === 'history'
  const genres = useMovieResource<{ id: number; name: string }[]>(saved ? null : `/genres?kind=${kind === 'show' ? 'show' : 'movie'}&source=${source}`)
  const path = saved ? `/profiles/${profile}/${route.view === 'list' ? 'watchlist' : 'history'}`
    : '/catalogue?' + new URLSearchParams({ q: route.query, kind, source, page: String(page), ...(genre ? { genre } : {}) })
  const result = useMovieResource<Catalogue | Movie[]>(path)
  const items = Array.isArray(result.data) ? result.data : result.data?.items ?? []
  const totalPages = Array.isArray(result.data) ? 1 : result.data?.total_pages ?? 1
  const heading = route.view === 'free' ? 'Free to Watch' : route.view === 'list' ? 'My List' : route.view === 'history' ? 'Watch History' : route.view === 'tv' ? 'TV Shows' : route.view === 'movies' ? 'Movies' : 'Search Results'
  return <>
    <div className="movies-toolbar"><h2>{heading}</h2>{!saved && <>
      <label>Source<select value={source} onChange={e => { setSource(e.target.value); setGenre(''); setPage(1) }}><option value="online">Catalogue and collection</option><option value="free">Free to watch online</option><option value="local">My files</option></select></label>
      <label>Type<select value={kind} onChange={e => { setKind(e.target.value); setGenre(''); setPage(1) }}><option value="all">Movies and TV</option><option value="movie">Movies</option><option value="show">TV shows</option></select></label>
      <label>Genre<select value={genre} onChange={e => { setGenre(e.target.value); setPage(1) }}><option value="">All genres</option>{genres.data?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    </>}{route.view === 'history' && items.length > 0 && <button className="movies-action" onClick={async () => { if (!window.confirm('Clear viewing history for this Movies profile?')) return; try { await movieApi.delete(`/profiles/${profile}/history`); result.refresh() } catch (e) { setError(errorText(e)) } }}>Clear history</button>}</div>
    {route.query && <p>Results for &quot;{route.query}&quot;</p>}
    {source === 'free' && !saved && <p className="movies-notice">Creator-hosted films, with licence and attribution on each title. This small collection is not a free copy of Netflix's catalogue. Availability depends on the creator's service.</p>}
    {error && <MovieFailure text={error} />}{result.error && <MovieFailure text={result.error} retry={result.refresh} />}{result.loading && <MovieLoading />}
    {result.data && !items.length && <StatusPanel title="Nothing Here Yet" body={saved ? 'Titles you save or watch will appear here for this profile.' : 'No titles found. Try another search or add a local movie.'} />}
    <div className="movie-grid">{items.map(item => <div key={item.id}><MovieCard movie={item} />{route.view === 'history' && <button className="movies-link" onClick={async () => { try { await movieApi.delete(`/profiles/${profile}/history?title_id=${encodeURIComponent(item.id)}`); result.refresh() } catch (e) { setError(errorText(e)) } }}>Remove from history</button>}</div>)}</div>
    {!saved && totalPages > 1 && <div className="movies-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
  </>
}

export function MovieSearch({ query }: { query: string }) {
  const [text, setText] = useState(query)
  const [suggestions, setSuggestions] = useState<Movie[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (text.trim().length < 2 || !open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      movieApi.get<Catalogue>('/catalogue?q=' + encodeURIComponent(text.trim()), controller.signal).then(data => setSuggestions(data.items.slice(0, 5))).catch(() => {})
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [text, open])
  return <form className="movies-search" role="search" onSubmit={e => { e.preventDefault(); setOpen(false); window.location.hash = moviesPath('search', '', text.trim()) }}>
    <input type="search" aria-label="Search movies and TV" placeholder="Search movies and TV" value={text} maxLength={200} onFocus={() => setOpen(true)} onChange={e => { setText(e.target.value); setSuggestions([]); setOpen(true) }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }} />
    <button type="submit">Search</button>{open && text.trim().length >= 2 && suggestions.length > 0 && <div className="movies-suggestions">{suggestions.map(i => <a key={i.id} href={moviesPath('details', i.id)} onClick={() => setOpen(false)}>{i.title}<small>{i.kind === 'show' ? 'TV' : 'Movie'} / {i.date.slice(0, 4)}</small></a>)}</div>}
  </form>
}
