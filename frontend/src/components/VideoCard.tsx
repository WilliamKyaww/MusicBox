import { formatRelativeTime, formatViews, joinMeta } from '../format'
import { paths } from '../router'
import { ChannelAvatar } from './ChannelAvatar'
import { VideoActionsMenu } from './VideoActionsMenu'
import { VideoThumbnail } from './VideoThumbnail'
import type { VideoSearchResult } from '../types'

type VideoCardProps = {
  video: VideoSearchResult
  onOpen?: () => void
  showChannel?: boolean
  listId?: string | null
}

/** Grid card used on the home feed, channel tabs and subscriptions. */
export function VideoCard({ video, onOpen, showChannel = true, listId = null }: VideoCardProps) {
  const href = paths.watch(video.id, { listId })
  const channelLink = video.channel_id ? paths.channel(video.channel_id) : null
  const isLive = video.live_status === 'is_live'
  const meta = joinMeta(
    formatViews(video.view_count, isLive),
    video.live_status === 'is_upcoming' ? 'Upcoming' : formatRelativeTime(video.published_at),
  )

  return (
    <article className="yt-card">
      <VideoThumbnail video={video} href={href} onOpen={onOpen} />
      <div className="yt-card__details">
        {showChannel ? (
          <ChannelAvatar
            name={video.channel_title}
            url={video.channel_thumbnail_url}
            href={channelLink}
          />
        ) : null}
        <div className="yt-card__text">
          <h3 className="yt-card__title">
            <a href={href} onClick={onOpen} title={video.title}>
              {video.title}
            </a>
          </h3>
          {showChannel ? (
            channelLink ? (
              <a className="yt-card__channel" href={channelLink}>
                {video.channel_title}
              </a>
            ) : (
              <span className="yt-card__channel">{video.channel_title}</span>
            )
          ) : null}
          {meta ? <p className="yt-card__meta">{meta}</p> : null}
          {isLive ? <span className="yt-live-pill">LIVE</span> : null}
        </div>
        <VideoActionsMenu video={video} />
      </div>
    </article>
  )
}
