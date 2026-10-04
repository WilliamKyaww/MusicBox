import { useState } from 'react'
import { parseTimecode } from '../downloadSections'
import { formatClock, formatPreciseClock } from '../format'
import { CloseIcon, DownloadIcon, PlayIcon, ScissorsIcon } from '../components/Icons'
import type { ClipRange } from '../types'

type ClipPanelProps = {
  clip: ClipRange
  duration: number
  onChange: (clip: ClipRange) => void
  getCurrentTime: () => number
  onPreview: () => void
  onDownload: () => void
  onClose: () => void
}

type TimeFieldProps = {
  label: string
  value: number
  onCommit: (seconds: number) => void
  onUseCurrent: () => void
  shortcut: string
}

function TimeField({ label, value, onCommit, onUseCurrent, shortcut }: TimeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  function commit() {
    if (draft === null) return
    const trimmed = draft.trim()
    // Allow a fractional part such as 1:02.5 for frame-accurate starts.
    const [whole, fraction = ''] = trimmed.split('.')
    const seconds = parseTimecode(whole)
    if (seconds === null || (fraction && !/^\d+$/.test(fraction))) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    onCommit(seconds + (fraction ? Number(`0.${fraction}`) : 0))
  }

  return (
    <div className="clip-panel__field">
      <label>
        <span>{label}</span>
        <input
          type="text"
          inputMode="decimal"
          value={draft ?? formatPreciseClock(value)}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') {
              setDraft(null)
              setInvalid(false)
            }
          }}
        />
      </label>
      <button type="button" className="yt-chip" onClick={onUseCurrent} title={`Shortcut: ${shortcut}`}>
        Set to current time <kbd>{shortcut}</kbd>
      </button>
    </div>
  )
}

/**
 * Picks the section of the video to download. The same range is drawn on the
 * seek bar with draggable handles, so it can be set by typing, by marking the
 * current playback time, or by dragging.
 */
export function ClipPanel({
  clip,
  duration,
  onChange,
  getCurrentTime,
  onPreview,
  onDownload,
  onClose,
}: ClipPanelProps) {
  const length = Math.max(0, clip.end - clip.start)

  function setStart(seconds: number) {
    const start = Math.min(Math.max(0, seconds), duration)
    onChange({ start, end: start < clip.end ? clip.end : Math.min(duration, start + 10) })
  }

  function setEnd(seconds: number) {
    const end = Math.min(Math.max(0, seconds), duration)
    onChange({ start: end > clip.start ? clip.start : Math.max(0, end - 10), end })
  }

  return (
    <section className="clip-panel" aria-label="Download a section">
      <header className="clip-panel__header">
        <ScissorsIcon className="yt-icon" />
        <div>
          <h2>Download a Section</h2>
          <p>
            Drag the blue handles on the progress bar, type a time, or mark the spot while
            watching.
          </p>
        </div>
        <button type="button" className="yt-icon-button" onClick={onClose} aria-label="Close">
          <CloseIcon className="yt-icon" />
        </button>
      </header>

      <div className="clip-panel__fields">
        <TimeField
          label="Start"
          value={clip.start}
          onCommit={setStart}
          onUseCurrent={() => setStart(getCurrentTime())}
          shortcut="["
        />
        <TimeField
          label="End"
          value={clip.end}
          onCommit={setEnd}
          onUseCurrent={() => setEnd(getCurrentTime())}
          shortcut="]"
        />
      </div>

      <footer className="clip-panel__footer">
        <span className="clip-panel__length">
          Section length <strong>{formatClock(length)}</strong>
        </span>
        <div className="clip-panel__actions">
          <button type="button" className="yt-pill" onClick={onPreview}>
            <PlayIcon className="yt-icon" />
            Preview
          </button>
          <button
            type="button"
            className="yt-pill yt-pill--primary"
            onClick={onDownload}
            disabled={length < 1}
          >
            <DownloadIcon className="yt-icon" />
            Download section…
          </button>
        </div>
      </footer>
    </section>
  )
}
