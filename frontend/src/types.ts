export type VideoSearchResult = {
  id: string
  title: string
  channel_title: string
  channel_id: string
  description: string
  thumbnail_url: string
  duration_iso: string
  duration_label: string
  published_at: string
  video_url: string
  duration_seconds?: number | null
  view_count?: number | null
  channel_thumbnail_url?: string | null
  live_status?: LiveStatus
  is_short?: boolean
}

export type LiveStatus = 'none' | 'is_live' | 'was_live' | 'is_upcoming'

export type ChannelSearchResult = {
  id: string
  title: string
  description: string
  thumbnail_url: string | null
  handle: string | null
  subscriber_count: number | null
  video_count: number | null
}

export type SearchResponse = {
  query: string
  total: number
  items: VideoSearchResult[]
  channels: ChannelSearchResult[]
  next_page_token: string | null
}

export type SearchOrder = 'relevance' | 'date' | 'viewCount' | 'rating'
export type SearchDuration = 'any' | 'short' | 'medium' | 'long'
export type SearchUploadDate = 'any' | 'hour' | 'today' | 'week' | 'month' | 'year'

export type SearchFilters = {
  order: SearchOrder
  duration: SearchDuration
  uploadDate: SearchUploadDate
}

export type FeedResponse = {
  items: VideoSearchResult[]
  available: boolean
  message: string | null
}

export type ChannelTab = 'videos' | 'shorts' | 'live' | 'playlists'

export type ChannelInfo = {
  id: string
  name: string
  handle: string | null
  description: string
  avatar_url: string | null
  banner_url: string | null
  subscriber_count: number | null
  url: string
  is_verified: boolean
}

export type PlaylistSummary = {
  id: string
  title: string
  thumbnail_url: string | null
  video_count: number | null
  channel_title: string | null
}

export type ChannelPage = {
  channel: ChannelInfo
  tab: ChannelTab
  tab_available: boolean
  page: number
  has_more: boolean
  videos: VideoSearchResult[]
  playlists: PlaylistSummary[]
}

export type YouTubePlaylistPage = {
  id: string
  title: string
  description: string
  channel_title: string | null
  channel_id: string | null
  thumbnail_url: string | null
  video_count: number | null
  view_count: number | null
  page: number
  has_more: boolean
  items: VideoSearchResult[]
}

export type Chapter = {
  title: string
  start_seconds: number
  end_seconds: number
}

export type HeatmapPoint = {
  start_seconds: number
  end_seconds: number
  value: number
}

export type QualityOption = {
  id: string
  label: string
  height: number
  fps: number
}

export type CaptionTrack = {
  lang: string
  name: string
  auto_generated: boolean
}

export type Storyboard = {
  urls: string[]
  width: number
  height: number
  rows: number
  columns: number
  interval_seconds: number
}

export type VideoDetails = {
  id: string
  title: string
  description: string
  channel_id: string
  channel_title: string
  channel_handle: string | null
  channel_thumbnail_url: string | null
  channel_subscriber_count: number | null
  channel_is_verified: boolean
  thumbnail_url: string
  video_url: string
  duration_seconds: number | null
  duration_label: string
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  published_at: string
  live_status: LiveStatus
  width: number | null
  height: number | null
  tags: string[]
  category: string | null
  chapters: Chapter[]
  heatmap: HeatmapPoint[]
  qualities: QualityOption[]
  captions: CaptionTrack[]
  storyboard: Storyboard | null
  local_video_url: string | null
  embeddable: boolean
}

export type VideoComment = {
  id: string
  author: string
  author_thumbnail_url: string | null
  author_channel_id: string | null
  text: string
  like_count: number
  published_at: string
  reply_count: number
  is_pinned: boolean
  is_uploader: boolean
}

export type CommentsResponse = {
  items: VideoComment[]
  next_page_token: string | null
  disabled: boolean
  total: number | null
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'completed'
  | 'failed'

export type DownloadRuntimeStatus = {
  available: boolean
  missing_dependencies: string[]
  downloads_directory: string
}

export type MediaKind = 'audio' | 'video'

export type VideoQuality = 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360'

export type DownloadDestination = 'library' | 'device'

/** A section of a video picked on the watch page, in (fractional) seconds. */
export type ClipRange = {
  start: number
  end: number
}

export type DownloadSection = {
  startSeconds: number
  endSeconds: number | null
}

export type DownloadOptions = {
  mediaKind: MediaKind
  videoQuality: VideoQuality
  destination: DownloadDestination
  section: DownloadSection
}

export type DownloadJob = {
  id: string
  video_id: string
  title: string
  channel_title: string
  thumbnail_url: string | null
  source_url: string
  status: DownloadStatus
  status_detail: string | null
  progress_percent: number
  created_at: string
  updated_at: string
  error_message: string | null
  file_name: string | null
  file_size_bytes: number | null
  download_path: string | null
  thumbnail_path: string | null
  media_kind: MediaKind
  video_quality: VideoQuality
  section_start_seconds: number
  section_end_seconds: number | null
}

export type DownloadListResponse = {
  runtime: DownloadRuntimeStatus
  items: DownloadJob[]
}

export type EnqueueDownloadResponse = {
  job: DownloadJob
  deduplicated: boolean
}

export type RemoveDownloadResponse = {
  removed_job_id: string
  deleted_file: boolean
}

export type PlaylistItem = {
  id: string
  video_id: string
  title: string
  channel_title: string
  thumbnail_url: string | null
  source_url: string
  duration_label: string | null
  added_at: string
  position: number
}

export type Playlist = {
  id: string
  name: string
  created_at: string
  updated_at: string
  items: PlaylistItem[]
}

export type PlaylistListResponse = {
  items: Playlist[]
}

export type PlaylistExportStatus =
  | 'queued'
  | 'preparing'
  | 'packaging'
  | 'completed'
  | 'failed'

export type PlaylistExportFormat = 'zip' | 'combined_mp3'

export type PlaylistExportJob = {
  id: string
  playlist_id: string
  playlist_name: string
  export_format: PlaylistExportFormat
  status: PlaylistExportStatus
  status_detail: string | null
  progress_percent: number
  created_at: string
  updated_at: string
  item_count: number
  completed_item_count: number
  file_name: string | null
  file_size_bytes: number | null
  download_path: string | null
  error_message: string | null
}

export type PlaylistExportListResponse = {
  items: PlaylistExportJob[]
}

export type SpotifyPreviewTrack = {
  spotify_track_id: string
  title: string
  artists: string[]
  album: string | null
  duration_ms: number | null
}

export type SpotifyPlaylistPreview = {
  playlist_id: string
  playlist_name: string
  playlist_owner: string | null
  playlist_url: string
  total_tracks: number
  preview_tracks: SpotifyPreviewTrack[]
}

export type DiscordPresenceStatus = {
  enabled: boolean
  configured: boolean
  available: boolean
  connected: boolean
  active: boolean
  last_error: string | null
}
