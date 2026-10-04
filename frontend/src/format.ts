/** Display formatting that mirrors how YouTube labels counts, dates and times. */

// British English formatting throughout, e.g. "3 Oct 2026".
const LOCALE = 'en-GB'

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const fullFormatter = new Intl.NumberFormat(LOCALE)

export function formatCompact(value: number) {
  return compactFormatter.format(value)
}

export function formatViews(viewCount: number | null | undefined, live = false) {
  if (viewCount === null || viewCount === undefined) return null
  const noun = live ? 'watching' : viewCount === 1 ? 'view' : 'views'
  return `${formatCompact(viewCount)} ${noun}`
}

export function formatFullViews(viewCount: number | null | undefined) {
  if (viewCount === null || viewCount === undefined) return null
  return `${fullFormatter.format(viewCount)} views`
}

export function formatSubscribers(count: number | null | undefined) {
  if (count === null || count === undefined) return null
  return `${formatCompact(count)} subscriber${count === 1 ? '' : 's'}`
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

export function formatRelativeTime(isoDate: string | null | undefined, now = Date.now()) {
  if (!isoDate) return null
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return null

  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000))
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (elapsedSeconds >= seconds || unit === 'second') {
      const amount = Math.max(1, Math.floor(elapsedSeconds / seconds))
      return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`
    }
  }
  return null
}

export function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return null
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp).toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** `75` -> `1:15`, `3725` -> `1:02:05`. */
export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const paddedSeconds = String(seconds).padStart(2, '0')

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`
}

/** Like `formatClock` but with tenths, used for precise clip boundaries. */
export function formatPreciseClock(totalSeconds: number) {
  const tenths = Math.floor((Math.max(0, totalSeconds) % 1) * 10)
  return `${formatClock(totalSeconds)}.${tenths}`
}

/** Joins the non-empty parts of a metadata line with YouTube's middle dot. */
export function joinMeta(...parts: (string | null | undefined | false)[]) {
  return parts.filter(Boolean).join(' • ')
}

/** `1536` -> `1.5 KB`; null when the size is unknown. */
export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
