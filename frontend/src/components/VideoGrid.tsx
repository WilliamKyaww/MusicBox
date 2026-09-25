import { useVideoActions } from '../videoActions'
import { VideoCard } from './VideoCard'
import type { VideoSearchResult } from '../types'

type VideoGridProps = {
  videos: VideoSearchResult[]
  queueLabel: string
  showChannel?: boolean
}

export function VideoGrid({ videos, queueLabel, showChannel = true }: VideoGridProps) {
  const { setWatchQueue } = useVideoActions()

  return (
    <div className="yt-grid">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          showChannel={showChannel}
          onOpen={() => setWatchQueue({ label: queueLabel, items: videos })}
        />
      ))}
    </div>
  )
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="yt-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="yt-card yt-card--skeleton" key={index}>
          <div className="yt-thumb shimmer" />
          <div className="yt-card__details">
            <span className="yt-avatar shimmer" style={{ width: 36, height: 36 }} />
            <div className="yt-card__text">
              <div className="line shimmer line--wide" />
              <div className="line shimmer line--medium" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
