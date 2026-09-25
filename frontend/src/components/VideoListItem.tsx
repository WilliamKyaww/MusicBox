import { formatRelativeTime, formatViews, joinMeta } from '../format'
import { paths } from '../router'
import { ChannelAvatar } from './ChannelAvatar'
import { VideoActionsMenu } from './VideoActionsMenu'
import { VideoThumbnail } from './VideoThumbnail'
import type { VideoSearchResult } from '../types'

type VideoListItemProps = {
  video: VideoSearchResult
  variant?: 'large' | 'compact'
  onOpen?: () => void
  listId?: string | null
  index?: number
  isActive?: boolean
  onRemove?: () => void
  removeLabel?: string
}

/**
 * Horizontal row: `large` for search results and history, `compact` for the
 * watch page's up-next column and playlist panels.
 */
export function VideoListItem({
  video,
  variant = 'large',
  onOpen,
  listId = null,
  index,
  isActive = false,
  onRemove,
  removeLabel,
}: VideoListItemProps) {
  const href = paths.watch(video.id, { listId })
  const channelLink = video.channel_id ? paths.channel(video.channel_id) : null
  const isLive = video.live_status === 'is_live'
  const meta = joinMeta(
    formatViews(video.view_count, isLive),
    video.live_status === 'is_upcoming' ? 'Upcoming' : formatRelativeTime(video.published_at),
  )

  const channel = channelLink ? (
    <a className="yt-row__channel" href={channelLink}>
      {variant === 'large' ? (
        <ChannelAvatar name={video.channel_title} url={video.channel_thumbnail_url} size={24} />
      ) : null}
      {video.channel_title}
    </a>
  ) : (
    <span className="yt-row__channel">{video.channel_title}</span>
  )

  return (
    <article
      className={`yt-row yt-row--${variant} ${isActive ? 'yt-row--active' : ''}`}
      aria-current={isActive ? 'true' : undefined}
    >
      {index !== undefined ? <span className="yt-row__index">{isActive ? '▶' : index}</span> : null}
      <VideoThumbnail video={video} href={href} onOpen={onOpen} />
      <div className="yt-row__text">
        <h3 className="yt-row__title">
          <a href={href} onClick={onOpen} title={video.title}>
            {video.title}
          </a>
        </h3>
        {variant === 'large' ? (
          <>
            {meta ? <p className="yt-row__meta">{meta}</p> : null}
            {channel}
            {video.description ? (
              <p className="yt-row__description">{video.description}</p>
            ) : null}
          </>
        ) : (
          <>
            {channel}
            {meta ? <p className="yt-row__meta">{meta}</p> : null}
          </>
        )}
        {isLive ? <span className="yt-live-pill">LIVE</span> : null}
      </div>
      <VideoActionsMenu video={video} onRemove={onRemove} removeLabel={removeLabel} />
    </article>
  )
}
