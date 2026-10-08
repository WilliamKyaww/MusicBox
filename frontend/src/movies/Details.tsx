import { useState } from 'react'
import { type Movie, type Progress, errorText, idPath, movieApi, useMovieResource } from './api'
import { MovieCard, MovieFailure, MovieLoading } from './ui'
import { moviesPath } from './routes'
import { Recommendations } from './Catalogue'
import { RegisterMovie } from './Library'

function Episodes({ show, season, profile }: { show: Movie; season: number; profile: string }) {
  const result = useMovieResource<Movie[]>(`/titles/${idPath(show.id)}/seasons/${season}`)
  const history = useMovieResource<Movie[]>(`/profiles/${profile}/history`)
  return <>{result.loading && <MovieLoading />}{result.error && <MovieFailure text={result.error} retry={result.refresh} />}
    <div className="movies-episodes">{result.data?.map(item => <article key={item.id}><MovieCard movie={{ ...item, progress: history.data?.find(h => h.id === item.id)?.progress }} /><div><h3>Episode {item.episode}: {item.title}</h3><p>{item.description || 'No episode description available.'}</p><a className="movies-action" href={moviesPath(item.playable ? 'watch' : 'details', item.id)}>{item.playable ? 'Play episode' : 'Details and files'}</a></div></article>)}</div>
    {result.data?.length === 0 && <p>No episodes have been added to this season.</p>}
  </>
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
  return <>
    <a className="movies-back" href={moviesPath('home')}>Back to browse</a>
    <section className="movies-detail" style={movie.backdrop ? { backgroundImage: `linear-gradient(90deg, #100e12 10%, #100e1288), url("${movie.backdrop}")` } : undefined}>
      {movie.poster && <img className="movies-detail__poster" src={movie.poster} alt={`${movie.title} poster`} />}
      <div><p className="movies-eyebrow">{movie.kind === 'show' ? 'Series' : movie.kind === 'episode' ? `Season ${movie.season} / Episode ${movie.episode}` : 'Film'}</p><h2>{movie.title}</h2>
        <p className="movies-meta">{movie.date.slice(0, 4)} {movie.runtime > 0 && ` / ${movie.runtime} min`} {movie.certification && ` / ${movie.certification}`} {movie.rating > 0 && ` / ${movie.rating.toFixed(1)} on TMDB`}</p>
        <p>{movie.description || 'No description available.'}</p><p>{movie.genres.join(' / ')}</p>
        <div className="movies-actions">{movie.playable && <a className="movies-action" href={moviesPath('watch', movie.id)}>{state.data?.progress && !state.data.progress.completed && state.data.progress.position > 0 ? 'Resume' : 'Play'}</a>}
          <button className="movies-action movies-action--secondary" disabled={!state.data || busy} onClick={async () => { setBusy(true); setError(''); try { await movieApi.put(`/profiles/${profile}/watchlist/${idPath(id)}`, { saved: !state.data?.saved }); state.refresh() } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }}>{state.data?.saved ? 'Remove from my list' : 'Add to my list'}</button>
          {movie.trailer_url && <a className="movies-action movies-action--secondary" href={movie.trailer_url} target="_blank" rel="noreferrer">Watch trailer on YouTube</a>}
        </div>{!movie.playable && movie.kind !== 'show' && <p className="movies-notice">Details only. Register an authorised file below to watch here.</p>}
      </div>
    </section>
    {(error || state.error) && <MovieFailure text={error || state.error!} retry={state.refresh} />}
    <div className="movies-facts"><p><strong>Cast</strong><br />{movie.cast.join(', ') || 'Not available'}</p><p><strong>Director / Creator</strong><br />{movie.crew.join(', ') || 'Not available'}</p><p><strong>Where to Watch</strong><br />{movie.available_providers.join(', ') || 'No regional availability data'}{movie.provider_url && <><br /><a href={`${movie.provider_url}/watch`} target="_blank" rel="noreferrer">Check legal availability on TMDB</a></>}</p></div>
    {movie.online_source && <section className="movies-notice" aria-label="Film licence"><h2>Source and Licence</h2><p>{movie.online_source.attribution}</p><p><a href={movie.online_source.licence_url} target="_blank" rel="noreferrer">{movie.online_source.licence} / licence conditions</a> / <a href={movie.online_source.page_url} target="_blank" rel="noreferrer">Creator's original page</a></p><p>The complete film and credits are streamed from {movie.online_source.provider}. No paid key is needed; provider availability and your internet connection still apply.</p></section>}
    {movie.kind === 'show' ? <section><h2>Episodes</h2><label>Season<select value={season ?? movie.seasons[0]?.number ?? 1} onChange={e => setSeason(Number(e.target.value))}>{movie.seasons.map(s => <option key={s.number} value={s.number}>{s.name}</option>)}</select></label>{movie.seasons.length > 0 ? <Episodes key={`${id}:${season}`} show={movie} season={season ?? movie.seasons[0].number} profile={profile} /> : <p>No seasons are available.</p>}</section>
      : <section className="movies-files"><h2>Playback Sources</h2>{movie.assets.map(asset => <div className="movies-profile-row" key={asset.id}><span>{asset.label} / {asset.source_type === 'remote' ? 'Creator-hosted online video' : `${asset.video_codec} / ${asset.audio_codec}`} {asset.available ? '' : '/ missing file'}</span>{asset.source_type !== 'remote' && <button onClick={async () => { if (!window.confirm('Unregister this file? The original file will not be deleted.')) return; try { await movieApi.delete(`/assets/${asset.id}`); result.refresh() } catch (e) { setError(errorText(e)) } }}>Unregister</button>}</div>)}
        {!register && <button className="movies-action movies-action--secondary" onClick={() => setRegister(true)}>Register a local file</button>}
        {register && <RegisterMovie target={movie} onCancel={() => setRegister(false)} onSaved={() => { setRegister(false); result.refresh() }} />}
      </section>}
    <Recommendations id={id} />
  </>
}
