import { useSyncExternalStore } from 'react'
import type { VideoSearchResult } from './types'

/**
 * Per-browser state that YouTube keeps in your account: subscriptions, watch
 * history, resume positions and player preferences. It lives in localStorage,
 * and every access is guarded because storage can be blocked.
 */

export type Subscription = {
  id: string
  name: string
  handle: string | null
  avatarUrl: string | null
  subscribedAt: string
}

export type HistoryEntry = {
  video: VideoSearchResult
  watchedAt: string
}

export type WatchProgress = {
  seconds: number
  duration: number
  updatedAt: number
}

export type PlayerPrefs = {
  volume: number
  muted: boolean
  playbackRate: number
  qualityHeight: number
  captionsLang: string | null
  autoplay: boolean
  theater: boolean
}

type LibraryState = {
  subscriptions: Subscription[]
  history: HistoryEntry[]
  progress: Record<string, WatchProgress>
  prefs: PlayerPrefs
}

const STORAGE_KEYS = {
  subscriptions: 'musicbox-subscriptions',
  history: 'musicbox-history',
  progress: 'musicbox-progress',
  prefs: 'musicbox-player-prefs',
} as const

const MAX_HISTORY = 200
const MAX_PROGRESS = 400

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  volume: 1,
  muted: false,
  playbackRate: 1,
  qualityHeight: 1080,
  captionsLang: null,
  autoplay: true,
  theater: false,
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or disabled; the in-memory copy still works this session.
  }
}

let state: LibraryState = {
  subscriptions: read(STORAGE_KEYS.subscriptions, []),
  history: read(STORAGE_KEYS.history, []),
  progress: read(STORAGE_KEYS.progress, {}),
  prefs: { ...DEFAULT_PLAYER_PREFS, ...read(STORAGE_KEYS.prefs, {}) },
}

const listeners = new Set<() => void>()

function update(changes: Partial<LibraryState>) {
  state = { ...state, ...changes }
  for (const [name, key] of Object.entries(STORAGE_KEYS) as [keyof LibraryState, string][]) {
    if (name in changes) write(key, state[name])
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLibrary<T>(selector: (current: LibraryState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

export function getPlayerPrefs() {
  return state.prefs
}

export function updatePlayerPrefs(changes: Partial<PlayerPrefs>) {
  update({ prefs: { ...state.prefs, ...changes } })
}

export function isSubscribed(channelId: string) {
  return state.subscriptions.some((entry) => entry.id === channelId)
}

export function toggleSubscription(channel: Omit<Subscription, 'subscribedAt'>) {
  if (isSubscribed(channel.id)) {
    update({ subscriptions: state.subscriptions.filter((entry) => entry.id !== channel.id) })
    return false
  }

  update({
    subscriptions: [
      ...state.subscriptions,
      { ...channel, subscribedAt: new Date().toISOString() },
    ].sort((left, right) => left.name.localeCompare(right.name)),
  })
  return true
}

export function recordHistory(video: VideoSearchResult) {
  const remaining = state.history.filter((entry) => entry.video.id !== video.id)
  update({
    history: [{ video, watchedAt: new Date().toISOString() }, ...remaining].slice(0, MAX_HISTORY),
  })
}

export function removeHistoryEntry(videoId: string) {
  update({ history: state.history.filter((entry) => entry.video.id !== videoId) })
}

export function clearHistory() {
  update({ history: [], progress: {} })
}

export function getWatchProgress(videoId: string): WatchProgress | undefined {
  return state.progress[videoId]
}

export function saveWatchProgress(videoId: string, seconds: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return

  // A finished video shows a full progress bar and restarts from the beginning.
  const position = seconds >= duration - 5 ? duration : seconds
  const next = { ...state.progress, [videoId]: { seconds: position, duration, updatedAt: Date.now() } }

  const entries = Object.entries(next)
  if (entries.length > MAX_PROGRESS) {
    entries.sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    update({ progress: Object.fromEntries(entries.slice(0, MAX_PROGRESS)) })
    return
  }
  update({ progress: next })
}

/** Where to resume a video, or null to start from the beginning. */
export function getResumePosition(videoId: string) {
  const progress = state.progress[videoId]
  if (!progress) return null
  if (progress.seconds < 10 || progress.seconds >= progress.duration - 10) return null
  return progress.seconds
}
