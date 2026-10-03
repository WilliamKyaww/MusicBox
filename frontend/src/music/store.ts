import { useSyncExternalStore } from 'react'
import type { VideoSearchResult } from '../types'
import type { ContextKind } from './queue'

export type Folder = { id: string; name: string; playlistIds: string[] }
/** A YouTube playlist saved to Your Library, shown like a Spotify album. */
export type SavedAlbum = {
  id: string
  title: string
  channelTitle: string
  channelId: string
  thumbnailUrl: string | null
  savedAt: string
}
/** Something the listener played from, for "Jump back in" and the Recents sort. */
export type RecentContext = {
  kind: ContextKind
  id: string
  title: string
  subtitle: string
  imageUrl: string | null
  playedAt: string
}
export type LibraryView = 'list' | 'compact' | 'grid'
export type LibrarySort = 'recents' | 'added' | 'alpha' | 'creator'
export type MusicState = {
  liked: VideoSearchResult[]
  likedAt: Record<string, string>
  /** Playlist ids, or `artist:<id>` / `album:<id>` keys. */
  pinned: string[]
  folders: Folder[]
  savedAlbums: SavedAlbum[]
  recentSearches: string[]
  recentContexts: RecentContext[]
  playCounts: Record<string, number>
  /** Playlist descriptions; the backend stores only names. */
  playlistNotes: Record<string, string>
  autoplay: boolean
  libraryView: LibraryView
  librarySort: LibrarySort
  libraryCollapsed: boolean
  privateSession: boolean
  sleepAt: number | 'end' | null
  sidebar: 'now-playing' | 'queue' | null
}
const KEY = 'musicbox-music-library-v1'
/** Below this width the side panels overlay the page instead of sitting beside it. */
export const NARROW = '(max-width: 1100px)'
const MAX_RECENT_SEARCHES = 10
const MAX_RECENT_CONTEXTS = 24
const MAX_PLAY_COUNTS = 500
const listeners = new Set<() => void>()
const defaults: MusicState = {
  liked: [],
  likedAt: {},
  pinned: [],
  folders: [],
  savedAlbums: [],
  recentSearches: [],
  recentContexts: [],
  playCounts: {},
  playlistNotes: {},
  autoplay: true,
  libraryView: 'list',
  librarySort: 'recents',
  libraryCollapsed: false,
  privateSession: false,
  sleepAt: null,
  sidebar: window.matchMedia('(min-width: 1151px)').matches
    ? 'now-playing'
    : null,
}

const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
function stringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(
    Object.entries(v).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
}
function numberRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(
    Object.entries(v).filter(
      ([, value]) => typeof value === 'number' && Number.isFinite(value),
    ),
  ) as Record<string, number>
}
function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}
function omit<T extends object>(value: T, ...keys: string[]): T {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  ) as T
}

function read(): MusicState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    return {
      ...defaults,
      liked: Array.isArray(saved.liked)
        ? saved.liked.filter(
            (v: VideoSearchResult) =>
              v &&
              typeof v.id === 'string' &&
              typeof v.title === 'string' &&
              typeof v.channel_title === 'string' &&
              typeof v.thumbnail_url === 'string' &&
              typeof v.video_url === 'string',
          )
        : [],
      likedAt: stringRecord(saved.likedAt),
      pinned: strings(saved.pinned) ? saved.pinned : [],
      folders: Array.isArray(saved.folders)
        ? saved.folders.filter(
            (f: Folder) =>
              f &&
              typeof f.id === 'string' &&
              typeof f.name === 'string' &&
              strings(f.playlistIds),
          )
        : [],
      savedAlbums: Array.isArray(saved.savedAlbums)
        ? saved.savedAlbums.filter(
            (a: SavedAlbum) =>
              a &&
              typeof a.id === 'string' &&
              typeof a.title === 'string' &&
              typeof a.channelTitle === 'string' &&
              typeof a.savedAt === 'string',
          )
        : [],
      recentSearches: strings(saved.recentSearches)
        ? saved.recentSearches.slice(0, MAX_RECENT_SEARCHES)
        : [],
      recentContexts: Array.isArray(saved.recentContexts)
        ? saved.recentContexts.filter(
            (c: RecentContext) =>
              c &&
              typeof c.kind === 'string' &&
              typeof c.id === 'string' &&
              typeof c.title === 'string' &&
              typeof c.playedAt === 'string',
          )
        : [],
      playCounts: numberRecord(saved.playCounts),
      playlistNotes: stringRecord(saved.playlistNotes),
      autoplay: typeof saved.autoplay === 'boolean' ? saved.autoplay : true,
      libraryView: pick(
        saved.libraryView,
        ['list', 'compact', 'grid'] as const,
        'list',
      ),
      librarySort: pick(
        saved.librarySort,
        ['recents', 'added', 'alpha', 'creator'] as const,
        'recents',
      ),
      libraryCollapsed: saved.libraryCollapsed === true,
      // On narrow screens the panels cover the page, so they start closed.
      sidebar: window.matchMedia(NARROW).matches
        ? null
        : ['queue', 'now-playing', null].includes(saved.sidebar)
          ? saved.sidebar
          : defaults.sidebar,
    }
  } catch {
    return defaults
  }
}
let state = read()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useMusicStore() {
  return useSyncExternalStore(subscribe, () => state)
}
export function getMusicState() {
  return state
}
export function updateMusicState(change: Partial<MusicState>) {
  state = { ...state, ...change }
  // Private listening and the sleep timer reset on restart, like Spotify's private session.
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(omit(state, 'privateSession', 'sleepAt')),
    )
  } catch {
    /* Keep session state even if storage is full. */
  }
  listeners.forEach((listener) => listener())
}
export function isLiked(videoId: string) {
  return state.liked.some((v) => v.id === videoId)
}
export function toggleLiked(video: VideoSearchResult) {
  if (isLiked(video.id)) {
    updateMusicState({
      liked: state.liked.filter((v) => v.id !== video.id),
      likedAt: omit(state.likedAt, video.id),
    })
    return false
  }
  updateMusicState({
    liked: [video, ...state.liked],
    likedAt: { ...state.likedAt, [video.id]: new Date().toISOString() },
  })
  return true
}
export function togglePinned(key: string) {
  updateMusicState({
    pinned: state.pinned.includes(key)
      ? state.pinned.filter((x) => x !== key)
      : [...state.pinned, key],
  })
}
export function createFolder(name: string) {
  if (!name.trim()) return null
  const folder = { id: crypto.randomUUID(), name: name.trim(), playlistIds: [] }
  updateMusicState({ folders: [...state.folders, folder] })
  return folder
}
export function renameFolder(id: string, name: string) {
  if (!name.trim()) return
  updateMusicState({
    folders: state.folders.map((f) =>
      f.id === id ? { ...f, name: name.trim() } : f,
    ),
  })
}
/** Removes the folder only; its playlists return to the top level. */
export function deleteFolder(id: string) {
  updateMusicState({ folders: state.folders.filter((f) => f.id !== id) })
}
export function assignFolder(playlistId: string, folderId: string) {
  updateMusicState({
    folders: state.folders.map((f) => ({
      ...f,
      playlistIds: [
        ...f.playlistIds.filter((id) => id !== playlistId),
        ...(f.id === folderId ? [playlistId] : []),
      ],
    })),
  })
}
export function isAlbumSaved(id: string) {
  return state.savedAlbums.some((album) => album.id === id)
}
export function toggleSavedAlbum(album: Omit<SavedAlbum, 'savedAt'>) {
  if (isAlbumSaved(album.id)) {
    updateMusicState({
      savedAlbums: state.savedAlbums.filter((a) => a.id !== album.id),
      pinned: state.pinned.filter((key) => key !== `album:${album.id}`),
    })
    return false
  }
  updateMusicState({
    savedAlbums: [
      { ...album, savedAt: new Date().toISOString() },
      ...state.savedAlbums,
    ],
  })
  return true
}
export function addRecentSearch(query: string) {
  const value = query.trim()
  if (!value || state.privateSession) return
  updateMusicState({
    recentSearches: [
      value,
      ...state.recentSearches.filter(
        (q) => q.toLocaleLowerCase() !== value.toLocaleLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES),
  })
}
export function removeRecentSearch(query: string) {
  updateMusicState({
    recentSearches: state.recentSearches.filter((q) => q !== query),
  })
}
export function recordContext(context: Omit<RecentContext, 'playedAt'>) {
  if (state.privateSession || context.kind === 'search') return
  updateMusicState({
    recentContexts: [
      { ...context, playedAt: new Date().toISOString() },
      ...state.recentContexts.filter(
        (c) => !(c.kind === context.kind && c.id === context.id),
      ),
    ].slice(0, MAX_RECENT_CONTEXTS),
  })
}
export function recordPlay(videoId: string) {
  if (state.privateSession) return
  const playCounts = {
    ...state.playCounts,
    [videoId]: (state.playCounts[videoId] ?? 0) + 1,
  }
  const entries = Object.entries(playCounts)
  updateMusicState({
    playCounts:
      entries.length > MAX_PLAY_COUNTS
        ? Object.fromEntries(
            entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_PLAY_COUNTS),
          )
        : playCounts,
  })
}
export function setPlaylistNote(playlistId: string, note: string) {
  const rest = omit(state.playlistNotes, playlistId)
  updateMusicState({
    playlistNotes: note.trim() ? { ...rest, [playlistId]: note.trim() } : rest,
  })
}
