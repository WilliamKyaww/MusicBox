import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react'
import { getCaptionTrackUrl, getSplitAudioUrl, getSplitVideoUrl } from '../api/browse'
import { formatClock } from '../format'
import { getPlayerPrefs, updatePlayerPrefs } from '../library'
import {
  CaptionsIcon,
  ChevronRightIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  NextIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  ReplayIcon,
  SettingsIcon,
  TheaterIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
} from '../components/Icons'
import { activeCueText, useCaptionCues } from './captions'
import { PLAYBACK_RATES } from './playbackRates'
import { PlayerSettingsMenu } from './PlayerSettingsMenu'
import { SeekBar } from './SeekBar'
import type { ClipRange, QualityOption, VideoDetails, VideoSearchResult } from '../types'

export type VideoPlayerHandle = {
  seekTo: (seconds: number, play?: boolean) => void
  getCurrentTime: () => number
  pause: () => void
}

type PlayerMode = 'local' | 'split' | 'embed'

type Flash = { id: number; icon: 'play' | 'pause' | 'text'; text?: string }

type VideoPlayerProps = {
  ref?: Ref<VideoPlayerHandle>
  details: VideoDetails
  startSeconds: number
  theater: boolean
  onToggleTheater: () => void
  autoplay: boolean
  onToggleAutoplay: () => void
  nextVideo: VideoSearchResult | null
  onPlayNext: () => void
  clip: ClipRange | null
  onClipChange: (clip: ClipRange) => void
  onProgress: (seconds: number, duration: number) => void
  onTimeUpdate?: (seconds: number) => void
}

const CONTROLS_HIDE_DELAY_MS = 2600
// Audio is nudged back onto the picture when the two drift further apart than this.
const MAX_SYNC_DRIFT_SECONDS = 0.3
const SYNC_INTERVAL_MS = 250
const PROGRESS_SAVE_INTERVAL_SECONDS = 5
const AUTOPLAY_COUNTDOWN_SECONDS = 8
const FRAME_SECONDS = 1 / 30

function initialMode(details: VideoDetails): PlayerMode {
  if (details.live_status === 'is_live' || details.live_status === 'is_upcoming') return 'embed'
  if (details.local_video_url) return 'local'
  if (details.qualities.length > 0) return 'split'
  return 'embed'
}

function pickQuality(qualities: QualityOption[], preferredHeight: number) {
  if (qualities.length === 0) return null
  // The backend lists qualities from best to worst.
  const fitting = qualities.find((quality) => quality.height <= preferredHeight)
  return (fitting ?? qualities[qualities.length - 1]).id
}

function bufferedEndAt(media: HTMLMediaElement | null, time: number) {
  if (!media) return 0
  const ranges = media.buffered
  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges.start(index) <= time + 0.5 && ranges.end(index) >= time) {
      return ranges.end(index)
    }
  }
  return time
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

export function VideoPlayer({
  ref,
  details,
  startSeconds,
  theater,
  onToggleTheater,
  autoplay,
  onToggleAutoplay,
  nextVideo,
  onPlayNext,
  clip,
  onClipChange,
  onProgress,
  onTimeUpdate,
}: VideoPlayerProps) {
  const initialPrefs = getPlayerPrefs()
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const wantsPlayRef = useRef(true)
  const pendingSeekRef = useRef<number | null>(startSeconds > 0 ? startSeconds : null)
  const lastSavedRef = useRef(0)
  const hideTimerRef = useRef<number | undefined>(undefined)
  const clickTimerRef = useRef<number | undefined>(undefined)
  const pointerInsideRef = useRef(false)
  const settingsAnchorRef = useRef<HTMLDivElement>(null)

  const canUseDirect = Boolean(details.local_video_url) || details.qualities.length > 0
  const [mode, setMode] = useState<PlayerMode>(() => initialMode(details))
  const [embedStart, setEmbedStart] = useState(Math.floor(startSeconds))
  const [notice, setNotice] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(true)
  const [currentTime, setCurrentTime] = useState(startSeconds)
  const [duration, setDuration] = useState(details.duration_seconds ?? 0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(initialPrefs.volume)
  const [muted, setMuted] = useState(initialPrefs.muted)
  const [playbackRate, setPlaybackRate] = useState(initialPrefs.playbackRate)
  const [qualityId, setQualityId] = useState(() =>
    pickQuality(details.qualities, initialPrefs.qualityHeight),
  )
  const [captionLang, setCaptionLang] = useState<string | null>(() =>
    details.captions.some((track) => track.lang === initialPrefs.captionsLang)
      ? initialPrefs.captionsLang
      : null,
  )
  const [loop, setLoop] = useState(false)
  const [ended, setEnded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const isSplit = mode === 'split'
  const isDirect = mode !== 'embed'
  const captionTrack = details.captions.find((track) => track.lang === captionLang) ?? null
  const cues = useCaptionCues(
    captionTrack && isDirect
      ? getCaptionTrackUrl(details.id, captionTrack.lang, captionTrack.auto_generated)
      : null,
  )
  const captionText = captionTrack ? activeCueText(cues, currentTime) : ''
  const currentChapter = details.chapters.find(
    (chapter) => currentTime >= chapter.start_seconds && currentTime < chapter.end_seconds,
  )

  function showFlash(icon: Flash['icon'], text?: string) {
    setFlash({ id: Date.now(), icon, text })
  }

  function reportProgress() {
    const video = videoRef.current
    if (video && Number.isFinite(video.duration)) {
      lastSavedRef.current = video.currentTime
      onProgress(video.currentTime, video.duration)
    }
  }

  function handlePlayError(error: unknown) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      // Browsers block unmuted autoplay until the page has had a click.
      pause()
      setAutoplayBlocked(true)
    }
  }

  function play() {
    const video = videoRef.current
    if (!video) return
    wantsPlayRef.current = true
    setIsPlaying(true)
    setAutoplayBlocked(false)
    if (ended) {
      setEnded(false)
      setCountdown(null)
      seek(0)
    }
    video.play().catch(handlePlayError)
    if (isSplit) audioRef.current?.play().catch(handlePlayError)
  }

  function pause() {
    wantsPlayRef.current = false
    setIsPlaying(false)
    videoRef.current?.pause()
    audioRef.current?.pause()
    reportProgress()
  }

  function togglePlay() {
    if (wantsPlayRef.current && !ended) {
      pause()
      showFlash('pause')
    } else {
      play()
      showFlash('play')
    }
  }

  function seek(seconds: number) {
    const video = videoRef.current
    const target = Math.max(0, Math.min(seconds, duration || seconds))
    if (!video) return
    video.currentTime = target
    if (isSplit && audioRef.current) audioRef.current.currentTime = target
    setCurrentTime(target)
    if (ended && target < duration - 0.5) {
      setEnded(false)
      setCountdown(null)
    }
  }

  function seekBy(delta: number) {
    const video = videoRef.current
    if (!video) return
    seek(video.currentTime + delta)
    showFlash('text', `${delta > 0 ? '+' : '−'}${Math.abs(delta)}s`)
  }

  function changeVolume(next: number) {
    const clamped = Math.min(1, Math.max(0, next))
    setVolume(clamped)
    setMuted(clamped === 0)
    updatePlayerPrefs({ volume: clamped, muted: clamped === 0 })
  }

  function toggleMute() {
    const nextMuted = !muted
    setMuted(nextMuted)
    if (!nextMuted && volume === 0) setVolume(0.5)
    updatePlayerPrefs({ muted: nextMuted })
    showFlash('text', nextMuted ? 'Muted' : `${Math.round((volume || 0.5) * 100)}%`)
  }

  function changeRate(rate: number) {
    const rounded = Math.round(rate * 100) / 100
    setPlaybackRate(rounded)
    updatePlayerPrefs({ playbackRate: rounded })
    showFlash('text', `${rounded}x`)
  }

  function changeQuality(nextQualityId: string) {
    const video = videoRef.current
    const quality = details.qualities.find((option) => option.id === nextQualityId)
    if (!video || !quality || nextQualityId === qualityId) return
    pendingSeekRef.current = video.currentTime
    setIsBuffering(true)
    setQualityId(nextQualityId)
    updatePlayerPrefs({ qualityHeight: quality.height })
  }

  function changeCaptions(lang: string | null) {
    setCaptionLang(lang)
    if (lang) updatePlayerPrefs({ captionsLang: lang })
  }

  function toggleCaptions() {
    if (details.captions.length === 0) return
    if (captionLang) {
      setCaptionLang(null)
      showFlash('text', 'Subtitles off')
      return
    }
    const preferred =
      details.captions.find((track) => track.lang === getPlayerPrefs().captionsLang) ??
      details.captions[0]
    changeCaptions(preferred.lang)
    showFlash('text', preferred.name)
  }

  function toggleFullscreen() {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen?.()
    }
  }

  async function togglePictureInPicture() {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch {
      setNotice('Picture-in-picture is not available for this video.')
    }
  }

  function switchToEmbed(message: string | null) {
    pause()
    setEmbedStart(Math.floor(videoRef.current?.currentTime ?? currentTime))
    setMode('embed')
    setNotice(message)
    setSettingsOpen(false)
  }

  function switchToDirect() {
    pendingSeekRef.current = null
    wantsPlayRef.current = true
    setNotice(null)
    setIsBuffering(true)
    setMode(details.local_video_url ? 'local' : 'split')
  }

  function handleMediaError() {
    if (mode === 'local' && details.qualities.length > 0) {
      pendingSeekRef.current = videoRef.current?.currentTime ?? null
      setMode('split')
      return
    }
    if (details.embeddable) {
      switchToEmbed('Direct playback failed, so this switched to the YouTube player.')
    } else {
      setNotice('This video could not be played here. Try opening it on YouTube.')
    }
  }

  function handleEnded() {
    wantsPlayRef.current = false
    audioRef.current?.pause()
    reportProgress()
    if (loop) {
      seek(0)
      play()
      return
    }
    setIsPlaying(false)
    setEnded(true)
    if (autoplay && nextVideo) setCountdown(AUTOPLAY_COUNTDOWN_SECONDS)
  }

  function revealControls() {
    setControlsVisible(true)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(
      () => setControlsVisible(false),
      CONTROLS_HIDE_DELAY_MS,
    )
  }

  useImperativeHandle(ref, () => ({
    seekTo(seconds, shouldPlay = true) {
      if (mode === 'embed') {
        setEmbedStart(Math.floor(seconds))
        return
      }
      seek(seconds)
      if (shouldPlay) play()
    },
    getCurrentTime: () => videoRef.current?.currentTime ?? currentTime,
    pause,
  }))

  // Keep audio and picture together: YouTube serves HD as separate files.
  useEffect(() => {
    if (!isSplit) return
    const intervalId = window.setInterval(() => {
      const video = videoRef.current
      const audio = audioRef.current
      if (!video || !audio || !wantsPlayRef.current || video.ended) return

      const ready =
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      if (!ready) {
        if (!video.paused) video.pause()
        if (!audio.paused) audio.pause()
        setIsBuffering(true)
        return
      }

      setIsBuffering(false)
      if (Math.abs(audio.currentTime - video.currentTime) > MAX_SYNC_DRIFT_SECONDS) {
        audio.currentTime = video.currentTime
      }
      if (video.paused) video.play().catch(handlePlayError)
      if (audio.paused) audio.play().catch(handlePlayError)
    }, SYNC_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
    // handlePlayError only touches state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit, qualityId])

  // Smooth progress bar while playing; timeupdate alone only fires ~4 times a second.
  useEffect(() => {
    if (!isPlaying || !isDirect) return
    let frame = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      const video = videoRef.current
      if (video && now - lastUpdate > 90) {
        lastUpdate = now
        setCurrentTime(video.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, isDirect])

  useEffect(() => {
    const sound = isSplit ? audioRef.current : videoRef.current
    if (sound) {
      sound.volume = volume
      sound.muted = muted
    }
    if (isSplit && videoRef.current) videoRef.current.muted = true
  }, [volume, muted, isSplit, mode])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate, mode, qualityId])

  useEffect(() => {
    if (!settingsOpen) return
    function handlePointerDown(event: PointerEvent) {
      if (!settingsAnchorRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [settingsOpen])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      onPlayNext()
      return
    }
    const timeoutId = window.setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => window.clearTimeout(timeoutId)
  }, [countdown, onPlayNext])

  // Save the resume point when leaving the page.
  const reportProgressRef = useRef(reportProgress)
  useEffect(() => {
    reportProgressRef.current = reportProgress
  })
  useEffect(() => () => reportProgressRef.current(), [])

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), [])

  // Hardware media keys and the OS media overlay.
  const mediaHandlersRef = useRef({ play, pause, seekBy, seek, onPlayNext })
  useEffect(() => {
    mediaHandlersRef.current = { play, pause, seekBy, seek, onPlayNext }
  })
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    const session = navigator.mediaSession
    session.metadata = new MediaMetadata({
      title: details.title,
      artist: details.channel_title,
      artwork: [{ src: details.thumbnail_url }],
    })
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => mediaHandlersRef.current.play()],
      ['pause', () => mediaHandlersRef.current.pause()],
      ['seekbackward', () => mediaHandlersRef.current.seekBy(-10)],
      ['seekforward', () => mediaHandlersRef.current.seekBy(10)],
      ['seekto', (event) => mediaHandlersRef.current.seek(event.seekTime ?? 0)],
      ['nexttrack', () => mediaHandlersRef.current.onPlayNext()],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Older browsers reject some actions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // Ignore unsupported actions.
        }
      }
    }
  }, [details.title, details.channel_title, details.thumbnail_url])

  // YouTube's keyboard shortcuts.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      if (mode === 'embed') return
      const video = videoRef.current
      if (!video) return

      const key = event.key
      const handled = (() => {
        switch (key) {
          case ' ':
          case 'k':
          case 'K':
            togglePlay()
            return true
          case 'j':
          case 'J':
            seekBy(-10)
            return true
          case 'l':
          case 'L':
            seekBy(10)
            return true
          case 'ArrowLeft':
            seekBy(-5)
            return true
          case 'ArrowRight':
            seekBy(5)
            return true
          case 'ArrowUp':
          case 'ArrowDown': {
            // Only steal the arrow keys from page scrolling while over the player.
            if (!pointerInsideRef.current && !isFullscreen) return false
            const next = volume + (key === 'ArrowUp' ? 0.05 : -0.05)
            changeVolume(next)
            showFlash('text', `${Math.round(Math.min(1, Math.max(0, next)) * 100)}%`)
            return true
          }
          case 'm':
          case 'M':
            toggleMute()
            return true
          case 'f':
          case 'F':
            toggleFullscreen()
            return true
          case 't':
          case 'T':
            onToggleTheater()
            return true
          case 'c':
          case 'C':
            toggleCaptions()
            return true
          case 'i':
          case 'I':
            void togglePictureInPicture()
            return true
          case 'N':
            if (event.shiftKey && nextVideo) onPlayNext()
            return Boolean(event.shiftKey && nextVideo)
          case '>':
          case '<': {
            const index = PLAYBACK_RATES.findIndex((rate) => rate >= playbackRate)
            const base = index < 0 ? PLAYBACK_RATES.length - 1 : index
            const nextIndex = Math.min(
              PLAYBACK_RATES.length - 1,
              Math.max(0, base + (key === '>' ? 1 : -1)),
            )
            changeRate(PLAYBACK_RATES[nextIndex])
            return true
          }
          case ',':
          case '.':
            if (!video.paused) return false
            seek(video.currentTime + (key === '.' ? FRAME_SECONDS : -FRAME_SECONDS))
            return true
          case 'Home':
            seek(0)
            return true
          case 'End':
            seek(duration)
            return true
          default:
            if (/^[0-9]$/.test(key) && duration > 0) {
              seek((Number(key) / 10) * duration)
              return true
            }
            return false
        }
      })()

      if (handled) {
        event.preventDefault()
        revealControls()
      }
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const showControls =
    !isPlaying || settingsOpen || controlsVisible || scrubTime !== null || ended
  const volumeIcon =
    muted || volume === 0 ? (
      <VolumeMuteIcon className="yt-icon" />
    ) : volume < 0.5 ? (
      <VolumeLowIcon className="yt-icon" />
    ) : (
      <VolumeHighIcon className="yt-icon" />
    )
  const videoSource =
    mode === 'local' ? details.local_video_url ?? undefined : getSplitVideoUrl(details.id, qualityId)
  const selectedQuality = details.qualities.find((quality) => quality.id === qualityId)

  if (mode === 'embed') {
    return (
      <div
        ref={containerRef}
        className={`yt-player yt-player--embed ${theater ? 'yt-player--theater' : ''}`}
      >
        <iframe
          className="yt-player__embed"
          src={`https://www.youtube-nocookie.com/embed/${details.id}?autoplay=1&rel=0&start=${embedStart}`}
          title={details.title}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
        {notice || canUseDirect ? (
          <div className="yt-player__embed-bar">
            {notice ? <span>{notice}</span> : <span>Playing with the YouTube player.</span>}
            {canUseDirect ? (
              <button type="button" onClick={switchToDirect}>
                Use MusicBox player
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`yt-player ${theater ? 'yt-player--theater' : ''} ${
        showControls ? '' : 'yt-player--idle'
      } ${isFullscreen ? 'yt-player--fullscreen' : ''}`}
      onPointerMove={revealControls}
      onPointerEnter={() => {
        pointerInsideRef.current = true
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false
        if (isPlaying) setControlsVisible(false)
      }}
    >
      <video
        ref={videoRef}
        className="yt-player__video"
        src={videoSource}
        preload="auto"
        playsInline
        muted={isSplit}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (Number.isFinite(video.duration)) setDuration(video.duration)
          if (pendingSeekRef.current !== null) {
            video.currentTime = pendingSeekRef.current
            if (isSplit && audioRef.current) audioRef.current.currentTime = pendingSeekRef.current
            pendingSeekRef.current = null
          }
          if (wantsPlayRef.current) play()
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration
          if (Number.isFinite(value)) setDuration(value)
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          onTimeUpdate?.(time)
          setBufferedEnd(
            isSplit
              ? Math.min(bufferedEndAt(event.currentTarget, time), bufferedEndAt(audioRef.current, time))
              : bufferedEndAt(event.currentTarget, time),
          )
          if (Math.abs(time - lastSavedRef.current) >= PROGRESS_SAVE_INTERVAL_SECONDS) {
            reportProgress()
          }
        }}
        onProgress={(event) =>
          setBufferedEnd(bufferedEndAt(event.currentTarget, event.currentTarget.currentTime))
        }
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          if (!isSplit) setIsBuffering(false)
        }}
        onCanPlay={() => {
          if (!isSplit) setIsBuffering(false)
        }}
        onEnded={handleEnded}
        onError={handleMediaError}
        onClick={() => {
          window.clearTimeout(clickTimerRef.current)
          clickTimerRef.current = window.setTimeout(togglePlay, 180)
        }}
        onDoubleClick={() => {
          window.clearTimeout(clickTimerRef.current)
          toggleFullscreen()
        }}
      />
      {isSplit ? (
        <audio
          ref={audioRef}
          src={getSplitAudioUrl(details.id)}
          preload="auto"
          onError={handleMediaError}
        />
      ) : null}

      {captionText ? (
        <div className="yt-player__captions" aria-live="off">
          {captionText.split('\n').map((line, index) => (
            <span key={index}>{line}</span>
          ))}
        </div>
      ) : null}

      {isBuffering && isPlaying && !ended ? <span className="yt-player__spinner" /> : null}

      {flash ? (
        <div key={flash.id} className="yt-player__flash" aria-hidden="true">
          {flash.icon === 'play' ? <PlayIcon className="yt-icon" /> : null}
          {flash.icon === 'pause' ? <PauseIcon className="yt-icon" /> : null}
          {flash.icon === 'text' ? <span>{flash.text}</span> : null}
        </div>
      ) : null}

      {autoplayBlocked ? (
        <button type="button" className="yt-player__big-play" onClick={play} aria-label="Play">
          <PlayIcon className="yt-icon" />
        </button>
      ) : null}

      {notice ? (
        <div className="yt-player__notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      {ended ? (
        <div className="yt-player__endscreen">
          {countdown !== null && nextVideo ? (
            <div className="yt-endscreen">
              <p className="yt-endscreen__label">Up next in {countdown}</p>
              <img src={nextVideo.thumbnail_url} alt="" />
              <p className="yt-endscreen__title">{nextVideo.title}</p>
              <p className="yt-endscreen__channel">{nextVideo.channel_title}</p>
              <div className="yt-endscreen__actions">
                <button type="button" onClick={() => setCountdown(null)}>
                  Cancel
                </button>
                <button type="button" className="yt-endscreen__primary" onClick={onPlayNext}>
                  Play now
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="yt-player__big-play" onClick={play} aria-label="Replay">
              <ReplayIcon className="yt-icon" />
            </button>
          )}
        </div>
      ) : null}

      {isFullscreen ? (
        <div className="yt-player__top">
          <p>{details.title}</p>
        </div>
      ) : null}

      <div className="yt-player__chrome" onClick={(event) => event.stopPropagation()}>
        <SeekBar
          duration={duration}
          currentTime={currentTime}
          bufferedEnd={bufferedEnd}
          chapters={details.chapters}
          heatmap={details.heatmap}
          storyboard={details.storyboard}
          clip={clip}
          onSeek={seek}
          onScrub={setScrubTime}
          onClipChange={onClipChange}
        />
        <div className="yt-player__controls">
          <div className="yt-player__group">
            <button
              type="button"
              className="yt-player__button"
              onClick={togglePlay}
              aria-label={isPlaying && !ended ? 'Pause (k)' : 'Play (k)'}
              title={isPlaying && !ended ? 'Pause (k)' : 'Play (k)'}
            >
              {ended ? (
                <ReplayIcon className="yt-icon" />
              ) : isPlaying ? (
                <PauseIcon className="yt-icon" />
              ) : (
                <PlayIcon className="yt-icon" />
              )}
            </button>
            {nextVideo ? (
              <button
                type="button"
                className="yt-player__button"
                onClick={onPlayNext}
                aria-label="Next (Shift+N)"
                title={`Next: ${nextVideo.title}`}
              >
                <NextIcon className="yt-icon" />
              </button>
            ) : null}
            <div className="yt-player__volume">
              <button
                type="button"
                className="yt-player__button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute (m)' : 'Mute (m)'}
                title={muted ? 'Unmute (m)' : 'Mute (m)'}
              >
                {volumeIcon}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(event) => changeVolume(Number(event.target.value))}
                style={{ '--volume': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
              />
            </div>
            <span className="yt-player__time">
              {formatClock(scrubTime ?? currentTime)} / {formatClock(duration)}
            </span>
            {currentChapter?.title ? (
              <span className="yt-player__chapter">
                • {currentChapter.title}
                <ChevronRightIcon className="yt-icon" />
              </span>
            ) : null}
          </div>

          <div className="yt-player__group">
            <button
              type="button"
              className="yt-player__button yt-player__autoplay"
              onClick={onToggleAutoplay}
              aria-pressed={autoplay}
              title={autoplay ? 'Autoplay is on' : 'Autoplay is off'}
            >
              <span className={`yt-switch ${autoplay ? 'yt-switch--on' : ''}`} aria-hidden="true" />
            </button>
            {details.captions.length > 0 ? (
              <button
                type="button"
                className={`yt-player__button ${captionLang ? 'yt-player__button--on' : ''}`}
                onClick={toggleCaptions}
                aria-pressed={Boolean(captionLang)}
                aria-label="Subtitles/closed captions (c)"
                title="Subtitles/closed captions (c)"
              >
                <CaptionsIcon className="yt-icon" />
              </button>
            ) : null}
            <div className="yt-player__settings-anchor" ref={settingsAnchorRef}>
              <button
                type="button"
                className={`yt-player__button ${settingsOpen ? 'yt-player__button--spin' : ''}`}
                onClick={() => setSettingsOpen((open) => !open)}
                aria-label="Settings"
                aria-expanded={settingsOpen}
                title="Settings"
              >
                <SettingsIcon className="yt-icon" />
                {selectedQuality && selectedQuality.height >= 720 ? (
                  <span className="yt-player__hd-badge">HD</span>
                ) : null}
              </button>
              {settingsOpen ? (
                <PlayerSettingsMenu
                  playbackRate={playbackRate}
                  onPlaybackRateChange={changeRate}
                  qualities={isSplit ? details.qualities : []}
                  qualityId={qualityId}
                  onQualityChange={changeQuality}
                  qualityNote={mode === 'local' ? 'Downloaded file' : null}
                  captions={details.captions}
                  captionLang={captionLang}
                  onCaptionChange={changeCaptions}
                  loop={loop}
                  onLoopChange={setLoop}
                  canSwitchToEmbed={details.embeddable}
                  onSwitchToEmbed={() => switchToEmbed(null)}
                />
              ) : null}
            </div>
            {document.pictureInPictureEnabled ? (
              <button
                type="button"
                className="yt-player__button"
                onClick={() => void togglePictureInPicture()}
                aria-label="Picture-in-picture (i)"
                title="Picture-in-picture (i)"
              >
                <PictureInPictureIcon className="yt-icon" />
              </button>
            ) : null}
            {!isFullscreen ? (
              <button
                type="button"
                className="yt-player__button"
                onClick={onToggleTheater}
                aria-label={theater ? 'Default view (t)' : 'Theater mode (t)'}
                title={theater ? 'Default view (t)' : 'Theater mode (t)'}
              >
                <TheaterIcon className="yt-icon" />
              </button>
            ) : null}
            <button
              type="button"
              className="yt-player__button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
              title={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
            >
              {isFullscreen ? (
                <ExitFullscreenIcon className="yt-icon" />
              ) : (
                <FullscreenIcon className="yt-icon" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
