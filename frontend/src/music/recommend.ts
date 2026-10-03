import type { VideoSearchResult } from '../types'

/**
 * Local stand-ins for Spotify's personalization: everything is derived from
 * this device's listening history, likes and play counts.
 */

export type HistoryLike = { video: VideoSearchResult }

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** A stable hue per name, standing in for Spotify's colours extracted from cover art. */
export function hueFor(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) | 0
  return Math.abs(hash) % 360
}

/** `3:45`, `1:02:03` or `LIVE` (0) to seconds. */
export function parseDuration(label: string | null | undefined) {
  if (!label || !/^\d+(:\d{1,2}){1,2}$/.test(label)) return 0
  return label
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0)
}

/** Spotify's collection summary: `25 min 13 sec`, or `about 2 hr 5 min` for long lists. */
export function formatTotalDuration(seconds: number) {
  if (seconds <= 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `about ${hours} hr${minutes ? ` ${minutes} min` : ''}`
  const rest = Math.floor(seconds % 60)
  return `${minutes} min${rest ? ` ${rest} sec` : ''}`
}

export function formatCount(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : ''
}

/** Spotify's "Date added" column: relative for recent dates, then the date itself. */
export function formatAdded(iso: string | null | undefined, now = new Date()) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (days < 1) return 'Today'
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 28) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export type TopArtist = {
  name: string
  channelId: string
  score: number
  imageUrl: string
  videos: VideoSearchResult[]
}

/** Artists ranked by plays (each history entry counts at least once) plus a bonus for likes. */
export function topArtists(
  history: HistoryLike[],
  liked: VideoSearchResult[],
  playCounts: Record<string, number>,
  limit = 10,
): TopArtist[] {
  const artists = new Map<string, TopArtist>()
  const add = (video: VideoSearchResult, weight: number) => {
    const name = video.channel_title.trim()
    if (!name) return
    const key = name.toLocaleLowerCase()
    const artist = artists.get(key) ?? {
      name,
      channelId: '',
      score: 0,
      imageUrl: '',
      videos: [],
    }
    artist.score += weight
    artist.channelId ||= video.channel_id
    artist.imageUrl ||= video.channel_thumbnail_url || ''
    if (!artist.videos.some((v) => v.id === video.id)) artist.videos.push(video)
    artists.set(key, artist)
  }
  for (const entry of history)
    add(entry.video, Math.max(1, playCounts[entry.video.id] ?? 1))
  for (const video of liked) add(video, 2)
  return [...artists.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export type DailyMix = {
  id: string
  title: string
  query: string
  subtitle: string
  hue: number
  imageUrl: string
}

/** Up to six "Daily Mix" cards, each seeded by one of the listener's top artists. */
export function dailyMixes(artists: TopArtist[], count = 6): DailyMix[] {
  return artists.slice(0, count).map((artist, index) => {
    const others = artists
      .filter((other) => other !== artist)
      .slice(index, index + 2)
      .map((other) => other.name)
    return {
      id: `daily-${index + 1}`,
      title: `Daily Mix ${index + 1}`,
      query: artist.name,
      subtitle: [artist.name, ...others].join(', ') + ' and more',
      hue: hueFor(artist.name),
      imageUrl: artist.videos[0]?.thumbnail_url ?? '',
    }
  })
}

/** "On Repeat": songs played at least twice, most played first. */
export function onRepeat(
  history: HistoryLike[],
  playCounts: Record<string, number>,
  limit = 30,
) {
  return history
    .filter((entry) => (playCounts[entry.video.id] ?? 0) >= 2)
    .sort(
      (a, b) => (playCounts[b.video.id] ?? 0) - (playCounts[a.video.id] ?? 0),
    )
    .slice(0, limit)
    .map((entry) => entry.video)
}

/** Songs suitable for radio/autoplay: no Shorts, live streams, long mixes or repeats. */
export function radioCandidates(
  results: VideoSearchResult[],
  exclude: Set<string>,
  limit = 10,
) {
  const seen = new Set(exclude)
  const picked: VideoSearchResult[] = []
  for (const video of results) {
    if (picked.length >= limit) break
    if (seen.has(video.id) || video.is_short) continue
    if (video.live_status && video.live_status !== 'none') continue
    const seconds = video.duration_seconds ?? parseDuration(video.duration_label)
    if (seconds > 15 * 60) continue
    seen.add(video.id)
    picked.push(video)
  }
  return picked
}

/** The artist that appears most often, used to seed playlist recommendations. */
export function dominantArtist(videos: { channel_title: string }[]) {
  const counts = new Map<string, number>()
  for (const video of videos)
    if (video.channel_title)
      counts.set(video.channel_title, (counts.get(video.channel_title) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}
