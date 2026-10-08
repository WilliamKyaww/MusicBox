import { useState } from 'react'
import { AppControls } from '../components/AppControls'
import { StatusPanel } from '../components/StatusPanel'
import { moviesPath, type MoviesRoute, type MoviesView } from './routes'
import { refreshMoviesStatus, useMoviesStatus } from './status'
import { type Profile, useMovieResource } from './api'
import { MovieCredits, MovieFailure, MovieLoading } from './ui'
import { MovieBrowse, MovieSearch, MoviesHome } from './Catalogue'
import { MovieDetails } from './Details'
import { MovieLibrary, MovieProfiles, MovieSettings } from './Library'
import { MoviePlayer } from './MoviePlayer'
import './movies.css'

const LINKS: [MoviesView, string][] = [['home','Home'],['free','Free to watch'],['movies','Movies'],['tv','TV shows'],['list','My list'],['history','History'],['library','My files']]

function EnabledMovies({ route, online, onMoviePlay }: { route: MoviesRoute; online: boolean; onMoviePlay: () => void }) {
  const profiles = useMovieResource<Profile[]>('/profiles')
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem('musicbox-movies-profile') || '' } catch { return '' } })
  const profile = profiles.data?.find(p => p.id === selected) ?? profiles.data?.[0]
  const profileId = profile?.id ?? ''
  const selectProfile = (id: string) => { setSelected(id); try { localStorage.setItem('musicbox-movies-profile', id) } catch { /* The current session still works without storage. */ } }
  return <>
    <div className="movies-secondary"><nav aria-label="Movies navigation">{LINKS.map(([view, label]) => <a key={view} href={moviesPath(view)} aria-current={route.view === view ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="movies-profile"><label>Profile<select aria-label="Movies profile" value={profileId} onChange={e => selectProfile(e.target.value)}>{profiles.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><a href={moviesPath('profiles')}>Manage profiles</a></div>
    </div>
    {profiles.error ? <MovieFailure text={profiles.error} retry={profiles.refresh} /> : !profile ? <MovieLoading /> : <div key={`${route.view}:${route.id}:${route.query}:${profileId}`}>
      {route.view === 'home' ? <MoviesHome profile={profileId} online={online} />
        : route.view === 'details' ? <MovieDetails id={route.id} profile={profileId} />
        : route.view === 'watch' ? <MoviePlayer id={route.id} profile={profileId} onPlay={onMoviePlay} />
        : route.view === 'library' ? <MovieLibrary />
        : route.view === 'profiles' ? <MovieProfiles profiles={profiles.data!} selected={profileId} onChange={profiles.refresh} />
        : <MovieBrowse route={route} profile={profileId} />}
    </div>}
  </>
}

export function MoviesWorkspace({ route, onMoviePlay }: { route: MoviesRoute; onMoviePlay: () => void }) {
  const { data, error, loading } = useMoviesStatus()
  return <div className="movies-workspace">
    <header className="movies-header"><div className="movies-identity"><a className="movies-brand" href={moviesPath()} aria-label="Movies home"><span aria-hidden="true">M</span> MusicBox</a><h1>{route.view === 'settings' ? 'Settings' : 'Cinema'}</h1></div><AppControls experience="movies" /></header>
    <main className="movies-main" id="movies-main">
      {route.view === 'settings' ? <MovieSettings /> : route.view === 'not-found' ? <><StatusPanel title="Page Not Available" body="This Movies address does not exist." /><a className="movies-action" href={moviesPath()}>Back to Movies</a></>
        : loading && !data ? <MovieLoading /> : error ? <MovieFailure text="The Movies service could not be reached. Video and Music are still available." retry={() => void refreshMoviesStatus()} />
        : !data?.enabled ? <><StatusPanel title="Enable Movies" body="Open Settings, then Connections, and switch on Movies experience. Local files work without a metadata account." /><a className="movies-action" href={moviesPath('settings')}>Open settings</a></>
        : data.local_access === false ? <StatusPanel title="Local Access Required" body="This release supports private use on the computer running MusicBox. Hosted multi-user playback is not available." />
        : <><MovieSearch key={route.query} query={route.query} /><EnabledMovies route={route} online={!!data.metadata_configured} onMoviePlay={onMoviePlay} /></>}
      <MovieCredits />
    </main>
  </div>
}
