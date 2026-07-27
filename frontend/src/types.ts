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
}

export type SearchResponse = {
  query: string
  total: number
  items: VideoSearchResult[]
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

export type VideoQuality = 'best' | '1080' | '720' | '480' | '360'

export type DownloadDestination = 'library' | 'device'

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
