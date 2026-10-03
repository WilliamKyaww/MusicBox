import { useState, type DragEvent, type ReactNode } from 'react'
import { artistPath } from '../experience'
import { navigate } from '../router'
import type { VideoSearchResult } from '../types'
import { MusicIcon } from './MusicIcon'
import { startTrackDrag } from './helpers'
import { useMusic, type PlaySource, type TrackMenuExtras } from './MusicContext'
import { getPlaybackControls, usePlayback } from './playback'
import { formatAdded, formatCount } from './recommend'
import { Artwork, Equalizer, LikeButton } from './ui'

type Column = 'added' | 'plays'

export function ArtistLink({ video }: { video: VideoSearchResult }) {
  return (
    <button
      type="button"
      className="music-link music-track__artist"
      onClick={(event) => {
        event.stopPropagation()
        navigate(artistPath(video.channel_id, video.id))
      }}
    >
      {video.channel_title}
    </button>
  )
}

export function TrackList({
  tracks,
  source,
  columns = [],
  addedAt,
  plays,
  compact = false,
  onReorder,
  menuExtras,
  empty,
  label = 'Songs',
  addedLabel = 'Date added',
  playsLabel = 'Views',
}: {
  tracks: VideoSearchResult[]
  source: PlaySource
  columns?: Column[]
  addedAt?: (video: VideoSearchResult, index: number) => string | null | undefined
  plays?: (video: VideoSearchResult) => number | null | undefined
  compact?: boolean
  /** Enables drag-and-drop reordering (from and to are list indices). */
  onReorder?: (from: number, to: number) => void
  menuExtras?: (video: VideoSearchResult, index: number) => TrackMenuExtras
  empty?: ReactNode
  label?: string
  addedLabel?: string
  playsLabel?: string
}) {
  const music = useMusic()
  const currentId = usePlayback((state) => state.videoId)
  const isPlaying = usePlayback((state) => state.isPlaying)
  const [selected, setSelected] = useState<number | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  function play(index: number) {
    music.play(tracks, index, source)
  }

  function playOrToggle(index: number) {
    if (tracks[index]?.id === currentId) getPlaybackControls()?.toggle()
    else play(index)
  }

  function dropIndex(event: DragEvent, index: number) {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index
  }

  if (!tracks.length) return <>{empty ?? null}</>

  return (
    <div
      className={`music-tracks ${compact ? 'music-tracks--compact' : ''} ${
        columns.length ? `music-tracks--cols-${columns.length}` : ''
      }`}
      role="list"
      aria-label={label}
    >
      <div className="music-track music-track--head" aria-hidden="true">
        <span>#</span>
        <span>Title</span>
        {columns.includes('added') ? <span className="music-track__col">{addedLabel}</span> : null}
        {columns.includes('plays') ? <span className="music-track__col">{playsLabel}</span> : null}
        <span />
        <span className="music-track__duration">
          <MusicIcon name="clock" />
        </span>
        <span />
      </div>
      {tracks.map((video, index) => {
        const active = video.id === currentId
        const extras = menuExtras?.(video, index)
        return (
          <div
            key={`${video.id}-${index}`}
            role="listitem"
            className={`music-track ${active ? 'music-track--active' : ''} ${
              selected === index ? 'is-selected' : ''
            } ${dropAt === index ? 'drop-before' : ''} ${
              dropAt === index + 1 && index === tracks.length - 1 ? 'drop-after' : ''
            }`}
            draggable
            onDragStart={(event) => {
              startTrackDrag(event, video)
              if (onReorder) setDragFrom(index)
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setDropAt(null)
            }}
            onDragOver={(event) => {
              if (!onReorder || dragFrom === null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropAt(dropIndex(event, index))
            }}
            onDrop={(event) => {
              if (!onReorder || dragFrom === null) return
              event.preventDefault()
              const target = dropIndex(event, index)
              const to = target > dragFrom ? target - 1 : target
              if (to !== dragFrom) onReorder(dragFrom, to)
              setDragFrom(null)
              setDropAt(null)
            }}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) return
              // Touch screens play on tap, as in the Spotify mobile app.
              if (window.matchMedia('(pointer: coarse)').matches) play(index)
              else setSelected(index)
            }}
            onDoubleClick={(event) => {
              if (!(event.target as HTMLElement).closest('button')) play(index)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              setSelected(index)
              music.openTrackMenu(video, { x: event.clientX, y: event.clientY }, extras)
            }}
          >
            <span className="music-track__index">
              <button
                type="button"
                className="music-track__play"
                aria-label={`${active && isPlaying ? 'Pause' : 'Play'} ${video.title}`}
                onClick={() => playOrToggle(index)}
              >
                <span className="music-track__number">
                  {active ? <Equalizer playing={isPlaying} /> : index + 1}
                </span>
                <MusicIcon name={active && isPlaying ? 'pause' : 'play'} filled />
              </button>
            </span>
            <div className="music-track__main">
              {compact ? null : <Artwork src={video.thumbnail_url} name={video.title} />}
              <div className="music-track__text">
                <button
                  type="button"
                  className="music-track__title"
                  onClick={() => play(index)}
                  title={video.title}
                >
                  {video.title}
                </button>
                <ArtistLink video={video} />
              </div>
            </div>
            {columns.includes('added') ? (
              <span className="music-track__col">
                {formatAdded(addedAt?.(video, index))}
              </span>
            ) : null}
            {columns.includes('plays') ? (
              <span className="music-track__col">{formatCount(plays?.(video))}</span>
            ) : null}
            <LikeButton video={video} onToast={music.toast} className="music-track__like" />
            <span className="music-track__duration">{video.duration_label || '--:--'}</span>
            <button
              type="button"
              className="music-icon-button music-track__more"
              aria-label={`More options for ${video.title}`}
              aria-haspopup="menu"
              onClick={(event) => {
                setSelected(index)
                music.openTrackMenu(
                  video,
                  event.currentTarget.getBoundingClientRect(),
                  extras,
                )
              }}
            >
              <MusicIcon name="more" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
