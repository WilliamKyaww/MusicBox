export type PlayerTrack = {
  videoId: string
  title: string
  thumbnailUrl: string | null
  channelTitle: string
  sourceUrl: string
  durationLabel: string | null
}
export type PlayerSession = {
  source: 'single' | 'playlist' | 'queue'
  playlistId: string | null
  tracks: PlayerTrack[]
  index: number
  shuffle: boolean
  orderedUpcoming?: PlayerTrack[]
}

export function shuffleTracks<T>(tracks: T[], random = Math.random): T[] {
  const result = [...tracks]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function enqueueTrack(
  session: PlayerSession | null,
  track: PlayerTrack,
  next: boolean,
): PlayerSession {
  if (!session)
    return {
      source: 'queue',
      playlistId: null,
      tracks: [track],
      index: 0,
      shuffle: false,
    }
  const tracks = [...session.tracks]
  tracks.splice(next ? session.index + 1 : tracks.length, 0, track)
  return {
    ...session,
    source: 'queue',
    tracks,
    shuffle: false,
    orderedUpcoming: undefined,
  }
}

export function removeQueuedTrack(
  session: PlayerSession,
  index: number,
): PlayerSession {
  if (index <= session.index || index >= session.tracks.length) return session
  return {
    ...session,
    tracks: session.tracks.filter((_, i) => i !== index),
    shuffle: false,
    orderedUpcoming: undefined,
  }
}

export function moveQueuedTrack(
  session: PlayerSession,
  index: number,
  direction: -1 | 1,
): PlayerSession {
  const target = index + direction
  if (
    index <= session.index ||
    target <= session.index ||
    index >= session.tracks.length ||
    target >= session.tracks.length
  )
    return session
  const tracks = [...session.tracks]
  ;[tracks[index], tracks[target]] = [tracks[target], tracks[index]]
  return { ...session, tracks, shuffle: false, orderedUpcoming: undefined }
}

export function toggleQueueShuffle(
  session: PlayerSession,
  random = Math.random,
): PlayerSession {
  const prefix = session.tracks.slice(0, session.index + 1)
  const upcoming = session.tracks.slice(session.index + 1)
  if (!session.shuffle)
    return {
      ...session,
      shuffle: true,
      orderedUpcoming: upcoming,
      tracks: [...prefix, ...shuffleTracks(upcoming, random)],
    }
  const pending = [...upcoming]
  const restored = (session.orderedUpcoming ?? []).filter((track) => {
    const i = pending.findIndex(
      (candidate) => candidate === track || candidate.videoId === track.videoId,
    )
    if (i < 0) return false
    pending.splice(i, 1)
    return true
  })
  return {
    ...session,
    shuffle: false,
    orderedUpcoming: undefined,
    tracks: [...prefix, ...restored, ...pending],
  }
}

export function parseSavedSession(value: unknown): PlayerSession | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<PlayerSession>
  if (
    !Array.isArray(item.tracks) ||
    item.tracks.length === 0 ||
    item.tracks.length > 2000
  )
    return null
  if (
    !item.tracks.every(
      (t) =>
        t &&
        typeof t.videoId === 'string' &&
        /^[\w-]{11}$/.test(t.videoId) &&
        typeof t.title === 'string' &&
        typeof t.channelTitle === 'string' &&
        typeof t.sourceUrl === 'string' &&
        (t.thumbnailUrl === null || typeof t.thumbnailUrl === 'string') &&
        (t.durationLabel === null || typeof t.durationLabel === 'string'),
    )
  )
    return null
  return {
    source: item.source === 'playlist' ? 'playlist' : 'queue',
    playlistId: typeof item.playlistId === 'string' ? item.playlistId : null,
    tracks: item.tracks,
    index: Number.isInteger(item.index)
      ? Math.max(0, Math.min(item.index!, item.tracks.length - 1))
      : 0,
    shuffle: false,
  }
}

export function readSavedSession() {
  try {
    return parseSavedSession(
      JSON.parse(localStorage.getItem('musicbox-audio-queue') ?? 'null'),
    )
  } catch {
    return null
  }
}
