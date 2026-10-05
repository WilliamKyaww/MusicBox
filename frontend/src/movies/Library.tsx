import { useState } from 'react'
import { SettingsPage } from '../settings/SettingsPage'
import { StatusPanel } from '../components/StatusPanel'
import { type Catalogue, type Movie, type Profile, errorText, movieApi, useMovieResource } from './api'
import { MovieCard, MovieFailure, MovieLoading } from './ui'
import { moviesPath } from './routes'

export function RegisterMovie({ target, onSaved, onCancel }: { target?: Movie; onSaved: (movie: Movie) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <section className="movies-register"><h2>{target ? `Add a File for ${target.title}` : 'Add Authorised Media'}</h2>
    <p>Set your Movies media folder in <a href={moviesPath('settings')}>Settings</a>, then enter a path relative to that folder. Files are linked, not copied or deleted. Use MP4 (H.264/AAC) or WebM. Matching .vtt subtitle files are detected beside the video.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('')
      const data = new FormData(e.currentTarget)
      try {
        const result = await movieApi.post<Movie>('/library', { title: data.get('title') || target?.title || '', description: data.get('description') || '',
          relative_path: data.get('path'), title_id: target?.id ?? null, rights_confirmed: data.get('rights') === 'on',
          show_title: data.get('show') || '', season: Number(data.get('season') || 1), episode: Number(data.get('episode') || 1),
          intro_start: Number(data.get('intro_start') || 0), intro_end: Number(data.get('intro_end') || 0) })
        onSaved(result)
      } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
    }}>
      {!target && <><label>Title<input name="title" required maxLength={200} /></label><label>Description<textarea name="description" maxLength={4000} /></label></>}
      <label>Relative file path<input name="path" required placeholder="Films/My film.mp4" maxLength={1500} /></label>
      {!target && <details><summary>TV episode (optional)</summary><label>Show title<input name="show" maxLength={200} /></label><div className="movies-form-row"><label>Season<input type="number" name="season" min={0} max={1000} defaultValue={1} /></label><label>Episode<input type="number" name="episode" min={1} max={10000} defaultValue={1} /></label></div></details>}
      <label className="movies-check"><input type="checkbox" name="rights" required />I am authorised to play this media and make it available on this installation.</label>
      <details><summary>Intro markers (optional)</summary><p>Use seconds from this file. A Skip intro button appears only during this interval; nothing is guessed automatically.</p><div className="movies-form-row"><label>Intro start<input name="intro_start" type="number" min={0} max={86400} step="0.1" defaultValue={0} /></label><label>Intro end<input name="intro_end" type="number" min={0} max={86400} step="0.1" defaultValue={0} /></label></div></details>
      {error && <MovieFailure text={error} />}<div className="movies-actions"><button className="movies-action" disabled={busy}>{busy ? 'Verifying file...' : 'Register file'}</button>{onCancel && <button type="button" className="movies-action movies-action--secondary" onClick={onCancel}>Cancel</button>}</div>
    </form>
  </section>
}

export function MovieLibrary() {
  const result = useMovieResource<Catalogue>('/catalogue?source=local')
  return <><RegisterMovie onSaved={movie => { window.location.hash = moviesPath('details', movie.id) }} /><h2>Your Collection</h2>
    {result.loading && <MovieLoading />}{result.error && <MovieFailure text={result.error} retry={result.refresh} />}
    <div className="movie-grid">{result.data?.items.map(item => <MovieCard key={item.id} movie={item} />)}</div>
    {result.data?.items.length === 0 && <StatusPanel title="Your Cinema Starts Here" body="Register a film or episode above. No media is scanned, uploaded or supplied automatically." />}</>
}

export function MovieProfiles({ profiles, selected, onChange }: { profiles: Profile[]; selected: string; onChange: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="movies-register"><h2>Who's Watching?</h2><p>Each local profile has its own list and viewing progress. Profiles are not password-protected accounts or parental controls.</p>
    {profiles.map(p => <div className="movies-profile-row" key={p.id}><strong>{p.name}{p.id === selected ? ' / active' : ''}</strong>{!p.local_default && <button onClick={async () => {
      if (!window.confirm(`Delete ${p.name} and their Movies history and list?`)) return
      try { await movieApi.delete(`/profiles/${p.id}`); onChange() } catch (e) { setError(errorText(e)) }
    }}>Delete profile</button>}</div>)}
    <form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(''); try { await movieApi.post('/profiles', { name: new FormData(form).get('name') }); form.reset(); onChange() } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }}>
      <label>New profile name<input name="name" required maxLength={40} /></label><button className="movies-action" disabled={busy || profiles.length >= 8}>Create profile</button>
    </form>{error && <MovieFailure text={error} />}
  </section>
}

export function MovieSettings() { return <><p className="movies-notice">Movies settings are under Connections below. TMDB supplies metadata only; set a media folder and register authorised files to play films. The other controls remain app-wide Video/Music settings.</p><SettingsPage experience="movies" /></> }
