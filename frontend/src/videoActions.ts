import { createContext, useContext } from 'react'
import type {
  DownloadJob,
  DownloadSection,
  PlaylistExportFormat,
  VideoDetails,
  VideoSearchResult,
} from './types'

/** The list a video was opened from; it becomes the watch page's "Up next". */
export type WatchQueue = {
  label: string
  items: VideoSearchResult[]
}

export type VideoActions = {
  openDownload: (video: VideoSearchResult, section?: DownloadSection) => void
  openSaveToPlaylist: (video: VideoSearchResult) => void
  playAudio: (video: VideoSearchResult) => void
  setWatchQueue: (queue: WatchQueue | null) => void
  pushToast: (message: string) => void
  getLatestDownload: (videoId: string) => DownloadJob | null
  exportYouTubePlaylist: (playlistUrl: string, format: PlaylistExportFormat) => void
  isExportingYouTubePlaylist: boolean
}

export const VideoActionsContext = createContext<VideoActions | null>(null)

export function useVideoActions() {
  const actions = useContext(VideoActionsContext)
  if (!actions) {
    throw new Error('useVideoActions must be used inside VideoActionsContext.')
  }
  return actions
}

export function detailsToVideo(details: VideoDetails): VideoSearchResult {
  return {
    id: details.id,
    title: details.title,
    channel_title: details.channel_title,
    channel_id: details.channel_id,
    description: details.description,
    thumbnail_url: details.thumbnail_url,
    duration_iso: '',
    duration_label: details.duration_label,
    duration_seconds: details.duration_seconds,
    published_at: details.published_at,
    video_url: details.video_url,
    view_count: details.view_count,
    channel_thumbnail_url: details.channel_thumbnail_url,
    live_status: details.live_status,
  }
}
