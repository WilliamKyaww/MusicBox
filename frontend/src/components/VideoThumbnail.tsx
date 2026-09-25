import { useLibrary } from '../library'
import type { VideoSearchResult } from '../types'

type VideoThumbnailProps = {
  video: VideoSearchResult
  href: string
  onOpen?: () => void
  vertical?: boolean
}

export function VideoThumbnail({ video, href, onOpen, vertical = false }: VideoThumbnailProps) {
  const progress = useLibrary((state) => state.progress[video.id])
  const progressPercent =
    progress && progress.duration > 0
      ? Math.min(100, (progress.seconds / progress.duration) * 100)
      : 0

  const isLive = video.live_status === 'is_live'
  const isUpcoming = video.live_status === 'is_upcoming'
  const badge = isLive ? 'LIVE' : isUpcoming ? 'UPCOMING' : video.duration_label

  return (
    <a
      className={`yt-thumb ${vertical ? 'yt-thumb--vertical' : ''}`}
      href={href}
      onClick={onOpen}
      tabIndex={-1}
      aria-hidden="true"
    >
      <img src={video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      {badge && !vertical ? (
        <span
          className={`yt-thumb__badge ${isLive ? 'yt-thumb__badge--live' : ''} ${
            isUpcoming ? 'yt-thumb__badge--upcoming' : ''
          }`}
        >
          {badge}
        </span>
      ) : null}
      {progressPercent > 0 ? (
        <span className="yt-thumb__progress">
          <span style={{ width: `${progressPercent}%` }} />
        </span>
      ) : null}
    </a>
  )
}
