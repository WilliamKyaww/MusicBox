import { useEffect, useRef } from 'react'
import { paths } from '../router'
import { activeLineIndex } from './lyrics'
import { MusicIcon } from './MusicIcon'
import { getPlaybackControls, usePlayback } from './playback'
import { useLyrics } from './useLyrics'

/** Synced lines: the sung line is bright, earlier ones dim, and clicking a line seeks to it. */
export function LyricsLines({
  videoId,
  variant = 'page',
}: {
  videoId: string
  variant?: 'page' | 'card' | 'fullscreen'
}) {
  const lyrics = useLyrics(videoId)
  const time = usePlayback((state) => (state.videoId === videoId ? state.currentTime : 0))
  const active = activeLineIndex(lyrics.lines, time)
  const listRef = useRef<HTMLOListElement>(null)
  const userScrolledAt = useRef(0)

  useEffect(() => {
    if (variant === 'card' || active < 0) return
    if (Date.now() - userScrolledAt.current < 3000) return
    const line = listRef.current?.children[active] as HTMLElement | undefined
    line?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active, variant])

  if (lyrics.isLoading)
    return (
      <p className="music-lyrics__status" role="status">
        Loading lyrics...
      </p>
    )
  if (lyrics.unavailable || lyrics.error || !lyrics.lines.length)
    return (
      <div className="music-lyrics__status">
        <MusicIcon name="mic" />
        <p>
          {lyrics.error && !lyrics.unavailable
            ? lyrics.error
            : "Lyrics aren't available for this song."}
        </p>
        {variant === 'page' ? (
          <a className="music-button" href={paths.watch(videoId)}>
            Watch the video instead
          </a>
        ) : null}
      </div>
    )

  const shown =
    variant === 'card'
      ? lyrics.lines.slice(Math.max(0, active - 1), Math.max(0, active - 1) + 6)
      : lyrics.lines
  const offset = variant === 'card' ? Math.max(0, active - 1) : 0
  return (
    <>
      {lyrics.track?.auto_generated && variant !== 'card' ? (
        <p className="music-lyrics__note">
          From auto-generated captions, so some words may be wrong.
        </p>
      ) : null}
      <ol
        ref={listRef}
        className={`music-lyrics__lines music-lyrics__lines--${variant}`}
        onWheel={() => {
          userScrolledAt.current = Date.now()
        }}
        onTouchMove={() => {
          userScrolledAt.current = Date.now()
        }}
      >
        {shown.map((line, index) => {
          const position = index + offset
          return (
            <li
              key={`${line.start}-${position}`}
              className={
                position === active ? 'is-active' : position < active ? 'is-past' : ''
              }
            >
              <button
                type="button"
                onClick={() => getPlaybackControls()?.seek(line.start)}
              >
                {line.text}
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}
