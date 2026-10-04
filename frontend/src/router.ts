import { useSyncExternalStore } from 'react'
import { parseMusicRoute, type MusicRoute } from './experience'
import { DEFAULT_SEARCH_FILTERS } from './api/search'
import type {
  ChannelTab,
  SearchDuration,
  SearchFilters,
  SearchOrder,
  SearchUploadDate,
} from './types'

/**
 * Hash-based routes, so the back button, reloads and "open in new tab" work
 * without any server-side routing for the static build.
 */
export type Route =
  | MusicRoute
  | { name: 'home' }
  | { name: 'results'; query: string; filters: SearchFilters }
  | { name: 'watch'; videoId: string; startSeconds: number | null; listId: string | null }
  | { name: 'channel'; channelRef: string; tab: ChannelTab }
  | { name: 'playlist'; listId: string }
  | { name: 'subscriptions' }
  | { name: 'history' }
  | { name: 'songs' }
  | { name: 'playlists'; playlistId: string | null }
  | { name: 'import' }
  | { name: 'settings' }

const CHANNEL_TABS: ChannelTab[] = ['videos', 'shorts', 'live', 'playlists']
const ORDERS: SearchOrder[] = ['relevance', 'date', 'viewCount', 'rating']
const DURATIONS: SearchDuration[] = ['any', 'short', 'medium', 'long']
const UPLOAD_DATES: SearchUploadDate[] = ['any', 'hour', 'today', 'week', 'month', 'year']

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Accepts `90`, `90s`, `1m30s` and `1h2m3s`, like YouTube's `t` parameter. */
function parseStartTime(value: string | null) {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!match || !match[0]) return null
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
}

export function parseRoute(hash: string): Route {
  const musicRoute = parseMusicRoute(hash)
  if (musicRoute) return musicRoute
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  let segments: string[]
  try { segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent) } catch { return { name: 'home' } }
  const params = new URLSearchParams(queryPart)

  switch (segments[0]) {
    case undefined:
      return { name: 'home' }
    case 'results': {
      const query = params.get('search_query')?.trim() ?? ''
      if (!query) return { name: 'home' }
      return {
        name: 'results',
        query,
        filters: {
          order: pick(params.get('order'), ORDERS, DEFAULT_SEARCH_FILTERS.order),
          duration: pick(params.get('duration'), DURATIONS, DEFAULT_SEARCH_FILTERS.duration),
          uploadDate: pick(params.get('upload'), UPLOAD_DATES, DEFAULT_SEARCH_FILTERS.uploadDate),
        },
      }
    }
    case 'watch': {
      const videoId = params.get('v')
      if (!videoId) return { name: 'home' }
      return {
        name: 'watch',
        videoId,
        startSeconds: parseStartTime(params.get('t')),
        listId: params.get('list'),
      }
    }
    case 'channel':
      if (!segments[1]) return { name: 'home' }
      return {
        name: 'channel',
        channelRef: segments[1],
        tab: pick(segments[2] ?? null, CHANNEL_TABS, 'videos'),
      }
    case 'playlist': {
      const listId = params.get('list')
      return listId ? { name: 'playlist', listId } : { name: 'home' }
    }
    case 'playlists':
      return { name: 'playlists', playlistId: params.get('id') }
    case 'subscriptions':
    case 'history':
    case 'songs':
    case 'import':
    case 'settings':
      return { name: segments[0] }
    default:
      return { name: 'home' }
  }
}

export const paths = {
  home: () => '#/',
  results: (query: string, filters: SearchFilters = DEFAULT_SEARCH_FILTERS) => {
    const params = new URLSearchParams({ search_query: query })
    if (filters.order !== 'relevance') params.set('order', filters.order)
    if (filters.duration !== 'any') params.set('duration', filters.duration)
    if (filters.uploadDate !== 'any') params.set('upload', filters.uploadDate)
    return `#/results?${params.toString()}`
  },
  watch: (videoId: string, options: { startSeconds?: number; listId?: string | null } = {}) => {
    const params = new URLSearchParams({ v: videoId })
    if (options.listId) params.set('list', options.listId)
    if (options.startSeconds) params.set('t', `${Math.floor(options.startSeconds)}s`)
    return `#/watch?${params.toString()}`
  },
  channel: (channelRef: string, tab: ChannelTab = 'videos') =>
    `#/channel/${encodeURIComponent(channelRef)}${tab === 'videos' ? '' : `/${tab}`}`,
  playlist: (listId: string) => `#/playlist?list=${encodeURIComponent(listId)}`,
  subscriptions: () => '#/subscriptions',
  history: () => '#/history',
  songs: () => '#/songs',
  playlists: (playlistId?: string) =>
    playlistId ? `#/playlists?id=${encodeURIComponent(playlistId)}` : '#/playlists',
  import: () => '#/import',
  settings: () => '#/settings',
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (options.replace) {
    const url = new URL(window.location.href)
    url.hash = path
    window.history.replaceState(window.history.state, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  window.location.hash = path
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

function getHash() {
  return window.location.hash
}

export function useHash() {
  return useSyncExternalStore(subscribe, getHash)
}
