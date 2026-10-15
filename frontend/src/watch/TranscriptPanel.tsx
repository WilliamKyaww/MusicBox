import { useEffect, useMemo, useRef, useState } from 'react'
import { getCaptionTrackUrl } from '../api/browse'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, SearchIcon } from '../components/Icons'
import { formatClock } from '../format'
import { getPlayerPrefs } from '../library'
import { useCaptionTrack } from '../player/captions'
import type { CaptionTrack } from '../types'
import { activeLineIndex, buildTranscript, findMatches, splitMatches } from './transcript'

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

function centreInList(list: HTMLElement, line: HTMLElement) {
  const top = line.offsetTop - list.clientHeight / 2 + line.offsetHeight / 2
  list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
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
  const [query, setQuery] = useState('')
  const [matchPosition, setMatchPosition] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  const searchText = query.trim()
  const matches = useMemo(() => findMatches(lines, searchText), [lines, searchText])
  const currentMatch = matches.length > 0 ? Math.min(matchPosition, matches.length - 1) : -1
  const currentLine = currentMatch >= 0 ? matches[currentMatch] : -1

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

  // Keep the spoken line centred, unless the viewer is scrolling it themselves
  // or is looking at search results.
  useEffect(() => {
    if (searchText) return
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !active) return
    if (Date.now() - lastManualScrollRef.current < MANUAL_SCROLL_PAUSE_MS) return
    centreInList(list, active)
  }, [activeIndex, lines, searchText])

  // Bring the current search match into view.
  useEffect(() => {
    if (currentLine < 0) return
    const list = listRef.current
    const line = list?.querySelector<HTMLElement>(`[data-line="${currentLine}"]`)
    if (list && line) centreInList(list, line)
  }, [currentLine, lines, searchText])

  // Ctrl+F (or Cmd+F) searches the transcript while it is open.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function markManualScroll() {
    lastManualScrollRef.current = Date.now()
  }

  function stepMatch(direction: 1 | -1) {
    if (matches.length === 0) return
    setMatchPosition((currentMatch + direction + matches.length) % matches.length)
  }

  function clearSearch() {
    setQuery('')
    setMatchPosition(0)
    searchRef.current?.focus()
  }

  let body
  if (isLoading) {
    body = <span className="yt-spinner" role="status" aria-label="Loading transcript" />
  } else if (failed) {
    body = <p className="transcript__message">The transcript couldn't be loaded. Try again later.</p>
  } else if (lines.length === 0) {
    body = <p className="transcript__message">This video doesn't have a transcript.</p>
  } else {
    body = lines.map((line, index) => {
      const isMatch = searchText !== '' && matches.includes(index)
      const classes = [
        'transcript__line',
        isMatch ? 'transcript__line--match' : '',
        index === currentLine ? 'transcript__line--current-match' : '',
      ]
      return (
        <button
          key={`${line.start}-${index}`}
          type="button"
          className={classes.filter(Boolean).join(' ')}
          data-line={index}
          aria-current={index === activeIndex ? 'true' : undefined}
          onClick={() => onSeek(line.start)}
        >
          {showTimestamps ? (
            <span className="transcript__time">{formatClock(line.start)}</span>
          ) : null}
          <span className="transcript__text">
            {splitMatches(line.text, searchText).map((part, partIndex) =>
              part.match ? <mark key={partIndex}>{part.text}</mark> : part.text,
            )}
          </span>
        </button>
      )
    })
  }

  const hasTranscript = !isLoading && !failed && lines.length > 0
  let resultLabel = ''
  if (searchText && hasTranscript) {
    resultLabel = matches.length > 0 ? `${currentMatch + 1} of ${matches.length}` : 'No results'
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

      <div className="transcript__search" role="search">
        <label className="transcript__search-field">
          <SearchIcon className="transcript__search-icon" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder="Search transcript"
            aria-label="Search transcript"
            autoComplete="off"
            spellCheck={false}
            disabled={!hasTranscript}
            onChange={(event) => {
              setQuery(event.target.value)
              setMatchPosition(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                stepMatch(event.shiftKey ? -1 : 1)
              } else if (event.key === 'Escape' && query) {
                event.preventDefault()
                event.stopPropagation()
                clearSearch()
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="transcript__search-clear"
              onClick={clearSearch}
              aria-label="Clear search"
              title="Clear search"
            >
              <CloseIcon className="transcript__search-clear-icon" />
            </button>
          ) : null}
        </label>
        <span
          className={`transcript__count ${resultLabel === 'No results' ? 'transcript__count--empty' : ''}`}
          role="status"
          aria-live="polite"
        >
          {resultLabel}
        </span>
        <button
          type="button"
          className="yt-icon-button transcript__step"
          onClick={() => stepMatch(-1)}
          disabled={matches.length === 0}
          aria-label="Previous result"
          title="Previous result (Shift+Enter)"
        >
          <ArrowUpIcon className="yt-icon" />
        </button>
        <button
          type="button"
          className="yt-icon-button transcript__step"
          onClick={() => stepMatch(1)}
          disabled={matches.length === 0}
          aria-label="Next result"
          title="Next result (Enter)"
        >
          <ArrowDownIcon className="yt-icon" />
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
