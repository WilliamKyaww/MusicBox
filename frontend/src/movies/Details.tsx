import { useState, type ReactNode } from 'react'
import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon, PlayIcon, PlusIcon } from '../components/Icons'
import { type Movie, type Progress, errorText, idPath, movieApi, useMovieResource } from './api'
import { actionFor, artFor, artStyle, formatDate, formatRuntime, inProgress, isWatchable, progressFraction, ratingLabel, sourceLabel, typeLabel } from './format'
import { invalidateMovieLibrary } from './libraryStore'
import { moviesPath } from './routes'
import { Recommendations } from './Catalogue'
import { RegisterMovie } from './Library'
import { MetaLine, MovieArt, MovieFailure, MovieLoading } from './ui'

function Episodes({ show, season, profile }: { show: Movie; season: number; profile: string }) {
  const result = useMovieResource<Movie[]>(`/titles/${idPath(show.id)}/seasons/${season}`)
  const history = useMovieResource<Movie[]>(`/profiles/${profile}/history`)
  const episodes = result.data?.filter(isWatchable).map(item => ({ ...item, progress: history.data?.find(entry => entry.id === item.id)?.progress }))
  return <>
    {result.loading && <MovieLoading />}
    {result.error && <MovieFailure text={result.error} retry={result.refresh} />}
    <ol className="movies-episodes">{episodes?.map(item => {
      const progress = progressFraction(item)
      const facts = [formatRuntime(item.runtime), formatDate(item.date)].filter(Boolean).join(' · ')
      return <li key={item.id}>
        <a className="movies-episodes__art" href={moviesPath('watch', item.id)} aria-label={`${inProgress(item) ? 'Resume' : 'Play'} episode ${item.episode}: ${item.title}`}>
          <MovieArt movie={item} />
          <span className="movies-episodes__play"><PlayIcon className="yt-icon" /></span>
          {progress > 0 && <span className="movie-card__progress" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></span>}
        </a>
        <div>
          <h3><span>{item.episode}</span>{item.title}</h3>
          {facts && <p className="movies-episodes__facts">{facts}</p>}
          <p>{item.description || 'No episode description available.'}</p>
        </div>
      </li>
    })}</ol>
    {episodes?.length === 0 && <p className="movies-muted">No episodes in this season can be played here yet.</p>}
  </>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}

export function MovieDetails({ id, profile }: { id: string; profile: string }) {
  const result = useMovieResource<Movie>(`/titles/${idPath(id)}`)
  const state = useMovieResource<{ saved: boolean; progress: Progress | null }>(`/profiles/${profile}/titles/${idPath(id)}`)
  const [season, setSeason] = useState<number | null>(null)
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (result.error) return <MovieFailure text={result.error} retry={result.refresh} />
  if (!result.data) return <MovieLoading />
  const movie = result.data
  const action = actionFor(movie)
  const resuming = !!state.data?.progress && !state.data.progress.completed && state.data.progress.position > 0
  const art = artFor(movie, 'wide')
  const credit = movie.kind === 'show' ? 'Created by' : movie.crew.length === 1 ? 'Director' : 'Directors'
  const rating = ratingLabel(movie.rating)
  const providers = movie.available_providers.join(', ')
  const released = formatDate(movie.date)
  const runtime = movie.kind === 'show' ? '' : formatRuntime(movie.runtime)
  const eyebrow = movie.kind === 'episode' ? `Season ${movie.season} · Episode ${movie.episode}` : typeLabel(movie)
  return <div className="movies-detail-page">
    <section className="movies-detail">
      <div className="movies-detail__art">{art && <img src={art} alt="" fetchPriority="high" style={artStyle(movie)} />}</div>
      <a className="movies-back" href={moviesPath('home')}><ArrowLeftIcon className="yt-icon" />Back to browse</a>
      <div className="movies-detail__copy">
        <p className="movies-eyebrow">{sourceLabel(movie)} · {eyebrow}</p>
        <h1>{movie.title}</h1>
        <MetaLine movie={movie} />
        <p className="movies-detail__synopsis">{movie.description || 'No description available.'}</p>
        <div className="movies-actions">
          {movie.playable && movie.kind !== 'show' && <a className="movies-action movies-action--primary" href={moviesPath('watch', movie.id)}><PlayIcon className="yt-icon" />{resuming ? 'Resume' : action.label}</a>}
          {movie.kind === 'show' && <a className="movies-action movies-action--primary" href="#movies-episodes" onClick={event => { event.preventDefault(); document.getElementById('movies-episodes')?.scrollIntoView({ behavior: 'smooth' }) }}>Episodes</a>}
          <button type="button" className="movies-action movies-action--secondary" disabled={!state.data || busy}
            onClick={async () => { setBusy(true); setError(''); try { await movieApi.put(`/profiles/${profile}/watchlist/${idPath(id)}`, { saved: !state.data?.saved }); state.refresh() } catch (problem) { setError(errorText(problem)) } finally { setBusy(false) } }}>
            {state.data?.saved ? <CheckIcon className="yt-icon" /> : <PlusIcon className="yt-icon" />}{state.data?.saved ? 'Remove from my list' : 'Add to my list'}
          </button>
          {movie.trailer_url && <a className="movies-action movies-action--secondary" href={movie.trailer_url} target="_blank" rel="noreferrer">Watch trailer on YouTube<ExternalLinkIcon className="yt-icon" /></a>}
        </div>
        {!isWatchable(movie) && <p className="movies-callout" role="status">Details only. Register an authorised file below to watch here.</p>}
      </div>
    </section>
    {(error || state.error) && <MovieFailure text={error || state.error!} retry={state.refresh} />}

    <div className="movies-detail__body">
      <dl className="movies-facts">
        {movie.cast.length > 0 && <Fact label="Cast">{movie.cast.join(', ')}</Fact>}
        {movie.crew.length > 0 && <Fact label={credit}>{movie.crew.join(', ')}</Fact>}
        {movie.genres.length > 0 && <Fact label="Genres">{movie.genres.join(', ')}</Fact>}
        {released && <Fact label="Released">{released}</Fact>}
        {runtime && <Fact label="Runtime">{runtime}</Fact>}
        {movie.certification && <Fact label="Maturity rating">{movie.certification}</Fact>}
        {rating && <Fact label="TMDB rating">{rating} / 10</Fact>}
        {providers && <Fact label="Available from">{providers}{movie.provider_url && <> · <a href={`${movie.provider_url}/watch`} target="_blank" rel="noreferrer">Check legal availability on TMDB</a></>}</Fact>}
      </dl>

      {movie.online_source && <section className="movies-licence" aria-label="Film licence"><h2>Source and Licence</h2>
        <p>{movie.online_source.attribution}</p>
        <p><a href={movie.online_source.licence_url} target="_blank" rel="noreferrer">{movie.online_source.licence} / licence conditions</a> · <a href={movie.online_source.page_url} target="_blank" rel="noreferrer">Creator's original page</a></p>
        <p>The complete film and credits are streamed from {movie.online_source.provider}. No paid key is needed; provider availability and your internet connection still apply.</p>
      </section>}

      {movie.kind === 'show'
        ? <section id="movies-episodes"><h2>Episodes</h2>
          {movie.seasons.length > 0
            ? <><label className="movies-filter">Season<select value={season ?? movie.seasons[0].number} onChange={event => setSeason(Number(event.target.value))}>{movie.seasons.map(item => <option key={item.number} value={item.number}>{item.name}</option>)}</select></label>
              <Episodes key={`${id}:${season}`} show={movie} season={season ?? movie.seasons[0].number} profile={profile} /></>
            : <p className="movies-muted">No seasons are available.</p>}
        </section>
        : <section className="movies-files"><h2>Playback Sources</h2>
          {movie.assets.length === 0 && <p className="movies-muted">No playable file is linked to this title.</p>}
          {movie.assets.map(asset => <div className="movies-row-item" key={asset.id}>
            <span>{asset.label} · {asset.source_type === 'remote' ? 'Creator-hosted online video' : `${asset.video_codec} / ${asset.audio_codec}`}{asset.available ? '' : ' · missing file'}</span>
            {asset.source_type !== 'remote' && <button type="button" className="movies-action movies-action--secondary" onClick={async () => {
              if (!window.confirm('Unregister this file? The original file will not be deleted.')) return
              try { await movieApi.delete(`/assets/${asset.id}`); invalidateMovieLibrary(); result.refresh() } catch (problem) { setError(errorText(problem)) }
            }}>Unregister</button>}
          </div>)}
          {!register && <button type="button" className="movies-action movies-action--secondary" onClick={() => setRegister(true)}>Register a local file</button>}
          {register && <RegisterMovie target={movie} onCancel={() => setRegister(false)} onSaved={() => { setRegister(false); result.refresh() }} />}
        </section>}
    </div>
    <div className="movies-rows"><Recommendations id={id} /></div>
  </div>
}
