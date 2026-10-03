import type { CSSProperties, DragEvent } from 'react'
import { musicPath } from '../experience'
import type { Playlist, PlaylistItem, VideoSearchResult } from '../types'
import { TRACK_DRAG_TYPE } from './MusicContext'
import type { ContextKind, PlayerTrack } from './queue'

export function hueStyle(hue: number | null | undefined): CSSProperties {
  return (hue === null || hue === undefined
    ? {}
    : { '--music-hue': String(hue) }) as CSSProperties
}

export function playlistVideo(item: PlaylistItem): VideoSearchResult {
  return {
    id: item.video_id,
    title: item.title,
    channel_title: item.channel_title,
    thumbnail_url: item.thumbnail_url ?? '',
    video_url: item.source_url,
    duration_label: item.duration_label ?? '',
    channel_id: '',
    description: '',
    duration_iso: '',
    published_at: item.added_at,
  }
}

export function sortedItems(playlist: Playlist) {
  return [...playlist.items].sort((a, b) => a.position - b.position)
}

/** Mix contexts are keyed `query|title`, since a mix is rebuilt from its search. */
export function mixContextId(query: string, title: string) {
  return `${query}|${title}`
}

/** The page a playing context came from, for "Playing from" links and "Jump back in". */
export function contextPath(kind: ContextKind, id: string) {
  switch (kind) {
    case 'playlist':
    case 'artist':
    case 'album':
      return musicPath(kind, id)
    case 'mix': {
      const [query, title = ''] = id.split('|')
      return musicPath('mix', query, { title })
    }
    case 'search':
      return musicPath('search', id)
    default:
      return musicPath(kind)
  }
}

export function startTrackDrag(event: DragEvent, video: VideoSearchResult) {
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData(TRACK_DRAG_TYPE, JSON.stringify(video))
  event.dataTransfer.setData('text/plain', `${video.title} - ${video.channel_title}`)
}

/** Reads a song dragged from a track list; ignores anything else dropped on the page. */
export function readTrackDrag(event: DragEvent): VideoSearchResult | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(TRACK_DRAG_TYPE)) as VideoSearchResult
    return value && typeof value.id === 'string' && typeof value.title === 'string'
      ? value
      : null
  } catch {
    return null
  }
}

export function isTrackDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(TRACK_DRAG_TYPE)
}

export function copyText(text: string, toast: (message: string) => void) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast('Link copied to clipboard.'))
    .catch(() => toast('Could not copy the link.'))
}

export function trackToVideo(track: PlayerTrack): VideoSearchResult {
  return {
    id: track.videoId,
    title: track.title,
    channel_title: track.channelTitle,
    channel_id: track.channelId ?? '',
    description: '',
    thumbnail_url: track.thumbnailUrl || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
    duration_iso: '',
    duration_label: track.durationLabel ?? '',
    published_at: '',
    video_url: track.sourceUrl || `https://www.youtube.com/watch?v=${track.videoId}`,
  }
}
