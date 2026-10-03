import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  clearDiscordPresenceActivity,
  updateDiscordPresenceActivity,
} from '../api/discordPresence'
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from './Icons'
import { PlaylistPicker } from './PlaylistPicker'
import type { CSSProperties, ReactNode } from 'react'
import type { Playlist } from '../types'
import { getPlayerPrefs, updatePlayerPrefs } from '../library'

type LoopMode = 'off' | 'once' | 'all' | 'one'

type AudioPlayerProps = {
  variant?: 'music' | 'video'
  autoplay?: boolean
  playRequest?: number
  hasMultipleTracks?: boolean
  extraControls?: ReactNode
  sleepAt?: number | 'end' | null
  onSleep?: () => void
  onTrackPlaying?: () => void
  videoId: string | null
  title: string | null
  thumbnailUrl: string | null
  discordThumbnailUrl: string | null
  channelTitle: string | null
  sourceUrl: string | null
  playlistName: string | null
  streamUrl: string | null
  discordPresenceEnabled: boolean
  isPlaylistPlayback: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  shuffleEnabled: boolean
  loopMode: LoopMode
  playlists: Playlist[]
  activePlaylistId: string | null
  isAddingToPlaylist: boolean
  onPrevious: () => void
  onNext: () => void
  onToggleShuffle: () => void
  onToggleLoop: () => void
  onLoopOnceConsumed: () => void
  onTrackEnded: () => void
  onAddToPlaylists: (playlistIds: string[]) => void
  onClose: () => void
}

export function AudioPlayer({
  variant = 'video', autoplay = true, playRequest = 0, hasMultipleTracks = false,
  extraControls, sleepAt = null, onSleep, onTrackPlaying,
  videoId,
  title,
  thumbnailUrl,
  discordThumbnailUrl,
  channelTitle,
  sourceUrl,
  playlistName,
  streamUrl,
  discordPresenceEnabled,
  isPlaylistPlayback,
  canGoPrevious,
  canGoNext,
  shuffleEnabled,
  loopMode,
  playlists,
  activePlaylistId,
  isAddingToPlaylist,
  onPrevious,
  onNext,
  onToggleShuffle,
  onToggleLoop,
  onLoopOnceConsumed,
  onTrackEnded,
  onAddToPlaylists,
  onClose,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastPresenceKeyRef = useRef<string | null>(null)
  const presenceWorkRef = useRef<Promise<void>>(Promise.resolve())
  const recordedTrackRef = useRef<string | null>(null)
  const userStartedRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => getPlayerPrefs().volume)
  const [muted, setMuted] = useState(() => getPlayerPrefs().muted)
  const [buffering, setBuffering] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const playLoadedAudio = useEffectEvent(() => {
    if (autoplay || userStartedRef.current) void audioRef.current?.play().catch(() => setIsPlaying(false))
  })
  function recordPlaying() {
    if (recordedTrackRef.current !== videoId) { recordedTrackRef.current = videoId; onTrackPlaying?.() }
  }
  const sleep = useEffectEvent(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    onSleep?.()
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !streamUrl) { userStartedRef.current = false; return }

    setCurrentTime(0)
    setDuration(0)
    setPlayError(null)
    setIsPlaying(false)
    recordedTrackRef.current = null
    audio.src = streamUrl
    playLoadedAudio()

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [streamUrl, playRequest])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
    updatePlayerPrefs({ volume, muted })
  }, [volume, muted, streamUrl])

  useEffect(() => {
    if (typeof sleepAt !== 'number' || !streamUrl) return
    const timer = window.setTimeout(sleep, Math.max(0, sleepAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [sleepAt, streamUrl])

  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (variant !== 'music' || !streamUrl || event.ctrlKey || event.metaKey || document.querySelector('[role="dialog"]')) return
    const target = event.target as HTMLElement | null
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return
    if (event.code === 'Space') { event.preventDefault(); handlePlayPause() }
    if (event.key.toLowerCase() === 'm' && !event.altKey) setMuted(current => !current)
    if (event.altKey && event.key === 'ArrowRight' && canGoNext) { event.preventDefault(); onNext() }
    if (event.altKey && event.key === 'ArrowLeft' && canGoPrevious) { event.preventDefault(); onPrevious() }
  })
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const mediaAction = useEffectEvent((action: string) => {
    if (action === 'play') void audioRef.current?.play().catch(() => {})
    if (action === 'pause') audioRef.current?.pause()
    if (action === 'nexttrack' && canGoNext) onNext()
    if (action === 'previoustrack' && canGoPrevious) onPrevious()
  })
  useEffect(() => {
    if (!streamUrl || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    navigator.mediaSession.metadata = new MediaMetadata({ title: title ?? '', artist: channelTitle ?? '', artwork: thumbnailUrl ? [{ src: thumbnailUrl }] : [] })
    const actions = ['play', 'pause', 'nexttrack', 'previoustrack'] as const
    for (const action of actions) {
      try { navigator.mediaSession.setActionHandler(action, () => mediaAction(action)) } catch { /* Older browsers omit some media actions. */ }
    }
    return () => {
      for (const action of actions) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* Unsupported action. */ }
      }
    }
  }, [streamUrl, title, channelTitle, thumbnailUrl])

  useEffect(() => {
    if (!discordPresenceEnabled || !videoId || !title) {
      if (lastPresenceKeyRef.current !== null) {
        presenceWorkRef.current = presenceWorkRef.current.then(() => clearDiscordPresenceActivity()).catch(() => {})
      }
      lastPresenceKeyRef.current = null
      return
    }

    const presenceKey = [
      videoId,
      isPlaying ? 'playing' : 'paused',
      currentTime > 0 ? Math.floor(currentTime / 15) : 0,
      duration > 0 ? Math.floor(duration) : 0,
      playlistName ?? '',
    ].join(':')

    if (lastPresenceKeyRef.current === presenceKey) {
      return
    }

    lastPresenceKeyRef.current = presenceKey

    const payload = {
      video_id: videoId,
      title,
      thumbnail_url: discordThumbnailUrl,
      channel_title: channelTitle,
      playlist_name: playlistName,
      source_url: sourceUrl,
      is_playing: isPlaying,
      is_playlist_playback: isPlaylistPlayback,
      position_seconds: Math.max(0, Math.floor(currentTime)),
      duration_seconds: duration > 0 ? Math.floor(duration) : null,
    }
    // Clear must run after an in-flight update, or private listening can publish stale activity.
    presenceWorkRef.current = presenceWorkRef.current.then(async () => {
      if (lastPresenceKeyRef.current === presenceKey) await updateDiscordPresenceActivity(payload)
    }).catch(() => {})
  }, [
    channelTitle,
    currentTime,
    discordPresenceEnabled,
    discordThumbnailUrl,
    duration,
    isPlaying,
    isPlaylistPlayback,
    playlistName,
    sourceUrl,
    title,
    videoId,
  ])

  useEffect(() => {
    return () => {
      if (lastPresenceKeyRef.current !== null) {
        lastPresenceKeyRef.current = null
        presenceWorkRef.current = presenceWorkRef.current.then(() => clearDiscordPresenceActivity()).catch(() => {})
      }
    }
  }, [])

  function handlePlayPause() {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.paused) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (!audio) return
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    const time = Number(event.target.value)
    audio.currentTime = time
    setCurrentTime(time)
  }

  function handleEnded() {
    const audio = audioRef.current
    if (!audio) return

    if (sleepAt === 'end') {
      setIsPlaying(false)
      onSleep?.()
      return
    }

    if (loopMode === 'once' || loopMode === 'one' || (loopMode === 'all' && !hasMultipleTracks)) {
      audio.currentTime = 0
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
      if (loopMode === 'once') {
        onLoopOnceConsumed()
      }
      return
    }

    if (canGoNext) {
      onTrackEnded()
      return
    }

    setIsPlaying(false)
    setCurrentTime(0)
  }

  function formatTime(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  if (!videoId || !streamUrl) return null

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  return createPortal(
    <div className={`audio-player ${variant === 'music' ? 'audio-player--music' : ''}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => { userStartedRef.current = true; setIsPlaying(true) }}
        onPause={() => setIsPlaying(false)}
        onPlaying={() => { setBuffering(false); setPlayError(null); recordPlaying() }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onError={() => { setIsPlaying(false); setBuffering(false); setPlayError('This song could not play. Try downloading it or opening Video view.') }}
        preload="metadata"
      />

      {playError ? <div className="audio-player__error" role="alert">{playError}<button onClick={() => { const audio = audioRef.current; if (audio) { audio.load(); void audio.play().catch(() => {}) } }}>Retry</button></div> : null}

      <div className="audio-player__artwork" aria-hidden="true">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" />
        ) : (
          <span>{(title || 'S').slice(0, 1).toUpperCase()}</span>
        )}
      </div>

      {variant === 'music' ? <div className="audio-player__track-label"><strong>{title}</strong><span>{channelTitle}</span>{buffering && isPlaying ? <small role="status">Buffering...</small> : null}</div> : null}

      <div className="audio-player__controls">
        {isPlaylistPlayback || variant === 'music' ? (
          <button
            type="button"
            className={`audio-player__control-button ${
              shuffleEnabled ? 'audio-player__control-button--active' : ''
            }`}
            onClick={onToggleShuffle}
            aria-pressed={shuffleEnabled}
            aria-label="Shuffle playlist"
            title="Shuffle playlist"
          >
            <ShuffleIcon className="audio-player__control-icon" />
          </button>
        ) : null}

        {isPlaylistPlayback || variant === 'music' ? (
          <button
            type="button"
            className="audio-player__control-button"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label="Previous track"
            title="Previous track"
          >
            <PreviousIcon className="audio-player__control-icon" />
          </button>
        ) : null}

        <button
          type="button"
          className="audio-player__play-btn"
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <PauseIcon className="audio-player__icon" />
          ) : (
            <PlayIcon className="audio-player__icon" />
          )}
        </button>

        {isPlaylistPlayback || variant === 'music' ? (
          <button
            type="button"
            className="audio-player__control-button"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next track"
            title="Next track"
          >
            <NextIcon className="audio-player__control-icon" />
          </button>
        ) : null}

        <button
          type="button"
          className={`audio-player__control-button ${
            loopMode !== 'off' ? 'audio-player__control-button--active' : ''
          }`}
          onClick={onToggleLoop}
          aria-pressed={loopMode !== 'off'}
          aria-label={
            loopMode === 'off'
              ? 'Loop off'
              : loopMode === 'once'
                ? 'Loop once'
                : loopMode === 'one' ? 'Repeat song' : 'Repeat queue'
          }
          title={
            loopMode === 'off'
              ? 'Loop off'
              : loopMode === 'once'
                ? 'Loop once'
                : loopMode === 'one' ? 'Repeat song' : 'Repeat queue'
          }
        >
          <RepeatIcon className="audio-player__control-icon" />
          {loopMode === 'once' || loopMode === 'one' ? <span className="audio-player__loop-badge">1</span> : null}
          {loopMode === 'all' ? <span className="audio-player__loop-badge">∞</span> : null}
        </button>
      </div>

      <div className="audio-player__info">
        {variant !== 'music' ? <p className="audio-player__title">{title || 'Unknown'}</p> : null}
        <div className="audio-player__progress-row">
          <span className="audio-player__time">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="audio-player__seek"
            aria-label="Seek audio"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            style={{ '--audio-progress': `${progressPercent}%` } as CSSProperties}
            onChange={handleSeek}
          />
          <span className="audio-player__time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="audio-player__volume">
        <button className="audio-player__control-button" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={() => setMuted(!muted)}><VolumeIcon className="audio-player__volume-icon" /></button>
        <input
          type="range"
          className="audio-player__volume-slider"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Audio volume"
          style={{ '--volume-progress': `${volumePercent}%` } as CSSProperties}
          onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }}
        />
      </div>

      {extraControls ? <div className="audio-player__extra">{extraControls}</div> : null}

      <PlaylistPicker
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        isSubmitting={isAddingToPlaylist}
        buttonClassName="audio-player__add-button"
        title="Add playing song to playlist"
        onSubmit={onAddToPlaylists}
      />

      <button
        type="button"
        className="audio-player__close"
        onClick={onClose}
        aria-label="Close player"
      >
        x
      </button>
    </div>,
    document.body,
  )
}
