import { useSyncExternalStore } from 'react'

/**
 * The audio player owns the <audio> element; it publishes its state here and
 * registers its controls, so lyrics, full screen and keyboard shortcuts can
 * follow and drive playback without a second audio engine.
 */
export type LoopMode = 'off' | 'once' | 'all' | 'one'
export type PlaybackSnapshot = {
  videoId: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  loopMode: LoopMode
  canGoNext: boolean
  canGoPrevious: boolean
}
export type PlaybackControls = {
  toggle: () => void
  seek: (seconds: number) => void
  next: () => void
  previous: () => void
  toggleShuffle: () => void
  toggleLoop: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

const idle: PlaybackSnapshot = {
  videoId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  shuffle: false,
  loopMode: 'off',
  canGoNext: false,
  canGoPrevious: false,
}
let snapshot = idle
let controls: PlaybackControls | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishPlayback(change: Partial<PlaybackSnapshot>) {
  const next = { ...snapshot, ...change }
  if (
    (Object.keys(change) as (keyof PlaybackSnapshot)[]).every(
      (key) => next[key] === snapshot[key],
    )
  )
    return
  snapshot = next
  listeners.forEach((listener) => listener())
}

export function resetPlayback() {
  snapshot = idle
  listeners.forEach((listener) => listener())
}

/** Returns an unregister function; only the latest player stays registered. */
export function registerPlaybackControls(next: PlaybackControls) {
  controls = next
  return () => {
    if (controls === next) controls = null
  }
}

export function getPlaybackControls() {
  return controls
}

export function getPlayback() {
  return snapshot
}

/** Select a primitive or stable slice; time updates fire several times a second. */
export function usePlayback<T>(selector: (state: PlaybackSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => selector(snapshot))
}
