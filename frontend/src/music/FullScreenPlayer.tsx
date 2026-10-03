import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { contextPath } from './helpers'
import { LyricsLines } from './LyricsLines'
import { MusicIcon } from './MusicIcon'
import { useMusic } from './MusicContext'
import { getPlaybackControls, usePlayback } from './playback'
import { ArtistLink } from './TrackList'
import { LikeButton } from './ui'

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function FullScreenPlayer({ onClose }: { onClose: () => void }) {
  const music = useMusic()
  const video = music.currentVideo
  const context = music.session?.context
  const [showLyrics, setShowLyrics] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const isPlaying = usePlayback((s) => s.isPlaying)
  const currentTime = usePlayback((s) => s.currentTime)
  const duration = usePlayback((s) => s.duration)
  const shuffle = usePlayback((s) => s.shuffle)
  const loopMode = usePlayback((s) => s.loopMode)
  const canGoNext = usePlayback((s) => s.canGoNext)
  const volume = usePlayback((s) => s.volume)
  const muted = usePlayback((s) => s.muted)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const root = rootRef.current
    const previous = document.activeElement as HTMLElement | null
    root?.focus()
    const wide = window.matchMedia('(min-width: 700px)').matches
    // Only desktop goes truly full screen; on phones the overlay already fills the screen.
    if (wide && !document.fullscreenElement)
      void document.documentElement.requestFullscreen?.().catch(() => {})
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && wide) closeRef.current()
    }
    // Following a link (artist, playlist) leaves full screen to show that page.
    const onNavigate = () => closeRef.current()
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onNavigate)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onNavigate)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      previous?.focus()
    }
  }, [])

  if (!video) return null
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const controls = getPlaybackControls()
  return createPortal(
    <div
      ref={rootRef}
      className="music-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${video.title}`}
      tabIndex={-1}
      style={{ '--fullscreen-art': `url("${video.thumbnail_url}")` } as CSSProperties}
    >
      <header className="music-fullscreen__top">
        <div>
          {context ? (
            <>
              <span>Playing from</span>
              <a href={contextPath(context.kind, context.id)}>
                {context.title}
              </a>
            </>
          ) : (
            <span>Now playing</span>
          )}
        </div>
        <button
          type="button"
          className="music-icon-button"
          aria-label="Exit full screen"
          onClick={onClose}
        >
          <MusicIcon name="minimize" />
        </button>
      </header>
      <div className={`music-fullscreen__body ${showLyrics ? 'has-lyrics' : ''}`}>
        {showLyrics ? (
          <div className="music-fullscreen__lyrics">
            <LyricsLines key={video.id} videoId={video.id} variant="fullscreen" />
          </div>
        ) : (
          <img className="music-fullscreen__art" src={video.thumbnail_url} alt="" />
        )}
        <div className="music-fullscreen__info">
          <div>
            <h2>{video.title}</h2>
            <ArtistLink video={video} />
          </div>
          <LikeButton video={video} label="Like playing song" onToast={music.toast} />
        </div>
      </div>
      <footer className="music-fullscreen__controls">
        <div className="music-fullscreen__progress">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            style={{ '--audio-progress': `${progress}%` } as CSSProperties}
            onChange={(event) => controls?.seek(Number(event.target.value))}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="music-fullscreen__buttons">
          <button
            type="button"
            className={`music-icon-button ${showLyrics ? 'is-green' : ''}`}
            aria-label="Lyrics"
            aria-pressed={showLyrics}
            onClick={() => setShowLyrics(!showLyrics)}
          >
            <MusicIcon name="mic" />
          </button>
          <div className="music-fullscreen__transport">
            <button
              type="button"
              className={`music-icon-button ${shuffle ? 'is-green has-dot' : ''}`}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              onClick={() => controls?.toggleShuffle()}
            >
              <MusicIcon name="shuffle" />
            </button>
            <button type="button" className="music-icon-button" aria-label="Previous" onClick={() => controls?.previous()}>
              <MusicIcon name="previous" filled />
            </button>
            <button
              type="button"
              className="music-fullscreen__play"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => controls?.toggle()}
            >
              <MusicIcon name={isPlaying ? 'pause' : 'play'} filled />
            </button>
            <button
              type="button"
              className="music-icon-button"
              aria-label="Next"
              disabled={!canGoNext}
              onClick={() => controls?.next()}
            >
              <MusicIcon name="next" filled />
            </button>
            <button
              type="button"
              className={`music-icon-button ${loopMode !== 'off' ? 'is-green has-dot' : ''}`}
              aria-label={`Repeat: ${loopMode === 'one' ? 'song' : loopMode === 'all' ? 'queue' : 'off'}`}
              onClick={() => controls?.toggleLoop()}
            >
              <MusicIcon name="repeat" />
              {loopMode === 'one' ? <span className="music-repeat-one">1</span> : null}
            </button>
          </div>
          <div className="music-fullscreen__volume">
            <button
              type="button"
              className="music-icon-button"
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => controls?.toggleMute()}
            >
              <MusicIcon name={muted || volume === 0 ? 'volume-off' : volume < 0.5 ? 'volume-low' : 'volume'} />
            </button>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              style={{ '--audio-progress': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
              onChange={(event) => controls?.setVolume(Number(event.target.value))}
            />
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
