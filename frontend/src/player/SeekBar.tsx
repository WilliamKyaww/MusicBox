import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatClock } from '../format'
import type { Chapter, ClipRange, HeatmapPoint, Storyboard } from '../types'

type SeekBarProps = {
  duration: number
  currentTime: number
  bufferedEnd: number
  chapters: Chapter[]
  heatmap: HeatmapPoint[]
  storyboard: Storyboard | null
  clip: ClipRange | null
  onSeek: (seconds: number) => void
  onScrub: (seconds: number | null) => void
  onClipChange?: (clip: ClipRange) => void
}

type DragTarget = 'seek' | 'clip-start' | 'clip-end'

const PREVIEW_WIDTH = 160
const MIN_CLIP_SECONDS = 0.5

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function StoryboardFrame({ storyboard, time }: { storyboard: Storyboard; time: number }) {
  const perSheet = storyboard.rows * storyboard.columns
  const frame = Math.max(0, Math.floor(time / storyboard.interval_seconds))
  const sheet = Math.min(storyboard.urls.length - 1, Math.floor(frame / perSheet))
  const cell = frame - sheet * perSheet
  const column = cell % storyboard.columns
  const row = Math.min(storyboard.rows - 1, Math.floor(cell / storyboard.columns))
  const scale = PREVIEW_WIDTH / storyboard.width

  return (
    <span
      className="yt-seek__frame"
      style={{
        width: PREVIEW_WIDTH,
        height: Math.round(storyboard.height * scale),
        backgroundImage: `url("${storyboard.urls[sheet].replace(/"/g, '%22')}")`,
        backgroundSize: `${storyboard.columns * PREVIEW_WIDTH}px ${
          storyboard.rows * storyboard.height * scale
        }px`,
        backgroundPosition: `-${column * PREVIEW_WIDTH}px -${row * storyboard.height * scale}px`,
      }}
    />
  )
}

function heatmapPath(points: HeatmapPoint[], duration: number) {
  if (points.length === 0 || duration <= 0) return null
  const coordinates = points.map((point) => {
    const middle = (point.start_seconds + point.end_seconds) / 2
    return `${((middle / duration) * 1000).toFixed(1)},${(100 - point.value * 100).toFixed(1)}`
  })
  return `M0,100 L${coordinates.join(' L')} L1000,100 Z`
}

export function SeekBar({
  duration,
  currentTime,
  bufferedEnd,
  chapters,
  heatmap,
  storyboard,
  clip,
  onSeek,
  onScrub,
  onClipChange,
}: SeekBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ target: DragTarget; time: number } | null>(null)

  const safeDuration = duration > 0 ? duration : 1
  const segments = useMemo(() => {
    const valid = chapters.filter((chapter) => chapter.end_seconds > chapter.start_seconds)
    return valid.length > 1
      ? valid
      : [{ title: '', start_seconds: 0, end_seconds: safeDuration }]
  }, [chapters, safeDuration])
  const heatPath = useMemo(() => heatmapPath(heatmap, safeDuration), [heatmap, safeDuration])

  function timeFromEvent(event: ReactPointerEvent) {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return clamp(((event.clientX - rect.left) / rect.width) * safeDuration, 0, safeDuration)
  }

  function startDrag(event: ReactPointerEvent, target: DragTarget) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const time = timeFromEvent(event)
    setDrag({ target, time })
    if (target === 'seek') onScrub(time)
  }

  function moveDrag(event: ReactPointerEvent) {
    const time = timeFromEvent(event)
    setHoverTime(time)
    if (!drag) return
    setDrag({ ...drag, time })
    if (drag.target === 'seek') {
      onScrub(time)
    } else if (clip && onClipChange) {
      onClipChange(
        drag.target === 'clip-start'
          ? { start: Math.min(time, clip.end - MIN_CLIP_SECONDS), end: clip.end }
          : { start: clip.start, end: Math.max(time, clip.start + MIN_CLIP_SECONDS) },
      )
    }
  }

  function endDrag(event: ReactPointerEvent) {
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.target === 'seek') {
      onSeek(timeFromEvent(event))
      onScrub(null)
    }
    setDrag(null)
  }

  const shownTime = drag?.target === 'seek' ? drag.time : currentTime
  const previewTime = drag ? drag.time : hoverTime
  const previewChapter =
    previewTime === null
      ? null
      : segments.find(
          (segment) => previewTime >= segment.start_seconds && previewTime < segment.end_seconds,
        )?.title
  // Keep the preview inside the player near either end of the bar.
  const previewLeft =
    previewTime === null
      ? undefined
      : `clamp(${PREVIEW_WIDTH / 2}px, ${(previewTime / safeDuration) * 100}%, calc(100% - ${
          PREVIEW_WIDTH / 2
        }px))`

  return (
    <div
      className={`yt-seek ${drag || hoverTime !== null ? 'yt-seek--active' : ''}`}
      onPointerDown={(event) => startDrag(event, 'seek')}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHoverTime(null)}
      role="slider"
      tabIndex={-1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.floor(safeDuration)}
      aria-valuenow={Math.floor(shownTime)}
      aria-valuetext={`${formatClock(shownTime)} of ${formatClock(safeDuration)}`}
    >
      {heatPath ? (
        <svg className="yt-seek__heatmap" viewBox="0 0 1000 100" preserveAspectRatio="none">
          <path d={heatPath} />
        </svg>
      ) : null}

      <div className="yt-seek__bar" ref={barRef}>
        {segments.map((segment) => {
          const left = (segment.start_seconds / safeDuration) * 100
          const width = ((segment.end_seconds - segment.start_seconds) / safeDuration) * 100
          const fill = (end: number) =>
            `${clamp(
              ((end - segment.start_seconds) / (segment.end_seconds - segment.start_seconds)) *
                100,
              0,
              100,
            )}%`
          const hovered =
            previewTime !== null &&
            previewTime >= segment.start_seconds &&
            previewTime < segment.end_seconds

          return (
            <div
              key={segment.start_seconds}
              className={`yt-seek__segment ${hovered ? 'yt-seek__segment--hover' : ''}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span className="yt-seek__buffered" style={{ width: fill(bufferedEnd) }} />
              {previewTime !== null ? (
                <span className="yt-seek__hover" style={{ width: fill(previewTime) }} />
              ) : null}
              <span className="yt-seek__played" style={{ width: fill(shownTime) }} />
            </div>
          )
        })}

        {clip ? (
          <>
            <span
              className="yt-seek__clip"
              style={{
                left: `${(clip.start / safeDuration) * 100}%`,
                width: `${((clip.end - clip.start) / safeDuration) * 100}%`,
              }}
            />
            {onClipChange ? (
              <>
                <span
                  className="yt-seek__clip-handle"
                  style={{ left: `${(clip.start / safeDuration) * 100}%` }}
                  onPointerDown={(event) => startDrag(event, 'clip-start')}
                  title={`Clip start ${formatClock(clip.start)}`}
                />
                <span
                  className="yt-seek__clip-handle yt-seek__clip-handle--end"
                  style={{ left: `${(clip.end / safeDuration) * 100}%` }}
                  onPointerDown={(event) => startDrag(event, 'clip-end')}
                  title={`Clip end ${formatClock(clip.end)}`}
                />
              </>
            ) : null}
          </>
        ) : null}

        <span
          className="yt-seek__thumb"
          style={{ left: `${(shownTime / safeDuration) * 100}%` }}
        />
      </div>

      {previewTime !== null ? (
        <div className="yt-seek__preview" style={{ left: previewLeft }}>
          {storyboard ? <StoryboardFrame storyboard={storyboard} time={previewTime} /> : null}
          {previewChapter ? <span className="yt-seek__chapter">{previewChapter}</span> : null}
          <span className="yt-seek__time">{formatClock(previewTime)}</span>
        </div>
      ) : null}
    </div>
  )
}
