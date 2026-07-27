import { getVideoThumbnailHref } from '../api/downloads'
import { DownloadIcon, ImageIcon, PlayIcon, VideoIcon, YouTubeIcon } from './Icons'
import { PlaylistPicker } from './PlaylistPicker'
import type { DownloadJob, Playlist, VideoSearchResult } from '../types'

type VideoCardProps = {
  video: VideoSearchResult
  onDownload: (video: VideoSearchResult) => void
  onAddToPlaylists: (video: VideoSearchResult, playlistIds: string[]) => void
  onPlay?: (
    videoId: string,
    title: string,
    thumbnailUrl: string | null,
    channelTitle: string,
    sourceUrl: string,
    durationLabel: string | null,
  ) => void
  onWatch?: (video: VideoSearchResult) => void
  playlists: Playlist[]
  activePlaylistId: string | null
  isAddingToPlaylist: boolean
  isSubmittingDownload: boolean
  latestDownload: DownloadJob | null
}



export function VideoCard({
  video,
  onDownload,
  onAddToPlaylists,
  onPlay,
  onWatch,
  playlists,
  activePlaylistId,
  isAddingToPlaylist,
  isSubmittingDownload,
  latestDownload,
}: VideoCardProps) {
  const isDownloadBusy =
    isSubmittingDownload ||
    latestDownload?.status === 'queued' ||
    latestDownload?.status === 'downloading' ||
    latestDownload?.status === 'converting'

  return (
    <article className="video-card">
      <a
        className="video-card__thumbnail-link"
        href={video.video_url}
        target="_blank"
        rel="noreferrer"
      >
        <img
          className="video-card__thumbnail"
          src={video.thumbnail_url}
          alt={`Thumbnail for ${video.title}`}
          loading="lazy"
        />
        <span className="video-card__duration">{video.duration_label}</span>
      </a>

      <div className="video-card__body">
        <p className="video-card__channel">{video.channel_title}</p>
        <h3 className="video-card__title" title={video.title}>
          {video.title}
        </h3>
      </div>

      <div className="video-card__actions">
        <div className="video-card__action-cluster">
          {onPlay ? (
            <button
              className="video-card__icon-button video-card__icon-button--play"
              type="button"
              title="Play audio"
              aria-label="Play audio"
              onClick={() =>
                onPlay(
                  video.id,
                  video.title,
                  video.thumbnail_url,
                  video.channel_title,
                  video.video_url,
                  video.duration_label,
                )
              }
            >
              <PlayIcon className="action-icon" />
            </button>
          ) : null}
          {onWatch ? (
            <button
              className="video-card__icon-button video-card__icon-button--watch"
              type="button"
              title="Watch video in app"
              aria-label="Watch video in app"
              onClick={() => onWatch(video)}
            >
              <VideoIcon className="action-icon" />
            </button>
          ) : null}
          <a
            className="video-card__icon-button video-card__icon-button--youtube"
            href={video.video_url}
            target="_blank"
            rel="noreferrer"
            title="Open on YouTube"
            aria-label="Open on YouTube"
          >
            <YouTubeIcon className="action-icon" />
          </a>
        </div>

        <div className="video-card__action-cluster video-card__action-cluster--end">
          <a
            className="video-card__icon-button"
            href={getVideoThumbnailHref(video.id, video.title, video.thumbnail_url)}
            download
            title="Download thumbnail"
            aria-label="Download thumbnail"
          >
            <ImageIcon className="action-icon" />
          </a>
          <button
            className={`video-card__icon-button ${latestDownload ? `video-card__icon-button--${latestDownload.status}` : ''}`}
            type="button"
            disabled={isDownloadBusy}
            title={
              isDownloadBusy
                ? 'A download for this video is already running.'
                : 'Download audio or video'
            }
            aria-label="Download audio or video"
            onClick={() => onDownload(video)}
          >
            <DownloadIcon className="action-icon" />
          </button>
          <PlaylistPicker
            playlists={playlists}
            activePlaylistId={activePlaylistId}
            isSubmitting={isAddingToPlaylist}
            onSubmit={(playlistIds) => onAddToPlaylists(video, playlistIds)}
          />
        </div>
      </div>

    </article>
  )
}
