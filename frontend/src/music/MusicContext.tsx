import { createContext, useContext } from 'react'
import type { DownloadJob, Playlist, VideoSearchResult } from '../types'
import type { MenuAnchor, MenuItem } from './Menu'
import type { PlayContext, PlayerSession } from './queue'

/** Where a play started, plus what "Jump back in" needs to show it again. */
export type PlaySource = PlayContext & {
  imageUrl?: string | null
  subtitle?: string
}

/** Extra entries for a song's menu that depend on where the song is shown. */
export type TrackMenuExtras = {
  playlist?: Playlist
  queueIndex?: number
  moveUp?: () => void
  moveDown?: () => void
}

export type MusicActions = {
  playlists: Playlist[]
  downloads: DownloadJob[]
  session: PlayerSession | null
  currentVideo: VideoSearchResult | null
  busy: boolean
  /** `index` -1 with `shuffle` starts on a random song. */
  play: (
    videos: VideoSearchResult[],
    index?: number,
    source?: PlaySource,
    options?: { shuffle?: boolean },
  ) => void
  enqueue: (video: VideoSearchResult, next: boolean) => void
  enqueueMany: (videos: VideoSearchResult[]) => void
  download: (video: VideoSearchResult) => void
  saveToPlaylists: (video: VideoSearchResult) => void
  addToPlaylist: (video: VideoSearchResult, playlistId: string) => Promise<void>
  createPlaylist: (name: string) => Promise<Playlist | null>
  /** Opens the create-playlist dialogue. */
  newPlaylist: (thenAdd?: VideoSearchResult) => void
  editPlaylist: (playlist: Playlist) => void
  confirmDeletePlaylist: (playlist: Playlist) => void
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>
  reorderPlaylist: (playlistId: string, orderedItemIds: string[]) => Promise<void>
  newFolder: (thenAssign?: string) => void
  toast: (message: string) => void
  openMenu: (items: MenuItem[], anchor: MenuAnchor, label: string) => void
  openTrackMenu: (
    video: VideoSearchResult,
    anchor: MenuAnchor,
    extras?: TrackMenuExtras,
  ) => void
  queue: {
    jump: (index: number) => void
    remove: (index: number) => void
    move: (index: number, direction: -1 | 1) => void
    moveTo: (from: number, to: number) => void
    clear: () => void
  }
  showFullScreen: () => void
  /** Sets the title and play action shown in the sticky top bar after scrolling. */
  setStickyHeader: (header: StickyHeader | null) => void
}

export type StickyHeader = {
  title: string
  hue: number | null
  onPlay?: () => void
  playing?: boolean
  /** How far the page scrolls before the bar shows the title; small for pages with a plain heading. */
  threshold?: number
}

export const MusicContext = createContext<MusicActions | null>(null)

export function useMusic() {
  const value = useContext(MusicContext)
  if (!value) throw new Error('useMusic must be used inside the music workspace.')
  return value
}

/** Data transfer type for dragging songs onto playlists or within lists. */
export const TRACK_DRAG_TYPE = 'application/x-musicbox-track'
