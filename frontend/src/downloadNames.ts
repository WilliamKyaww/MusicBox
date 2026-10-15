/**
 * File names for downloads. These mirror the backend's rules (`_section_suffix`
 * and `_sanitize_filename` in `downloads.py`) so the name shown in the download
 * dialog is the name the file really gets.
 */

import type { DownloadSection, MediaKind } from './types'

export const MAX_FILE_NAME_LENGTH = 120

function clock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** The fragment appended to a clip's name so clips of one video stay distinguishable. */
export function sectionSuffix(section: DownloadSection) {
  const { startSeconds, endSeconds } = section
  if (startSeconds === 0 && endSeconds === null) return ''
  if (startSeconds === 0) return ` (first ${clock(endSeconds ?? 0)})`
  if (endSeconds === null) return ` (from ${clock(startSeconds)})`
  return ` (${clock(startSeconds)}-${clock(endSeconds)})`
}

/** Removes what Windows file names can't hold and trims the result to a sensible length. */
export function sanitizeFileName(value: string) {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH).trim()
}

export function fileExtension(mediaKind: MediaKind) {
  return mediaKind === 'video' ? 'mp4' : 'mp3'
}
