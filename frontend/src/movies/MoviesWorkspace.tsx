import { AppControls } from '../components/AppControls'
import { StatusPanel } from '../components/StatusPanel'
import { SettingsPage } from '../settings/SettingsPage'
import { moviesPath, type MoviesRoute } from './routes'
import { refreshMoviesStatus, useMoviesStatus } from './status'
import './movies.css'

export function MoviesWorkspace({ route }: { route: MoviesRoute }) {
  const { data, error, loading } = useMoviesStatus()
  return (
    <div className="movies-workspace">
      <header className="movies-header">
        <div className="movies-identity">
          <a className="movies-brand" href={moviesPath()} aria-label="Movies home">
            <span aria-hidden="true">M</span> MusicBox
          </a>
          <h1>{route.view === 'settings' ? 'Settings' : 'Movies'}</h1>
        </div>
        <AppControls experience="movies" />
      </header>
      <main className="movies-main" id="movies-main">
        {route.view === 'settings' ? <SettingsPage experience="movies" />
          : route.view === 'not-found' ? <>
            <StatusPanel title="Page Not Available" body="This Movies page is not part of the current preview." />
            <a className="movies-action" href={moviesPath()}>Back to Movies</a>
          </> : <>
            <section className="movies-hero" aria-labelledby="movies-title">
              <p className="movies-eyebrow">A new space for cinema</p>
              <h2 id="movies-title">Movies</h2>
              <p className="movies-lead">Your next experience.<br />A separate story.</p>
              <p className="movies-intro">The foundation is here. A dedicated movie and TV catalogue, authorised playback and your watch history will follow in separate releases.</p>
              <span className="movies-badge">Foundation preview</span>
            </section>
            <section className="movies-setup" aria-label="Movies availability" aria-busy={loading}>
              {loading ? <StatusPanel title="Checking Availability" body="Checking the Movies configuration on this installation." />
                : error ? <>
                  <StatusPanel title="Movies Is Unavailable" tone="error" body="The Movies service could not be reached. Video and Music are still available from the switch above." />
                  <button className="movies-action" type="button" onClick={() => void refreshMoviesStatus()}>Try again</button>
                </> : !data?.enabled ? <>
                  <StatusPanel title="Enable the Preview" body="Open Settings, then Connections, and switch on Movies experience. No API key or subscription is required for this preview." />
                  <a className="movies-action" href={moviesPath('settings')}>Open settings</a>
                </> : <StatusPanel title="Ready for the Next Chapter" body="Movies is enabled. There are no playable titles yet: metadata and authorised video sources will be connected in later phases. Your saved songs, playlists and existing players are unchanged." />}
            </section>
            <section className="movies-roadmap" aria-label="Upcoming Movies features">
              <article><span>01 / Next</span><h2>Discover</h2><p>Movie and TV details, search and carefully organised collections.</p></article>
              <article><span>02 / Planned</span><h2>Watch</h2><p>A separate player for media you are authorised to access. No YouTube conversion or hidden streaming providers.</p></article>
              <article><span>03 / Planned</span><h2>Make It Yours</h2><p>A Movies-only watchlist, viewing progress and Continue Watching.</p></article>
            </section>
          </>}
      </main>
    </div>
  )
}
