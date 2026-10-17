import { useState, type ReactNode } from 'react'
import { StatusPanel } from '../components/StatusPanel'
import { moviesPath, type MoviesRoute } from './routes'
import { refreshMoviesStatus, useMoviesStatus } from './status'
import { type Profile, useMovieResource } from './api'
import { MovieCredits, MovieFailure, MovieLoading } from './ui'
import { MovieBrowse, MoviesHome } from './Catalogue'
import { MovieDetails } from './Details'
import { MoviesHeader } from './Header'
import { MovieLibrary, MovieProfiles, MovieSettings } from './Library'
import { MoviePlayer } from './MoviePlayer'
import './movies.css'

const PROFILE_KEY = 'musicbox-movies-profile'

function Gate({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return <div className="movies-gate"><StatusPanel title={title} body={body} />{children}</div>
}

/** Shown when nothing can be played: free online films are off and there is no media folder. */
function PlaybackSetup({ freeStreaming, mediaFolder }: { freeStreaming: boolean; mediaFolder: boolean }) {
  return <Gate title="Playback Isn't Set Up"
    body="Movies only lists titles it can play, and nothing can be played yet. In Settings, under Connections, switch on Free online films or choose a Movies media folder with films you are authorised to play.">
    <dl className="movies-setup">
      <div><dt>Free online films</dt><dd className={freeStreaming ? 'is-on' : undefined}>{freeStreaming ? 'On' : 'Off'}</dd></div>
      <div><dt>Movies media folder</dt><dd className={mediaFolder ? 'is-on' : undefined}>{mediaFolder ? 'Set' : 'Not set'}</dd></div>
    </dl>
    <div className="movies-actions"><a className="movies-action movies-action--primary" href={moviesPath('settings')}>Open Movies settings</a></div>
  </Gate>
}

export function MoviesWorkspace({ route, onMoviePlay }: { route: MoviesRoute; onMoviePlay: () => void }) {
  const { data, error, loading } = useMoviesStatus()
  const ready = !!data?.enabled && data.local_access !== false && !!data.playback_available
  const profiles = useMovieResource<Profile[]>(ready ? '/profiles' : null)
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem(PROFILE_KEY) || '' } catch { return '' } })
  const profileList = profiles.data ?? []
  const profile = profileList.find(entry => entry.id === selected) ?? profileList[0]
  const profileId = profile?.id ?? ''
  const selectProfile = (id: string) => { setSelected(id); try { localStorage.setItem(PROFILE_KEY, id) } catch { /* The current session still works without storage. */ } }

  function page(): ReactNode {
    if (route.view === 'settings') return <MovieSettings />
    if (route.view === 'not-found') return <Gate title="Page Not Available" body="This Movies address does not exist."><div className="movies-actions"><a className="movies-action movies-action--primary" href={moviesPath()}>Back to Movies</a></div></Gate>
    if (loading && !data) return <MovieLoading rows={2} />
    if (error) return <MovieFailure text="The Movies service could not be reached. Video and Music are still available." retry={() => void refreshMoviesStatus()} />
    if (!data?.enabled) return <Gate title="Enable Movies" body="Open Settings, then Connections, and switch on Movies experience. Free online films work without a metadata account."><div className="movies-actions"><a className="movies-action movies-action--primary" href={moviesPath('settings')}>Open settings</a></div></Gate>
    if (data.local_access === false) return <Gate title="Local Access Required" body="This release supports private use on the computer running MusicBox. Hosted multi-user playback is not available." />
    if (!data.playback_available) return <PlaybackSetup freeStreaming={!!data.free_streaming_enabled} mediaFolder={!!data.media_configured} />
    if (profiles.error) return <MovieFailure text={profiles.error} retry={profiles.refresh} />
    if (!profile) return <MovieLoading rows={2} />
    return <div key={`${route.view}:${route.id}:${route.query}:${profileId}`}>
      {route.view === 'home' ? <MoviesHome profile={profileId} />
        : route.view === 'details' ? <MovieDetails id={route.id} profile={profileId} />
        : route.view === 'watch' ? <MoviePlayer id={route.id} profile={profileId} onPlay={onMoviePlay} />
        : route.view === 'library' ? <MovieLibrary />
        : route.view === 'profiles' ? <MovieProfiles profiles={profileList} selected={profileId} onChange={profiles.refresh} />
        : <MovieBrowse route={route} profile={profileId} />}
    </div>
  }

  return <div className="movies-workspace" data-view={route.view}>
    <MoviesHeader route={route} ready={ready} profiles={profileList} selected={profileId} onSelect={selectProfile} />
    <main className="movies-main" id="movies-main">
      {page()}
      <MovieCredits />
    </main>
  </div>
}
