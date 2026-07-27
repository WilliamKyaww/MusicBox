import { apiFetchJson, getApiHref } from './client'
import type {
  DownloadJob,
  DownloadListResponse,
  DownloadOptions,
  EnqueueDownloadResponse,
  RemoveDownloadResponse,
  VideoSearchResult,
} from '../types'

export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  mediaKind: 'audio',
  videoQuality: 'best',
  destination: 'library',
  section: { startSeconds: 0, endSeconds: null },
}

export async function fetchDownloads(signal?: AbortSignal) {
  return apiFetchJson<DownloadListResponse>('/api/downloads', {
    method: 'GET',
    signal,
  })
}

export async function enqueueDownload(
  video: VideoSearchResult,
  options: DownloadOptions = DEFAULT_DOWNLOAD_OPTIONS,
) {
  return apiFetchJson<EnqueueDownloadResponse>('/api/downloads', {
    method: 'POST',
    body: JSON.stringify({
      video_id: video.id,
      title: video.title,
      channel_title: video.channel_title,
      thumbnail_url: video.thumbnail_url,
      source_url: video.video_url,
      media_kind: options.mediaKind,
      video_quality: options.videoQuality,
      section: {
        start_seconds: options.section.startSeconds,
        end_seconds: options.section.endSeconds,
      },
    }),
  })
}

export async function removeDownload(downloadId: string, deleteFile = true) {
  return apiFetchJson<RemoveDownloadResponse>(
    `/api/downloads/${downloadId}?delete_file=${deleteFile ? 'true' : 'false'}`,
    {
      method: 'DELETE',
    },
  )
}

export async function renameDownload(downloadId: string, title: string) {
  return apiFetchJson<DownloadJob>(`/api/downloads/${downloadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export async function redownloadDownload(downloadId: string) {
  return apiFetchJson<EnqueueDownloadResponse>(
    `/api/downloads/${downloadId}/redownload`,
    {
      method: 'POST',
    },
  )
}

export function getDownloadFileHref(downloadId: string) {
  return getApiHref(`/api/downloads/${downloadId}/file`)
}

export function getDownloadThumbnailHref(downloadId: string) {
  return getApiHref(`/api/downloads/${downloadId}/thumbnail`)
}

/**
 * Build the URL that downloads media straight to the device. The backend renders
 * the file on demand and streams it back as an attachment, so this is meant to be
 * used as an anchor href rather than fetched into memory.
 */
export function getDirectDownloadHref(
  video: VideoSearchResult,
  options: DownloadOptions,
) {
  const params = new URLSearchParams({
    video_id: video.id,
    title: video.title,
    channel_title: video.channel_title,
    source_url: video.video_url,
    media_kind: options.mediaKind,
    video_quality: options.videoQuality,
    start_seconds: String(options.section.startSeconds),
  })

  if (options.section.endSeconds !== null) {
    params.set('end_seconds', String(options.section.endSeconds))
  }

  return getApiHref(`/api/downloads/direct?${params.toString()}`)
}

export function getVideoThumbnailHref(
  videoId: string,
  title = '',
  thumbnailUrl: string | null = null,
) {
  const params = new URLSearchParams({ title })

  if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) {
    params.set('thumbnail_url', thumbnailUrl)
  }

  return getApiHref(`/api/thumbnails/${videoId}?${params.toString()}`)
}
