import { useEffect, useMemo, useRef, useState } from 'react'
import { getCaptionTrackUrl } from '../api/browse'
import { CloseIcon } from '../components/Icons'
import { formatClock } from '../format'
import { getPlayerPrefs } from '../library'
import { useCaptionTrack } from '../player/captions'
import type { CaptionTrack } from '../types'
import { activeLineIndex, buildTranscript } from './transcript'

type TranscriptPanelProps = {
  videoId: string
  tracks: CaptionTrack[]
  getCurrentTime: () => number
  onSeek: (seconds: number) => void
  onClose: () => void
}

/** How long to leave the list alone after the viewer scrolls it themselves. */
const MANUAL_SCROLL_PAUSE_MS = 4000

function pickInitialTrack(tracks: CaptionTrack[]) {
  const preferred = getPlayerPrefs().captionsLang
  return tracks.find((track) => track.lang === preferred) ?? tracks[0]
}

export function TranscriptPanel({
  videoId,
  tracks,
  getCurrentTime,
  onSeek,
  onClose,
}: TranscriptPanelProps) {
  const [lang, setLang] = useState(() => pickInitialTrack(tracks)?.lang ?? '')
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const lastManualScrollRef = useRef(0)
  const panelRef = useRef<HTMLElement>(null)

  // Below the video the panel sits under the comments, so bring it into view.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1016px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const track = tracks.find((candidate) => candidate.lang === lang) ?? tracks[0] ?? null
  const url = track ? getCaptionTrackUrl(videoId, track.lang, track.auto_generated) : null
  const { cues, failed, isLoading } = useCaptionTrack(url)
  const lines = useMemo(() => buildTranscript(cues), [cues])

  // Follow the video without re-rendering the whole watch page on every tick.
  useEffect(() => {
    if (lines.length === 0) return
    function sync() {
      setActiveIndex(activeLineIndex(lines, getCurrentTime()))
    }
    sync()
    const intervalId = window.setInterval(sync, 250)
    return () => window.clearInterval(intervalId)
  }, [lines, getCurrentTime])

  // Keep the spoken line centred, unless the viewer is scrolling it themselves.
  useEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !active) return
    if (Date.now() - lastManualScrollRef.current < MANUAL_SCROLL_PAUSE_MS) return
    const top = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeIndex, lines])

  function markManualScroll() {
    lastManualScrollRef.current = Date.now()
  }

  let body
  if (isLoading) {
    body = <span className="yt-spinner" role="status" aria-label="Loading transcript" />
  } else if (failed) {
    body = <p className="transcript__message">The transcript couldn't be loaded. Try again later.</p>
  } else if (lines.length === 0) {
    body = <p className="transcript__message">This video doesn't have a transcript.</p>
  } else {
    body = lines.map((line, index) => (
      <button
        key={`${line.start}-${index}`}
        type="button"
        className="transcript__line"
        aria-current={index === activeIndex ? 'true' : undefined}
        onClick={() => onSeek(line.start)}
      >
        {showTimestamps ? (
          <span className="transcript__time">{formatClock(line.start)}</span>
        ) : null}
        <span className="transcript__text">{line.text}</span>
      </button>
    ))
  }

  return (
    <section className="transcript" aria-label="Transcript" ref={panelRef}>
      <header className="transcript__header">
        <h2>Transcript</h2>
        <button
          type="button"
          className="yt-icon-button"
          onClick={onClose}
          aria-label="Close transcript"
          title="Close transcript"
        >
          <CloseIcon className="yt-icon" />
        </button>
      </header>

      <div className="transcript__tools">
        {tracks.length > 1 ? (
          <select
            className="transcript__language"
            value={track?.lang ?? ''}
            onChange={(event) => setLang(event.target.value)}
            aria-label="Transcript language"
          >
            {tracks.map((candidate) => (
              <option key={`${candidate.lang}-${candidate.auto_generated}`} value={candidate.lang}>
                {candidate.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="transcript__language-name">{track?.name}</span>
        )}
        <button
          type="button"
          className={`yt-chip ${showTimestamps ? 'yt-chip--active' : ''}`}
          onClick={() => setShowTimestamps((current) => !current)}
          aria-pressed={showTimestamps}
        >
          Timestamps
        </button>
      </div>

      <div
        className="transcript__list"
        ref={listRef}
        onWheel={markManualScroll}
        onTouchMove={markManualScroll}
        onKeyDown={markManualScroll}
      >
        {body}
      </div>
    </section>
  )
}
