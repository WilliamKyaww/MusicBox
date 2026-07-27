/** Helpers for the "download only part of a video" section picker. */

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

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const paddedSeconds = String(seconds).padStart(2, '0')

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`
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
