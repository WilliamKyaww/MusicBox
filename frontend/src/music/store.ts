import { useSyncExternalStore } from 'react'
import type { VideoSearchResult } from '../types'

type Folder = { id: string; name: string; playlistIds: string[] }
export type MusicState = {
  liked: VideoSearchResult[]
  pinned: string[]
  folders: Folder[]
  privateSession: boolean
  sleepAt: number | 'end' | null
  sidebar: 'now-playing' | 'queue' | null
}
const KEY = 'musicbox-music-library-v1'
const listeners = new Set<() => void>()
const defaults: MusicState = {
  liked: [],
  pinned: [],
  folders: [],
  privateSession: false,
  sleepAt: null,
  sidebar: window.matchMedia('(min-width: 1151px)').matches
    ? 'now-playing'
    : null,
}
function read(): MusicState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    const strings = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((x) => typeof x === 'string')
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
      sidebar: ['queue', 'now-playing', null].includes(saved.sidebar)
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
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        liked: state.liked,
        pinned: state.pinned,
        folders: state.folders,
        sidebar: state.sidebar,
      }),
    )
  } catch {
    /* Keep session state even if storage is full. */
  }
  listeners.forEach((listener) => listener())
}
export function toggleLiked(video: VideoSearchResult) {
  const liked = state.liked.some((v) => v.id === video.id)
  updateMusicState({
    liked: liked
      ? state.liked.filter((v) => v.id !== video.id)
      : [video, ...state.liked],
  })
}
export function togglePinned(id: string) {
  updateMusicState({
    pinned: state.pinned.includes(id)
      ? state.pinned.filter((x) => x !== id)
      : [...state.pinned, id],
  })
}
export function createFolder(name: string) {
  if (!name.trim()) return
  updateMusicState({
    folders: [
      ...state.folders,
      { id: crypto.randomUUID(), name: name.trim(), playlistIds: [] },
    ],
  })
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
