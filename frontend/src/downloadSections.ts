/** Helpers for the "download only part of a video" section picker. */

import { formatClock } from './format'

/** Accepts `90`, `1:30` or `1:02:03` and returns seconds, or null when unparseable. */
export function parseTimecode(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parts = trimmed.split(':')
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part.trim()))) {
    return null
  }

  return parts.reduce((total, part) => total * 60 + Number(part.trim()), 0)
}

export function formatSectionLabel(
  startSeconds: number,
  endSeconds: number | null,
) {
  if (startSeconds === 0 && endSeconds === null) {
    return 'Whole video'
  }
  if (startSeconds === 0 && endSeconds !== null) {
    return `First ${formatClock(endSeconds)}`
  }
  if (endSeconds === null) {
    return `From ${formatClock(startSeconds)}`
  }

  return `${formatClock(startSeconds)} – ${formatClock(endSeconds)}`
}
