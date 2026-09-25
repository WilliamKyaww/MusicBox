import { useEffect, useRef } from 'react'
import { paths } from '../router'
import { VideoListItem } from '../components/VideoListItem'
import type { VideoSearchResult, YouTubePlaylistPage } from '../types'

type UpNextProps = {
  label: string
  videos: VideoSearchResult[]
  autoplay: boolean
  onToggleAutoplay: () => void
  isLoading: boolean
}

export function UpNext({ label, videos, autoplay, onToggleAutoplay, isLoading }: UpNextProps) {
  return (
    <section className="up-next" aria-label="Up next">
      <header className="up-next__header">
        <h2>{label}</h2>
        <button
          type="button"
          className="up-next__autoplay"
          onClick={onToggleAutoplay}
          aria-pressed={autoplay}
        >
          Autoplay
          <span className={`yt-switch ${autoplay ? 'yt-switch--on' : ''}`} aria-hidden="true" />
        </button>
      </header>
      {isLoading && videos.length === 0 ? <span className="yt-spinner" /> : null}
      <div className="up-next__list">
        {videos.map((video) => (
          <VideoListItem key={video.id} video={video} variant="compact" />
        ))}
      </div>
    </section>
  )
}

type WatchPlaylistPanelProps = {
  playlist: YouTubePlaylistPage
  currentVideoId: string
}

export function WatchPlaylistPanel({ playlist, currentVideoId }: WatchPlaylistPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const currentIndex = playlist.items.findIndex((video) => video.id === currentVideoId)

  // Keep the playing entry in view as the playlist advances.
  useEffect(() => {
    // The list is the offset parent (position: relative), so offsetTop is inside it.
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
    if (active && listRef.current) {
      listRef.current.scrollTop = active.offsetTop - 8
    }
  }, [currentVideoId])

  return (
    <section className="watch-playlist">
      <header className="watch-playlist__header">
        <h2>
          <a href={paths.playlist(playlist.id)}>{playlist.title}</a>
        </h2>
        <p>
          {playlist.channel_title ? `${playlist.channel_title} - ` : ''}
          {currentIndex >= 0 ? currentIndex + 1 : '–'} / {playlist.video_count ?? playlist.items.length}
        </p>
      </header>
      <div className="watch-playlist__list" ref={listRef}>
        {playlist.items.map((video, index) => (
          <VideoListItem
            key={video.id}
            video={video}
            variant="compact"
            listId={playlist.id}
            index={index + 1}
            isActive={video.id === currentVideoId}
          />
        ))}
      </div>
    </section>
  )
}
