import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  cancelDownload,
  enqueueDownload,
  fetchDownloads,
  getDirectDownloadHref,
  redownloadDownload,
  removeDownload,
  renameDownload,
} from './api/downloads'
import {
  createPlaylistExport,
  fetchExports,
  removeExport,
} from './api/exports'
import {
  fetchDiscordPresenceStatus,
  getDiscordPresenceThumbnailHref,
} from './api/discordPresence'
import {
  addVideoToPlaylist,
  createPlaylist,
  deletePlaylist,
  fetchPlaylists,
  removePlaylistItem,
  renamePlaylist,
  reorderPlaylistItems,
} from './api/playlists'
import { getStreamUrl } from './api/streaming'
import { createYouTubePlaylistExport } from './api/youtubePlaylists'
import { AudioPlayer } from './components/AudioPlayer'
import { DownloadOptionsDialog } from './components/DownloadOptionsDialog'
import { DownloadQueuePanel } from './components/DownloadQueuePanel'
import { PlaylistExportPanel } from './components/PlaylistExportPanel'
import { PlaylistPanel } from './components/PlaylistPanel'
import { SaveToPlaylistDialog } from './components/SaveToPlaylistDialog'
import { ToastViewport } from './components/ToastViewport'
import { YouTubePlaylistDownloadPanel } from './components/YouTubePlaylistDownloadPanel'
import { Sidebar, type SidebarMode } from './layout/Sidebar'
import { TopBar } from './layout/TopBar'
import { ChannelPage } from './pages/ChannelPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { PlaylistPage } from './pages/PlaylistPage'
import { SearchPage } from './pages/SearchPage'
import { SubscriptionsPage } from './pages/SubscriptionsPage'
import { WatchPage } from './pages/WatchPage'
import { navigate, parseRoute, paths, useHash } from './router'
import { useScrollRestoration } from './scrollRestoration'
import { VideoActionsContext, type VideoActions, type WatchQueue } from './videoActions'
import { rememberExperience } from './experience'
import { recordHistory } from './library'
import { MusicWorkspace } from './music/MusicWorkspace'
import { MusicIcon } from './music/MusicIcon'
import { enqueueTrack, moveQueuedTrack, readSavedSession, removeQueuedTrack, shuffleTracks, toggleQueueShuffle, type PlayerSession, type PlayerTrack } from './music/queue'
import { getMusicState, toggleLiked, updateMusicState, useMusicStore } from './music/store'
import type {
  DownloadJob,
  DiscordPresenceStatus,
  DownloadOptions,
  DownloadRuntimeStatus,
  DownloadSection,
  Playlist,
  PlaylistExportFormat,
  PlaylistExportJob,
  PlaylistItem,
  VideoSearchResult,
} from './types'
import './App.css'
import './youtube.css'
import './music/music.css'

type ToastMessage = { id: number; message: string }
type LoopMode = 'off' | 'once' | 'all' | 'one'
type DownloadTarget = {
  video: VideoSearchResult
  section?: DownloadSection
}

const SIDEBAR_FULL_QUERY = '(min-width: 1312px)'
const SIDEBAR_MINI_QUERY = '(min-width: 792px)'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('spotimy-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    return 'light'
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
  )
}

function App() {
  const hash = useHash()
  const route = useMemo(() => parseRoute(hash), [hash])
  useScrollRestoration(hash)

  const isWideScreen = useMediaQuery(SIDEBAR_FULL_QUERY)
  const isMediumScreen = useMediaQuery(SIDEBAR_MINI_QUERY)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(() => route.name === 'watch' ? null : readSavedSession())
  const [playRequest, setPlayRequest] = useState(0)
  const music = useMusicStore()
  const isMusic = route.name === 'music'
  const [loopMode, setLoopMode] = useState<LoopMode>('off')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([])
  const [downloadRuntime, setDownloadRuntime] = useState<DownloadRuntimeStatus | null>(
    null,
  )
  const [downloadsErrorMessage, setDownloadsErrorMessage] = useState<string | null>(
    null,
  )
  const [pendingDownloadVideoIds, setPendingDownloadVideoIds] = useState<string[]>([])
  const [pendingDownloadRemovalIds, setPendingDownloadRemovalIds] = useState<string[]>([])
  const [pendingDownloadRenameIds, setPendingDownloadRenameIds] = useState<string[]>([])
  const [pendingRedownloadIds, setPendingRedownloadIds] = useState<string[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [exportJobs, setExportJobs] = useState<PlaylistExportJob[]>([])
  const [discordPresenceStatus, setDiscordPresenceStatus] =
    useState<DiscordPresenceStatus | null>(null)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(route.name === 'music' && route.view === 'playlist' ? route.playlistId : null)
  const [playlistsErrorMessage, setPlaylistsErrorMessage] = useState<string | null>(
    null,
  )
  const [exportsErrorMessage, setExportsErrorMessage] = useState<string | null>(null)
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false)
  const [isMutatingPlaylist, setIsMutatingPlaylist] = useState(false)
  const [isCreatingExport, setIsCreatingExport] = useState(false)
  const [isCreatingYouTubePlaylistExport, setIsCreatingYouTubePlaylistExport] =
    useState(false)
  const [pendingPlaylistVideoId, setPendingPlaylistVideoId] = useState<string | null>(
    null,
  )
  const [pendingExportRemovalIds, setPendingExportRemovalIds] = useState<string[]>([])
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null)
  const [saveTarget, setSaveTarget] = useState<VideoSearchResult | null>(null)
  const [watchQueue, setWatchQueue] = useState<WatchQueue | null>(null)

  const pushToast = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message }].slice(-3))
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3600)
  }, [])

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function toPlayerTrack(item: PlaylistItem): PlayerTrack {
    return {
      videoId: item.video_id,
      title: item.title,
      thumbnailUrl: item.thumbnail_url,
      channelTitle: item.channel_title,
      sourceUrl: item.source_url,
      durationLabel: item.duration_label,
    }
  }

  function getPlaylistSafeThumbnailUrl(track: PlayerTrack): string {
    const thumbnailUrl = track.thumbnailUrl?.trim()
    if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) {
      return thumbnailUrl
    }

    return `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`
  }

  function toVideoSearchResult(track: PlayerTrack): VideoSearchResult {
    return {
      id: track.videoId,
      title: track.title,
      channel_title: track.channelTitle,
      channel_id: '',
      description: '',
      thumbnail_url: getPlaylistSafeThumbnailUrl(track),
      duration_iso: '',
      duration_label: track.durationLabel ?? '',
      published_at: '',
      video_url: track.sourceUrl || `https://www.youtube.com/watch?v=${track.videoId}`,
    }
  }

  function downloadJobToVideoSearchResult(job: DownloadJob): VideoSearchResult {
    return {
      id: job.video_id,
      title: job.title,
      channel_title: job.channel_title,
      channel_id: '',
      description: '',
      thumbnail_url:
        job.thumbnail_url || `https://i.ytimg.com/vi/${job.video_id}/hqdefault.jpg`,
      duration_iso: '',
      duration_label: '',
      published_at: '',
      video_url: job.source_url || `https://www.youtube.com/watch?v=${job.video_id}`,
    }
  }

  function getOrderedPlaylistTracks(playlist: Playlist) {
    return [...playlist.items]
      .sort((left, right) => left.position - right.position)
      .map(toPlayerTrack)
  }

  useEffect(() => {
    rememberExperience(hash)
    document.documentElement.dataset.experience = isMusic ? 'music' : 'video'
  }, [hash, isMusic])

  useEffect(() => {
    try {
      if (playerSession) localStorage.setItem('musicbox-audio-queue', JSON.stringify(playerSession))
      else localStorage.removeItem('musicbox-audio-queue')
    } catch { /* A full or disabled localStorage must not stop playback. */ }
  }, [playerSession])

  const loadDownloads = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetchDownloads(signal)
      startTransition(() => {
        setDownloadJobs(response.items)
        setDownloadRuntime(response.runtime)
        setDownloadsErrorMessage(null)
      })
    } catch (error) {
      if (signal?.aborted) {
        return
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Could not refresh the download queue.'

      startTransition(() => {
        setDownloadsErrorMessage(message)
      })
    }
  })

  function startDeviceDownload(video: VideoSearchResult, options: DownloadOptions) {
    // Navigating an anchor lets the browser stream the file straight to disk
    // instead of buffering a whole video in memory first.
    const link = document.createElement('a')
    link.href = getDirectDownloadHref(video, options)
    link.download = ''
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    pushToast(
      `Preparing "${video.title}" for this device. The download starts once the file is ready.`,
    )
  }

  async function handleDownload(
    video: VideoSearchResult,
    options: DownloadOptions = DEFAULT_DOWNLOAD_OPTIONS,
  ) {
    if (options.destination === 'device') {
      startDeviceDownload(video, options)
      return
    }

    setPendingDownloadVideoIds((current) =>
      current.includes(video.id) ? current : [...current, video.id],
    )

    try {
      const response = await enqueueDownload(video, options)

      startTransition(() => {
        setDownloadJobs((current) => {
          const remaining = current.filter((item) => item.id !== response.job.id)
          return [response.job, ...remaining]
        })
        setDownloadsErrorMessage(null)
      })
      pushToast(
        `Queued "${video.title}" for ${
          options.mediaKind === 'video' ? 'video' : 'MP3'
        } download.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not start the download.'

      startTransition(() => {
        setDownloadsErrorMessage(message)
      })
      pushToast(message)
    } finally {
      setPendingDownloadVideoIds((current) =>
        current.filter((videoId) => videoId !== video.id),
      )
    }
  }

  function handleConfirmDownloadOptions(
    video: VideoSearchResult,
    options: DownloadOptions,
  ) {
    setDownloadTarget(null)
    void handleDownload(video, options)
  }

  function handleWatchDownload(job: DownloadJob) {
    navigate(paths.watch(job.video_id))
  }

  async function handleRemoveDownload(job: DownloadJob, deleteFile: boolean) {
      setPendingDownloadRemovalIds((current) =>
        current.includes(job.id) ? current : [...current, job.id],
      )

      try {
        await removeDownload(job.id, deleteFile)
        startTransition(() => {
          setDownloadJobs((current) => current.filter((item) => item.id !== job.id))
          setDownloadsErrorMessage(null)
        })
        pushToast(
          deleteFile
            ? `Deleted "${job.title}".`
            : `Removed failed download for "${job.title}".`,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not remove the download job.'

        startTransition(() => {
          setDownloadsErrorMessage(message)
        })
      } finally {
        setPendingDownloadRemovalIds((current) =>
          current.filter((id) => id !== job.id),
        )
      }
  }

  async function handleCancelDownload(job: DownloadJob) {
    setPendingDownloadRemovalIds((current) =>
      current.includes(job.id) ? current : [...current, job.id],
    )

    try {
      await cancelDownload(job.id)
      startTransition(() => {
        setDownloadJobs((current) => current.filter((item) => item.id !== job.id))
        setDownloadsErrorMessage(null)
      })
      pushToast(`Cancelled the download of "${job.title}".`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not cancel the download.'

      startTransition(() => {
        setDownloadsErrorMessage(message)
      })
      pushToast(message)
    } finally {
      setPendingDownloadRemovalIds((current) => current.filter((id) => id !== job.id))
    }
  }

  async function handleRedownload(job: DownloadJob) {
    setPendingRedownloadIds((current) =>
      current.includes(job.id) ? current : [...current, job.id],
    )

    try {
      const response = await redownloadDownload(job.id)
      startTransition(() => {
        setDownloadJobs((current) => {
          const remaining = current.filter((item) => item.id !== response.job.id)
          return [response.job, ...remaining]
        })
        setDownloadsErrorMessage(null)
      })
      pushToast(`Queued "${response.job.title}" for redownload.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not redownload this song.'

      startTransition(() => {
        setDownloadsErrorMessage(message)
      })
    } finally {
      setPendingRedownloadIds((current) => current.filter((id) => id !== job.id))
    }
  }

  async function handleRenameDownload(job: DownloadJob, title: string) {
    setPendingDownloadRenameIds((current) =>
      current.includes(job.id) ? current : [...current, job.id],
    )

    try {
      const updatedJob = await renameDownload(job.id, title)
      startTransition(() => {
        setDownloadJobs((current) =>
          current.map((item) => (item.id === updatedJob.id ? updatedJob : item)),
        )
        setDownloadsErrorMessage(null)
      })
      pushToast(`Renamed saved song to "${updatedJob.title}".`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not rename the saved song.'

      startTransition(() => {
        setDownloadsErrorMessage(message)
      })
    } finally {
      setPendingDownloadRenameIds((current) =>
        current.filter((id) => id !== job.id),
      )
    }
  }

  async function handleAddDownloadToPlaylists(
    job: DownloadJob,
    playlistIds: string[],
  ) {
    await handleAddToPlaylists(downloadJobToVideoSearchResult(job), playlistIds)
  }

  const loadPlaylists = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetchPlaylists(signal)
      startTransition(() => {
        setPlaylists(response.items)
        setPlaylistsErrorMessage(null)
        setActivePlaylistId((current) => {
          if (current && response.items.some((playlist) => playlist.id === current)) {
            return current
          }

          return response.items[0]?.id ?? null
        })
      })
    } catch (error) {
      if (signal?.aborted) {
        return
      }

      const message =
        error instanceof Error ? error.message : 'Could not refresh playlists.'

      startTransition(() => {
        setPlaylistsErrorMessage(message)
      })
    }
  })

  const loadExports = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetchExports(signal)
      startTransition(() => {
        setExportJobs(response.items)
        setExportsErrorMessage(null)
      })
    } catch (error) {
      if (signal?.aborted) {
        return
      }

      const message =
        error instanceof Error ? error.message : 'Could not refresh playlist exports.'

      startTransition(() => {
        setExportsErrorMessage(message)
      })
    }
  })

  const loadDiscordPresenceStatus = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetchDiscordPresenceStatus()

      if (signal?.aborted) {
        return
      }

      startTransition(() => {
        setDiscordPresenceStatus(response)
      })
    } catch {
      if (signal?.aborted) {
        return
      }

      startTransition(() => {
        setDiscordPresenceStatus(null)
      })
    }
  })

  async function handleCreatePlaylist(name: string) {
    setIsCreatingPlaylist(true)
    try {
      const playlist = await createPlaylist(name)
      startTransition(() => {
        setPlaylists((current) => [playlist, ...current])
        setActivePlaylistId(playlist.id)
        setPlaylistsErrorMessage(null)
      })
      pushToast(`Created playlist "${playlist.name}".`)
      return playlist
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not create the playlist.'

      startTransition(() => {
        setPlaylistsErrorMessage(message)
      })
      pushToast(message)
      return null
    } finally {
      setIsCreatingPlaylist(false)
    }
  }

  async function handleRenamePlaylist(playlistId: string, name: string) {
    setIsMutatingPlaylist(true)
    try {
      const updated = await renamePlaylist(playlistId, name)
      startTransition(() => {
        setPlaylists((current) =>
          current.map((playlist) => (playlist.id === updated.id ? updated : playlist)),
        )
        setPlaylistsErrorMessage(null)
      })
      pushToast(`Renamed playlist to "${updated.name}".`)
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not rename the playlist.'

      startTransition(() => {
        setPlaylistsErrorMessage(message)
      })
      return false
    } finally {
      setIsMutatingPlaylist(false)
    }
  }

  async function handleDeletePlaylist(playlistId: string) {
    setIsMutatingPlaylist(true)
    const deletedPlaylistName =
      playlists.find((playlist) => playlist.id === playlistId)?.name ?? 'playlist'
    try {
      await deletePlaylist(playlistId)
      startTransition(() => {
        setPlaylists((current) => {
          const next = current.filter((playlist) => playlist.id !== playlistId)
          setActivePlaylistId((active) => {
            if (active && active !== playlistId) {
              return active
            }
            return next[0]?.id ?? null
          })
          return next
        })
        setPlaylistsErrorMessage(null)
      })
      pushToast(`Deleted "${deletedPlaylistName}".`)
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not delete the playlist.'

      startTransition(() => {
        setPlaylistsErrorMessage(message)
      })
      return false
    } finally {
      setIsMutatingPlaylist(false)
    }
  }

  async function handleAddToPlaylists(video: VideoSearchResult, playlistIds: string[]) {
      if (playlistIds.length === 0) {
        setPlaylistsErrorMessage('Choose at least one playlist first.')
        return
      }

      setPendingPlaylistVideoId(video.id)
      setIsMutatingPlaylist(true)
      try {
        const results = await Promise.allSettled(
          playlistIds.map((playlistId) => addVideoToPlaylist(playlistId, video)),
        )

        const refreshed = await fetchPlaylists()
        startTransition(() => {
          setPlaylists(refreshed.items)
          setActivePlaylistId((current) => {
            if (current && refreshed.items.some((playlist) => playlist.id === current)) {
              return current
            }
            return refreshed.items[0]?.id ?? null
          })
        })

        const selectedPlaylistNames = refreshed.items
          .filter((playlist) => playlistIds.includes(playlist.id))
          .map((playlist) => playlist.name)
        const failed = results.filter((result) => result.status === 'rejected')
        if (failed.length > 0) {
          const reason =
            failed[0].status === 'rejected' && failed[0].reason instanceof Error
              ? failed[0].reason.message
              : 'One or more playlist updates failed.'
          const message = `Added to ${results.length - failed.length} playlist(s). ${reason}`

          startTransition(() => {
            setPlaylistsErrorMessage(message)
          })
          pushToast(message)
        } else {
          startTransition(() => {
            setPlaylistsErrorMessage(null)
          })
          pushToast(
            selectedPlaylistNames.length === 1
              ? `Added "${video.title}" to "${selectedPlaylistNames[0]}".`
              : `Added "${video.title}" to ${selectedPlaylistNames.length} playlists.`,
          )
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not add this video to the selected playlists.'

        startTransition(() => {
          setPlaylistsErrorMessage(message)
        })
        pushToast(message)
      } finally {
        setPendingPlaylistVideoId(null)
        setIsMutatingPlaylist(false)
      }
  }

  async function handleSaveToPlaylists(
    video: VideoSearchResult,
    playlistIds: string[],
    newPlaylistName: string,
  ) {
    let targetIds = playlistIds
    if (newPlaylistName) {
      const created = await handleCreatePlaylist(newPlaylistName)
      if (!created) return
      targetIds = [...playlistIds, created.id]
    }

    setSaveTarget(null)
    await handleAddToPlaylists(video, targetIds)
  }

  async function handleRemovePlaylistItem(playlistId: string, itemId: string) {
      setIsMutatingPlaylist(true)
      const playlist = playlists.find((entry) => entry.id === playlistId)
      const item = playlist?.items.find((entry) => entry.id === itemId)
      try {
        const updated = await removePlaylistItem(playlistId, itemId)
        startTransition(() => {
          setPlaylists((current) =>
            current.map((playlist) => (playlist.id === updated.id ? updated : playlist)),
          )
          setPlaylistsErrorMessage(null)
        })
        pushToast(`Removed "${item?.title ?? 'track'}" from "${updated.name}".`)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not remove playlist item.'

        startTransition(() => {
          setPlaylistsErrorMessage(message)
        })
      } finally {
        setIsMutatingPlaylist(false)
      }
  }

  async function handleMovePlaylistItem(
    playlistId: string,
    itemId: string,
    direction: 'up' | 'down',
  ) {
      const playlist = playlists.find((entry) => entry.id === playlistId)
      if (!playlist) {
        return
      }

      const items = [...playlist.items].sort((left, right) => left.position - right.position)
      const index = items.findIndex((item) => item.id === itemId)
      if (index < 0) {
        return
      }

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= items.length) {
        return
      }

      const [movedItem] = items.splice(index, 1)
      items.splice(targetIndex, 0, movedItem)
      const orderedItemIds = items.map((item) => item.id)

      setIsMutatingPlaylist(true)
      try {
        const updated = await reorderPlaylistItems(playlistId, orderedItemIds)
        startTransition(() => {
          setPlaylists((current) =>
            current.map((entry) => (entry.id === updated.id ? updated : entry)),
          )
          setPlaylistsErrorMessage(null)
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not reorder the playlist.'

        startTransition(() => {
          setPlaylistsErrorMessage(message)
        })
      } finally {
        setIsMutatingPlaylist(false)
      }
  }

  async function handleCreateExport(
    playlistId: string,
    exportFormat: 'zip' | 'combined_mp3',
  ) {
    setIsCreatingExport(true)
    try {
      const exportJob = await createPlaylistExport(playlistId, exportFormat)
      startTransition(() => {
        setExportJobs((current) => [exportJob, ...current.filter((job) => job.id !== exportJob.id)])
        setExportsErrorMessage(null)
      })
      pushToast(`Started ${exportFormat === 'zip' ? 'ZIP' : 'combined MP3'} export for "${exportJob.playlist_name}".`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not start playlist export.'

      startTransition(() => {
        setExportsErrorMessage(message)
      })
    } finally {
      setIsCreatingExport(false)
    }
  }

  async function handleCreateYouTubePlaylistExport(
    playlistUrl: string,
    exportFormat: PlaylistExportFormat,
  ) {
      setIsCreatingYouTubePlaylistExport(true)
      try {
        const exportJob = await createYouTubePlaylistExport(playlistUrl, exportFormat)
        startTransition(() => {
          setExportJobs((current) => [exportJob, ...current.filter((job) => job.id !== exportJob.id)])
          setExportsErrorMessage(null)
        })
        pushToast(
          `Started YouTube playlist ${
            exportFormat === 'zip' ? 'ZIP' : 'combined MP3'
          } export. Track it under Playlist download.`,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not start YouTube playlist export.'

        startTransition(() => {
          setExportsErrorMessage(message)
        })
        pushToast(message)
      } finally {
        setIsCreatingYouTubePlaylistExport(false)
      }
  }

  async function handleRemoveExport(exportJob: PlaylistExportJob, deleteFile: boolean) {
      setPendingExportRemovalIds((current) =>
        current.includes(exportJob.id) ? current : [...current, exportJob.id],
      )

      try {
        await removeExport(exportJob.id, deleteFile)
        startTransition(() => {
          setExportJobs((current) => current.filter((job) => job.id !== exportJob.id))
          setExportsErrorMessage(null)
        })
        pushToast(`Removed "${exportJob.playlist_name}" export.`)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not remove export entry.'

        startTransition(() => {
          setExportsErrorMessage(message)
        })
      } finally {
        setPendingExportRemovalIds((current) =>
          current.filter((id) => id !== exportJob.id),
        )
      }
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadDownloads(controller.signal)

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadPlaylists(controller.signal)

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadExports(controller.signal)

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadDiscordPresenceStatus(controller.signal)

    return () => {
      controller.abort()
    }
  }, [])

  const hasActiveDownloads = downloadJobs.some((job) =>
    ['queued', 'downloading', 'converting'].includes(job.status),
  )
  const hasActiveExports = exportJobs.some((job) =>
    ['queued', 'preparing', 'packaging'].includes(job.status),
  )

  useEffect(() => {
    if (!hasActiveDownloads) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadDownloads()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasActiveDownloads])

  useEffect(() => {
    if (!hasActiveExports) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadExports()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasActiveExports])

  // Opening a video stops the audio bar, otherwise both would play at once, and
  // any navigation closes the guide drawer.
  useEffect(() => {
    function handleHashChange() {
      setDrawerOpen(false)
      const nextRoute = parseRoute(window.location.hash)
      if (nextRoute.name === 'watch') {
        setPlayerSession(null)
      }
      if (nextRoute.name === 'music' && nextRoute.view === 'playlist') setActivePlaylistId(nextRoute.playlistId)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function getLatestDownloadForVideo(videoId: string) {
    return downloadJobs.find((job) => job.video_id === videoId) ?? null
  }

  // Keep theme in sync with DOM and localStorage.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('spotimy-theme', theme)
    } catch {
      // Some private browsing modes block storage writes.
    }
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  function handlePlayVideo(
    videoId: string,
    title: string,
    thumbnailUrl: string | null = null,
    channelTitle = '',
    sourceUrl = `https://www.youtube.com/watch?v=${videoId}`,
    durationLabel: string | null = null,
  ) {
    setPlayRequest(current => current + 1)
    setPlayerSession({
      source: 'single',
      playlistId: null,
      tracks: [{ videoId, title, thumbnailUrl, channelTitle, sourceUrl, durationLabel }],
      index: 0,
      shuffle: false,
    })
  }

  function handlePlayDownload(job: DownloadJob) {
    handlePlayVideo(
      job.video_id,
      job.title,
      job.thumbnail_path ?? job.thumbnail_url,
      job.channel_title,
      job.source_url,
    )
  }

  function handlePlayPlaylist(playlist: Playlist, shuffle: boolean) {
    const tracks = getOrderedPlaylistTracks(playlist)
    if (tracks.length === 0) {
      return
    }

    const ordered = shuffle ? shuffleTracks(tracks) : tracks
    setPlayRequest(current => current + 1)
    setPlayerSession({
      source: 'playlist',
      playlistId: playlist.id,
      tracks: ordered,
      index: 0,
      shuffle,
      orderedUpcoming: shuffle ? tracks.filter(track => track !== ordered[0]) : undefined,
    })
  }

  function handlePlayPlaylistItem(playlist: Playlist, itemId: string, shuffle: boolean) {
    const tracks = getOrderedPlaylistTracks(playlist)
    const item = playlist.items.find((entry) => entry.id === itemId)
    if (!item || tracks.length === 0) {
      return
    }

    const targetTrack = toPlayerTrack(item)
    setPlayRequest(current => current + 1)
    if (shuffle) {
      const remainingTracks = shuffleTracks(
        tracks.filter((track) => track.videoId !== targetTrack.videoId),
      )
      setPlayerSession({
        source: 'playlist',
        playlistId: playlist.id,
        tracks: [targetTrack, ...remainingTracks],
        index: 0,
        shuffle: true,
        orderedUpcoming: tracks.filter(track => track.videoId !== targetTrack.videoId),
      })
      return
    }

    setPlayerSession({
      source: 'playlist',
      playlistId: playlist.id,
      tracks,
      index: Math.max(0, tracks.findIndex((track) => track.videoId === targetTrack.videoId)),
      shuffle: false,
    })
  }

  function handlePreviousTrack() {
    setPlayRequest(current => current + 1)
    setPlayerSession((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        index: Math.max(0, current.index - 1),
      }
    })
  }

  function handleNextTrack() {
    setPlayRequest(current => current + 1)
    setPlayerSession((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        index: current.index < current.tracks.length - 1 ? current.index + 1 : loopMode === 'all' ? 0 : current.index,
      }
    })
  }

  function handleTrackEnded() {
    setPlayRequest(current => current + 1)
    setPlayerSession((current) => {
      if (!current) {
        return current
      }

      if (current.index >= current.tracks.length - 1) {
        return loopMode === 'all' ? { ...current, index: 0 } : current
      }

      return {
        ...current,
        index: current.index + 1,
      }
    })
  }

  function handleTogglePlayerShuffle() {
    setPlayerSession(current => current ? toggleQueueShuffle(current) : current)
  }

  function handleToggleLoopMode() {
    setLoopMode((current) => {
      if (isMusic) return current === 'off' ? 'all' : current === 'all' ? 'one' : 'off'
      if (current === 'off') {
        return 'once'
      }
      if (current === 'once') {
        return 'all'
      }
      return 'off'
    })
  }

  function handleConsumeLoopOnce() {
    setLoopMode('off')
  }

  const activePlaylist =
    playlists.find((playlist) => playlist.id === activePlaylistId) ?? playlists[0] ?? null
  const currentTrack = playerSession?.tracks[playerSession.index] ?? null
  const isPlaylistPlayback = Boolean(playerSession && (playerSession.source !== 'single' || playerSession.tracks.length > 1))
  const currentPlaybackPlaylistName =
    playerSession?.source === 'playlist'
      ? playlists.find((playlist) => playlist.id === playerSession.playlistId)?.name ?? null
      : null
  const currentTrackDiscordThumbnailUrl = currentTrack
    ? getDiscordPresenceThumbnailHref(currentTrack.videoId, getPlaylistSafeThumbnailUrl(currentTrack))
    : null

  const currentVideo = currentTrack ? {
    ...toVideoSearchResult(currentTrack),
    thumbnail_url: currentTrack.thumbnailUrl || getPlaylistSafeThumbnailUrl(currentTrack),
  } : null

  function videoToTrack(video: VideoSearchResult): PlayerTrack {
    return { videoId: video.id, title: video.title, channelTitle: video.channel_title, thumbnailUrl: video.thumbnail_url, sourceUrl: video.video_url, durationLabel: video.duration_label }
  }

  function handleMusicPlay(videos: VideoSearchResult[], index = 0, playlistId?: string) {
    if (!videos.length) return
    setPlayRequest(current => current + 1)
    setPlayerSession({ source: playlistId ? 'playlist' : 'queue', playlistId: playlistId ?? null, tracks: videos.map(videoToTrack), index: Math.max(0, Math.min(index, videos.length - 1)), shuffle: false })
  }

  function handleEnqueue(video: VideoSearchResult, next: boolean) {
    setPlayerSession(current => enqueueTrack(current, videoToTrack(video), next))
    pushToast(next ? 'Added to play next.' : 'Added to queue.')
  }

  async function handleAddCurrentTrackToPlaylists(playlistIds: string[]) {
    if (!currentTrack) {
      return
    }

    await handleAddToPlaylists(toVideoSearchResult(currentTrack), playlistIds)
  }

  const videoActions: VideoActions = {
    openDownload: (video, section) => setDownloadTarget({ video, section }),
    openSaveToPlaylist: setSaveTarget,
    playAudio: (video) =>
      handlePlayVideo(
        video.id,
        video.title,
        video.thumbnail_url,
        video.channel_title,
        video.video_url,
        video.duration_label,
      ),
    setWatchQueue,
    pushToast,
    getLatestDownload: getLatestDownloadForVideo,
    exportYouTubePlaylist: (playlistUrl, format) =>
      void handleCreateYouTubePlaylistExport(playlistUrl, format),
    isExportingYouTubePlaylist: isCreatingYouTubePlaylistExport,
  }

  // YouTube shows the full guide on wide screens, icons on medium ones and a drawer
  // otherwise; the watch page always uses the drawer to give the player room.
  const isWatchPage = route.name === 'watch'
  let sidebarMode: SidebarMode = 'hidden'
  if (!isWatchPage) {
    if (isWideScreen) sidebarMode = sidebarExpanded ? 'full' : 'mini'
    else if (isMediumScreen) sidebarMode = 'mini'
  }

  function handleToggleSidebar() {
    if (!isWatchPage && isWideScreen) {
      setSidebarExpanded((expanded) => !expanded)
    } else {
      setDrawerOpen((open) => !open)
    }
  }

  function renderPage(pageName = route.name) {
    switch (pageName) {
      case 'home':
        return <HomePage />
      case 'results':
        if (route.name !== 'results') return null
        return <SearchPage query={route.query} filters={route.filters} />
      case 'watch':
        if (route.name !== 'watch') return null
        return (
          <WatchPage
            key={route.videoId}
            videoId={route.videoId}
            startSeconds={route.startSeconds}
            listId={route.listId}
            watchQueue={watchQueue}
          />
        )
      case 'channel':
        if (route.name !== 'channel') return null
        return <ChannelPage key={route.channelRef} channelRef={route.channelRef} tab={route.tab} />
      case 'playlist':
        if (route.name !== 'playlist') return null
        return <PlaylistPage key={route.listId} listId={route.listId} />
      case 'subscriptions':
        return <SubscriptionsPage />
      case 'history':
        return <HistoryPage />
      case 'songs':
        return (
          <div className="library-page">
            <DownloadQueuePanel
              runtime={downloadRuntime}
              jobs={downloadJobs}
              errorMessage={downloadsErrorMessage}
              pendingRemovalIds={pendingDownloadRemovalIds}
              pendingRenameIds={pendingDownloadRenameIds}
              pendingRedownloadIds={pendingRedownloadIds}
              pendingPlaylistVideoId={pendingPlaylistVideoId}
              playlists={playlists}
              activePlaylistId={activePlaylist?.id ?? null}
              onRemoveJob={handleRemoveDownload}
              onCancelJob={handleCancelDownload}
              onRedownload={handleRedownload}
              onRenameJob={handleRenameDownload}
              onAddToPlaylists={handleAddDownloadToPlaylists}
              onPlay={handlePlayDownload}
              onWatch={handleWatchDownload}
            />
          </div>
        )
      case 'playlists':
        return (
          <div className="library-page">
            <PlaylistPanel
              playlists={playlists}
              activePlaylistId={activePlaylist?.id ?? null}
              errorMessage={playlistsErrorMessage}
              isCreating={isCreatingPlaylist}
              isMutating={isMutatingPlaylist}
              pendingVideoId={pendingPlaylistVideoId}
              onSelectPlaylist={setActivePlaylistId}
              onCreatePlaylist={(name) => void handleCreatePlaylist(name)}
              onRenamePlaylist={handleRenamePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onRemoveItem={handleRemovePlaylistItem}
              onMoveItem={handleMovePlaylistItem}
              onPlayPlaylist={handlePlayPlaylist}
              onPlayItem={handlePlayPlaylistItem}
              playingPlaylistId={
                playerSession?.source === 'playlist' ? playerSession.playlistId : null
              }
              playingVideoId={currentTrack?.videoId ?? null}
            />

            <PlaylistExportPanel
              activePlaylist={activePlaylist}
              exportJobs={exportJobs}
              errorMessage={exportsErrorMessage}
              isCreatingExport={isCreatingExport}
              pendingRemovalIds={pendingExportRemovalIds}
              onCreateExport={handleCreateExport}
              onRemoveExport={handleRemoveExport}
            />
          </div>
        )
      case 'import':
        return (
          <div className="library-page">
            <YouTubePlaylistDownloadPanel
              exportJobs={exportJobs}
              errorMessage={exportsErrorMessage}
              isCreating={isCreatingYouTubePlaylistExport}
              pendingRemovalIds={pendingExportRemovalIds}
              onCreateExport={handleCreateYouTubePlaylistExport}
              onRemoveExport={handleRemoveExport}
            />
          </div>
        )
    }
  }

  return (
    <VideoActionsContext.Provider value={videoActions}>
      {route.name === 'music' ? <MusicWorkspace
        route={route} playlists={playlists} downloads={downloadJobs} session={playerSession} currentVideo={currentVideo}
        playlistError={playlistsErrorMessage} busy={isCreatingPlaylist || isMutatingPlaylist}
        onPlay={handleMusicPlay} onEnqueue={handleEnqueue}
        onQueueJump={index => { setPlayRequest(current => current + 1); setPlayerSession(current => current && index >= 0 && index < current.tracks.length ? { ...current, index } : current) }}
        onQueueRemove={index => setPlayerSession(current => current ? removeQueuedTrack(current, index) : current)}
        onQueueMove={(index, direction) => setPlayerSession(current => current ? moveQueuedTrack(current, index, direction) : current)}
        onQueueClear={() => setPlayerSession(current => current ? { ...current, tracks: current.tracks.slice(0, current.index + 1), shuffle: false, orderedUpcoming: undefined } : current)}
        onDownload={video => setDownloadTarget({ video })} onSave={setSaveTarget}
        onCreatePlaylist={handleCreatePlaylist} onSelectPlaylist={setActivePlaylistId}
        onRenamePlaylist={handleRenamePlaylist} onDeletePlaylist={handleDeletePlaylist}
        onRemoveItem={handleRemovePlaylistItem} onMoveItem={handleMovePlaylistItem} onToast={pushToast}
        downloadsPanel={renderPage('songs')} importsPanel={renderPage('import')}
        exportsPanel={<PlaylistExportPanel activePlaylist={activePlaylist} exportJobs={exportJobs} errorMessage={exportsErrorMessage} isCreatingExport={isCreatingExport} pendingRemovalIds={pendingExportRemovalIds} onCreateExport={handleCreateExport} onRemoveExport={handleRemoveExport}/>}
      /> : <>
      <TopBar
        initialQuery={route.name === 'results' ? route.query : ''}
        onToggleSidebar={handleToggleSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
        isProcessing={hasActiveDownloads || hasActiveExports}
      />
      <Sidebar
        mode={sidebarMode}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        route={route}
      />
      <main
        className={`yt-main yt-main--sidebar-${sidebarMode} ${
          isWatchPage ? 'yt-main--watch' : ''
        } ${currentTrack ? 'yt-main--with-player' : ''}`}
      >
        {renderPage()}
      </main>
      </>}

      {downloadTarget ? (
        <DownloadOptionsDialog
          key={downloadTarget.video.id}
          video={downloadTarget.video}
          initialSection={downloadTarget.section}
          isBusy={pendingDownloadVideoIds.includes(downloadTarget.video.id)}
          onConfirm={handleConfirmDownloadOptions}
          onCancel={() => setDownloadTarget(null)}
        />
      ) : null}

      {saveTarget ? (
        <SaveToPlaylistDialog
          video={saveTarget}
          playlists={playlists}
          isBusy={isMutatingPlaylist || isCreatingPlaylist}
          onSave={(video, playlistIds, newName) =>
            void handleSaveToPlaylists(video, playlistIds, newName)
          }
          onCancel={() => setSaveTarget(null)}
        />
      ) : null}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <AudioPlayer
        variant={isMusic ? 'music' : 'video'}
        playRequest={playRequest}
        autoplay={playRequest > 0}
        hasMultipleTracks={Boolean(playerSession && playerSession.tracks.length > 1)}
        sleepAt={music.sleepAt}
        onSleep={() => { updateMusicState({ sleepAt: null }); pushToast('Sleep timer: playback paused.') }}
        onTrackPlaying={() => { if (currentVideo && !getMusicState().privateSession) recordHistory(currentVideo) }}
        extraControls={isMusic && currentVideo ? <>
          <button className={`music-icon-button ${music.liked.some(v => v.id === currentVideo.id) ? 'is-green' : ''}`} aria-label="Like playing song" aria-pressed={music.liked.some(v => v.id === currentVideo.id)} onClick={() => toggleLiked(currentVideo)}><MusicIcon name="heart" filled={music.liked.some(v => v.id === currentVideo.id)}/></button>
          <button className="music-icon-button" aria-label="Open play queue" onClick={() => updateMusicState({ sidebar: music.sidebar === 'queue' ? null : 'queue' })}><MusicIcon name="queue"/></button>
        </> : null}
        videoId={currentTrack?.videoId ?? null}
        title={currentTrack?.title ?? null}
        thumbnailUrl={currentTrack?.thumbnailUrl ?? null}
        discordThumbnailUrl={currentTrackDiscordThumbnailUrl}
        channelTitle={currentTrack?.channelTitle ?? null}
        sourceUrl={currentTrack?.sourceUrl ?? null}
        playlistName={currentPlaybackPlaylistName}
        streamUrl={currentTrack ? getStreamUrl(currentTrack.videoId) : null}
        discordPresenceEnabled={Boolean(
          !music.privateSession && discordPresenceStatus?.enabled &&
            discordPresenceStatus?.configured &&
            discordPresenceStatus?.available,
        )}
        isPlaylistPlayback={isPlaylistPlayback}
        canGoPrevious={Boolean(playerSession && playerSession.index > 0)}
        canGoNext={Boolean(
          playerSession && (playerSession.index < playerSession.tracks.length - 1 || loopMode === 'all'),
        )}
        shuffleEnabled={Boolean(playerSession?.shuffle)}
        loopMode={loopMode}
        playlists={playlists}
        activePlaylistId={activePlaylist?.id ?? null}
        isAddingToPlaylist={pendingPlaylistVideoId === currentTrack?.videoId}
        onPrevious={handlePreviousTrack}
        onNext={handleNextTrack}
        onToggleShuffle={handleTogglePlayerShuffle}
        onToggleLoop={handleToggleLoopMode}
        onLoopOnceConsumed={handleConsumeLoopOnce}
        onTrackEnded={handleTrackEnded}
        onAddToPlaylists={handleAddCurrentTrackToPlaylists}
        onClose={() => setPlayerSession(null)}
      />
    </VideoActionsContext.Provider>
  )
}

export default App
