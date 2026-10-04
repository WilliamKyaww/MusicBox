import { useState, type ReactNode } from 'react'
import { previewSpotifyPlaylist } from '../../api/spotify'
import { musicPath } from '../../experience'
import { useLibrary } from '../../library'
import { navigate } from '../../router'
import type { SpotifyPlaylistPreview } from '../../types'
import { playlistVideo, sortedItems } from '../helpers'
import { useStickyHeader } from '../hooks'
import { useMusic } from '../MusicContext'
import { getPlaybackControls, usePlayback } from '../playback'
import { useMusicStore } from '../store'
import { Artwork, Card, Mosaic } from '../ui'

export function PlaylistsView() {
  const music = useMusic()
  useStickyHeader({ title: 'Playlists', hue: null, threshold: 72 })
  const store = useMusicStore()
  const isPlaying = usePlayback((state) => state.isPlaying)
  const context = music.session?.context
  return (
    <div className="music-page music-page--padded">
      <div className="music-section-heading">
        <h1>Playlists</h1>
        <button
          type="button"
          className="music-button music-button--light"
          onClick={() => music.newPlaylist()}
        >
          Create playlist
        </button>
      </div>
      <div className="music-cards">
        <Card
          title="Liked Songs"
          subtitle={`${store.liked.length} liked songs`}
          className="music-card--liked"
          art={<Artwork liked name="Liked Songs" />}
          onOpen={() => navigate(musicPath('liked'))}
        />
        {music.playlists.map((playlist) => {
          const tracks = sortedItems(playlist).map(playlistVideo)
          const current = context?.kind === 'playlist' && context.id === playlist.id
          return (
            <Card
              key={playlist.id}
              title={playlist.name}
              subtitle={`By you · ${playlist.items.length} songs`}
              art={<Mosaic images={tracks.map((t) => t.thumbnail_url)} name={playlist.name} />}
              onOpen={() => navigate(musicPath('playlist', playlist.id))}
              playing={current && isPlaying}
              onPlay={
                tracks.length
                  ? () =>
                      current
                        ? getPlaybackControls()?.toggle()
                        : music.play(tracks, 0, { kind: 'playlist', id: playlist.id, title: playlist.name })
                  : undefined
              }
            />
          )
        })}
      </div>
      {!music.playlists.length ? (
        <div className="music-empty">
          <h2>Create Your First Playlist</h2>
          <p>It's easy, we'll help you.</p>
        </div>
      ) : null}
    </div>
  )
}

export function ArtistsView() {
  useStickyHeader({ title: 'Artists', hue: null, threshold: 72 })
  const subscriptions = useLibrary((state) => state.subscriptions)
  return (
    <div className="music-page music-page--padded">
      <h1>Artists</h1>
      <p className="music-muted">Artists you follow. Following here also subscribes in Video view.</p>
      <div className="music-cards">
        {subscriptions.map((artist) => (
          <Card
            key={artist.id}
            className="music-card--round"
            title={artist.name}
            subtitle="Artist"
            art={<Artwork round src={artist.avatarUrl} name={artist.name} icon="artist" />}
            onOpen={() => navigate(musicPath('artist', artist.id))}
          />
        ))}
      </div>
      {!subscriptions.length ? (
        <div className="music-empty">
          <h2>Follow Your First Artist</h2>
          <p>Open an artist from any song and press Follow.</p>
        </div>
      ) : null}
    </div>
  )
}

export function ImportsView({ importsPanel }: { importsPanel: ReactNode }) {
  useStickyHeader({ title: 'Import & Export', hue: null, threshold: 72 })
  return (
    <div className="music-page music-page--padded">
      <h1>Import &amp; Export</h1>
      <p className="music-muted">
        Bring playlists in from Spotify or YouTube, or download YouTube playlists as files.
      </p>
      <SpotifyPreview />
      {importsPanel}
    </div>
  )
}

function SpotifyPreview() {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<SpotifyPlaylistPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <section className="music-import">
      <h2>Spotify Playlist Preview</h2>
      <p>
        Reads a public Spotify playlist's track list, without playing it from Spotify. Pick the
        YouTube version of each song yourself.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          setPreview(null)
          void previewSpotifyPlaylist(url)
            .then(setPreview)
            .catch((e) => setError(e instanceof Error ? e.message : 'Preview failed.'))
            .finally(() => setBusy(false))
        }}
      >
        <input
          aria-label="Spotify playlist URL"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
        />
        <button className="music-button" disabled={busy || !url.trim()}>
          {busy ? 'Loading...' : 'Preview playlist'}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <>
          <h3>{preview.playlist_name}</h3>
          <p>
            Showing {preview.preview_tracks.length} of {preview.total_tracks} tracks.
          </p>
          {preview.preview_tracks.map((t, i) => (
            <div className="music-setting" key={`${t.spotify_track_id}-${i}`}>
              <span>
                <strong>{t.title}</strong>
                <small>{t.artists.join(', ')}</small>
              </span>
              <button
                className="music-button"
                onClick={() => navigate(musicPath('search', `${t.artists.join(' ')} ${t.title}`))}
              >
                Find on YouTube
              </button>
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}
