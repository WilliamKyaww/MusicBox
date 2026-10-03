export type PlayerTrack = {
  videoId: string
  title: string
  thumbnailUrl: string | null
  channelTitle: string
  sourceUrl: string
  durationLabel: string | null
  channelId?: string
  /** `queue`: added by the listener ("Next in queue"); `autoplay`: recommended after the context ends. */
  origin?: 'queue' | 'autoplay'
}
export type ContextKind =
  | 'playlist'
  | 'liked'
  | 'recent'
  | 'repeat'
  | 'artist'
  | 'album'
  | 'mix'
  | 'search'
  | 'downloads'
/** What the music is playing from, like Spotify's "Playing from playlist". */
export type PlayContext = { kind: ContextKind; id: string; title: string }
export type PlayerSession = {
  source: 'single' | 'playlist' | 'queue'
  playlistId: string | null
  tracks: PlayerTrack[]
  index: number
  shuffle: boolean
  orderedUpcoming?: PlayerTrack[]
  context?: PlayContext
}

const CONTEXT_KINDS: ContextKind[] = [
  'playlist',
  'liked',
  'recent',
  'repeat',
  'artist',
  'album',
  'mix',
  'search',
  'downloads',
]

export function shuffleTracks<T>(tracks: T[], random = Math.random): T[] {
  const result = [...tracks]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function isQueued(track: PlayerTrack | undefined) {
  return track?.origin === 'queue'
}

/** Index just after the listener's queued songs that follow the current song. */
function endOfQueued(session: PlayerSession) {
  let position = session.index + 1
  while (isQueued(session.tracks[position])) position++
  return position
}

/**
 * Starts a new context (playlist, album, search results...). Songs the listener
 * queued but has not heard yet carry over and play right after the chosen song,
 * as in Spotify. A negative index with shuffle starts on a random song.
 */
export function startContext(
  previous: PlayerSession | null,
  tracks: PlayerTrack[],
  index: number,
  context: PlayContext | undefined,
  shuffle = false,
  random = Math.random,
): PlayerSession {
  const start =
    index < 0 && shuffle
      ? Math.floor(random() * tracks.length)
      : Math.max(0, Math.min(index, tracks.length - 1))
  const plain = tracks.map((track) => ({ ...track, origin: undefined }))
  const pendingQueue = previous
    ? previous.tracks.slice(previous.index + 1).filter(isQueued)
    : []
  const base = {
    source: context?.kind === 'playlist' ? ('playlist' as const) : ('queue' as const),
    playlistId: context?.kind === 'playlist' ? context.id : null,
    context,
  }
  if (shuffle) {
    const chosen = plain[start]
    const rest = plain.filter((_, i) => i !== start)
    return {
      ...base,
      tracks: [chosen, ...pendingQueue, ...shuffleTracks(rest, random)],
      index: 0,
      shuffle: true,
      orderedUpcoming: rest,
    }
  }
  return {
    ...base,
    tracks: [
      ...plain.slice(0, start + 1),
      ...pendingQueue,
      ...plain.slice(start + 1),
    ],
    index: start,
    shuffle: false,
  }
}

/** `next` plays the song straight after the current one; otherwise it joins the end of "Next in queue". */
export function enqueueTrack(
  session: PlayerSession | null,
  track: PlayerTrack,
  next: boolean,
): PlayerSession {
  if (!session)
    return {
      source: 'queue',
      playlistId: null,
      tracks: [{ ...track, origin: undefined }],
      index: 0,
      shuffle: false,
    }
  const tracks = [...session.tracks]
  tracks.splice(next ? session.index + 1 : endOfQueued(session), 0, {
    ...track,
    origin: 'queue',
  })
  return {
    ...session,
    source: session.source === 'single' ? 'queue' : session.source,
    tracks,
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
  }
}

export function moveQueuedTrack(
  session: PlayerSession,
  index: number,
  direction: -1 | 1,
): PlayerSession {
  return moveQueuedTrackTo(session, index, index + direction)
}

/** Drag-and-drop reordering of upcoming songs; the current song and history stay put. */
export function moveQueuedTrackTo(
  session: PlayerSession,
  from: number,
  to: number,
): PlayerSession {
  const last = session.tracks.length - 1
  if (
    from === to ||
    from <= session.index ||
    to <= session.index ||
    from > last ||
    to > last
  )
    return session
  const tracks = [...session.tracks]
  const [moved] = tracks.splice(from, 1)
  tracks.splice(to, 0, moved)
  return { ...session, tracks }
}

/** Spotify's "Clear queue": drops the songs the listener queued, not the playlist itself. */
export function clearQueued(session: PlayerSession): PlayerSession {
  return {
    ...session,
    tracks: session.tracks.filter(
      (track, i) => i <= session.index || !isQueued(track),
    ),
  }
}

/** Appends recommended songs, skipping any already waiting to play. */
export function appendAutoplay(
  session: PlayerSession,
  tracks: PlayerTrack[],
): PlayerSession {
  const upcoming = new Set(
    session.tracks.slice(session.index).map((track) => track.videoId),
  )
  const additions = tracks
    .filter((track) => !upcoming.has(track.videoId))
    .map((track) => ({ ...track, origin: 'autoplay' as const }))
  if (!additions.length) return session
  return { ...session, tracks: [...session.tracks, ...additions] }
}

export type QueueEntry = { track: PlayerTrack; index: number }

/** Upcoming songs split the way Spotify's queue panel shows them. */
export function queueSections(session: PlayerSession | null) {
  const sections = {
    queued: [] as QueueEntry[],
    context: [] as QueueEntry[],
    autoplay: [] as QueueEntry[],
  }
  if (!session) return sections
  session.tracks.forEach((track, index) => {
    if (index <= session.index) return
    const entry = { track, index }
    if (track.origin === 'queue') sections.queued.push(entry)
    else if (track.origin === 'autoplay') sections.autoplay.push(entry)
    else sections.context.push(entry)
  })
  return sections
}

/** Shuffles the context's upcoming songs; the listener's queue keeps its order, as in Spotify. */
export function toggleQueueShuffle(
  session: PlayerSession,
  random = Math.random,
): PlayerSession {
  const prefix = session.tracks.slice(0, session.index + 1)
  const upcoming = session.tracks.slice(session.index + 1)
  const queued = upcoming.filter(isQueued)
  const rest = upcoming.filter((track) => !isQueued(track))
  if (!session.shuffle)
    return {
      ...session,
      shuffle: true,
      orderedUpcoming: rest,
      tracks: [...prefix, ...queued, ...shuffleTracks(rest, random)],
    }
  const pending = [...rest]
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
    tracks: [...prefix, ...queued, ...restored, ...pending],
  }
}

function parseContext(value: unknown): PlayContext | undefined {
  if (!value || typeof value !== 'object') return undefined
  const context = value as Partial<PlayContext>
  if (
    !CONTEXT_KINDS.includes(context.kind as ContextKind) ||
    typeof context.id !== 'string' ||
    typeof context.title !== 'string'
  )
    return undefined
  return { kind: context.kind!, id: context.id, title: context.title }
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
  const tracks: PlayerTrack[] = item.tracks.map((t) => ({
    videoId: t.videoId,
    title: t.title,
    thumbnailUrl: t.thumbnailUrl,
    channelTitle: t.channelTitle,
    sourceUrl: t.sourceUrl,
    durationLabel: t.durationLabel,
    ...(typeof t.channelId === 'string' && t.channelId
      ? { channelId: t.channelId }
      : {}),
    ...(t.origin === 'queue' || t.origin === 'autoplay'
      ? { origin: t.origin }
      : {}),
  }))
  return {
    source: item.source === 'playlist' ? 'playlist' : 'queue',
    playlistId: typeof item.playlistId === 'string' ? item.playlistId : null,
    tracks,
    index: Number.isInteger(item.index)
      ? Math.max(0, Math.min(item.index!, tracks.length - 1))
      : 0,
    shuffle: false,
    context: parseContext(item.context),
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
