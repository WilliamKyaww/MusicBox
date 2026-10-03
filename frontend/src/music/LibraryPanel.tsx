import { useDeferredValue, useState, type DragEvent, type ReactNode } from 'react'
import { musicPath, type MusicRoute } from '../experience'
import { toggleSubscription, useLibrary } from '../library'
import type { Playlist } from '../types'
import { isTrackDrag, playlistVideo, readTrackDrag, sortedItems } from './helpers'
import type { MenuItem } from './Menu'
import { MusicIcon } from './MusicIcon'
import { useMusic } from './MusicContext'
import { usePlayback } from './playback'
import {
  assignFolder,
  deleteFolder,
  isLiked,
  toggleLiked,
  togglePinned,
  toggleSavedAlbum,
  updateMusicState,
  useMusicStore,
  type Folder,
  type LibrarySort,
  type LibraryView,
} from './store'
import { Artwork, Mosaic } from './ui'

type Filter = '' | 'playlists' | 'artists' | 'albums'
type Kind = 'liked' | 'downloads' | 'playlist' | 'artist' | 'album' | 'folder'
type Entry = {
  key: string
  kind: Kind
  id: string
  title: string
  meta: string
  href: string
  art: ReactNode
  added: string
  recent: string
  creator: string
  playlist?: Playlist
  folder?: Folder
  children?: Entry[]
}

const SORTS: [LibrarySort, string][] = [
  ['recents', 'Recents'],
  ['added', 'Recently added'],
  ['alpha', 'Alphabetical'],
  ['creator', 'Creator'],
]
const VIEWS: [LibraryView, string, 'list' | 'compact' | 'grid'][] = [
  ['compact', 'Compact', 'compact'],
  ['list', 'List', 'list'],
  ['grid', 'Grid', 'grid'],
]

export function LibraryPanel({
  route,
  open,
  onRenameFolder,
}: {
  route: MusicRoute
  open: boolean
  onRenameFolder: (folder: Folder) => void
}) {
  const music = useMusic()
  const store = useMusicStore()
  const subscriptions = useLibrary((state) => state.subscriptions)
  const isPlaying = usePlayback((state) => state.isPlaying)
  const [filter, setFilter] = useState<Filter>('')
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [dropKey, setDropKey] = useState('')
  const query = useDeferredValue(text).trim().toLocaleLowerCase()
  const collapsed = store.libraryCollapsed && !open
  const view = store.libraryView
  const playingContext = music.session?.context

  const recentOf = (kind: string, id: string, fallback: string) =>
    store.recentContexts.find((c) => c.kind === kind && c.id === id)?.playedAt ?? fallback

  function playlistEntry(playlist: Playlist): Entry {
    const items = sortedItems(playlist)
    return {
      key: playlist.id,
      kind: 'playlist',
      id: playlist.id,
      title: playlist.name,
      meta: `Playlist · ${playlist.items.length} song${playlist.items.length === 1 ? '' : 's'}`,
      href: musicPath('playlist', playlist.id),
      art: <Mosaic images={items.map((item) => item.thumbnail_url)} name={playlist.name} />,
      added: playlist.created_at,
      recent: recentOf('playlist', playlist.id, playlist.updated_at),
      creator: 'MusicBox',
      playlist,
    }
  }

  const inFolder = new Set(store.folders.flatMap((f) => f.playlistIds))
  const entries: Entry[] = [
    {
      key: 'liked',
      kind: 'liked',
      id: 'liked',
      title: 'Liked Songs',
      meta: `Playlist · ${store.liked.length} song${store.liked.length === 1 ? '' : 's'}`,
      href: musicPath('liked'),
      art: <Artwork liked name="Liked Songs" />,
      added: '9999',
      recent: '9999',
      creator: 'MusicBox',
    },
  ]
  const downloaded = music.downloads.filter(
    (d) => d.status === 'completed' && d.media_kind === 'audio',
  ).length
  if (downloaded)
    entries.push({
      key: 'downloads',
      kind: 'downloads',
      id: 'downloads',
      title: 'Downloaded',
      meta: `Playlist · ${downloaded} song${downloaded === 1 ? '' : 's'}`,
      href: musicPath('downloads'),
      art: <Artwork name="Downloaded" icon="download" hue={141} />,
      added: '0',
      recent: recentOf('downloads', 'downloads', '0'),
      creator: 'MusicBox',
    })
  for (const folder of store.folders) {
    const children = music.playlists
      .filter((p) => folder.playlistIds.includes(p.id))
      .map(playlistEntry)
    entries.push({
      key: `folder:${folder.id}`,
      kind: 'folder',
      id: folder.id,
      title: folder.name,
      meta: `Folder · ${children.length} playlist${children.length === 1 ? '' : 's'}`,
      href: '',
      art: <Artwork name={folder.name} icon="folder" hue={220} />,
      added: '0',
      recent: children.map((c) => c.recent).sort().at(-1) ?? '0',
      creator: 'MusicBox',
      folder,
      children,
    })
  }
  for (const playlist of music.playlists)
    if (!inFolder.has(playlist.id) || query) entries.push(playlistEntry(playlist))
  for (const artist of subscriptions)
    entries.push({
      key: `artist:${artist.id}`,
      kind: 'artist',
      id: artist.id,
      title: artist.name,
      meta: 'Artist',
      href: musicPath('artist', artist.id),
      art: <Artwork round src={artist.avatarUrl} name={artist.name} icon="artist" />,
      added: artist.subscribedAt,
      recent: recentOf('artist', artist.id, artist.subscribedAt),
      creator: artist.name,
    })
  for (const album of store.savedAlbums)
    entries.push({
      key: `album:${album.id}`,
      kind: 'album',
      id: album.id,
      title: album.title,
      meta: `Playlist · ${album.channelTitle || 'YouTube'}`,
      href: musicPath('album', album.id),
      art: <Artwork src={album.thumbnailUrl} name={album.title} icon="album" />,
      added: album.savedAt,
      recent: recentOf('album', album.id, album.savedAt),
      creator: album.channelTitle,
    })

  const matchesFilter = (entry: Entry) =>
    !filter ||
    (filter === 'playlists' && ['liked', 'downloads', 'playlist', 'folder'].includes(entry.kind)) ||
    (filter === 'artists' && entry.kind === 'artist') ||
    (filter === 'albums' && entry.kind === 'album')
  const pinRank = (entry: Entry) =>
    entry.kind === 'liked' ? -1 : store.pinned.includes(entry.key) ? 0 : 1
  const shown = entries
    .filter(
      (entry) =>
        matchesFilter(entry) &&
        (!query || (entry.kind !== 'folder' && entry.title.toLocaleLowerCase().includes(query))),
    )
    .sort((a, b) => {
      const pin = pinRank(a) - pinRank(b)
      if (pin) return pin
      if (store.librarySort === 'alpha') return a.title.localeCompare(b.title)
      if (store.librarySort === 'creator')
        return a.creator.localeCompare(b.creator) || a.title.localeCompare(b.title)
      if (store.librarySort === 'added') return b.added.localeCompare(a.added)
      return b.recent.localeCompare(a.recent)
    })

  function isCurrentRoute(entry: Entry) {
    if (entry.kind === 'liked') return route.view === 'liked'
    if (entry.kind === 'downloads') return route.view === 'downloads'
    return route.view === entry.kind && route.id === entry.id
  }
  function isPlayingFrom(entry: Entry) {
    return (
      entry.kind !== 'folder' &&
      playingContext?.kind === entry.kind &&
      playingContext.id === entry.id
    )
  }

  function entryMenu(entry: Entry): MenuItem[] {
    const pinned = store.pinned.includes(entry.key)
    const pin: MenuItem = {
      label: pinned ? 'Unpin' : 'Pin',
      icon: 'pin',
      onSelect: () => togglePinned(entry.key),
    }
    if (entry.kind === 'playlist' && entry.playlist) {
      const playlist = entry.playlist
      const folderId = store.folders.find((f) => f.playlistIds.includes(playlist.id))?.id
      return [
        {
          label: 'Add to queue',
          icon: 'queue',
          disabled: !playlist.items.length,
          onSelect: () => music.enqueueMany(sortedItems(playlist).map(playlistVideo)),
        },
        { kind: 'separator' },
        { label: 'Edit details', icon: 'edit', onSelect: () => music.editPlaylist(playlist) },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => music.confirmDeletePlaylist(playlist) },
        { kind: 'separator' },
        { ...pin, label: pinned ? 'Unpin playlist' : 'Pin playlist' },
        {
          label: 'Move to folder',
          icon: 'folder',
          submenu: [
            { label: 'Create folder', icon: 'plus', onSelect: () => music.newFolder(playlist.id) },
            ...(store.folders.length ? [{ kind: 'separator' as const }] : []),
            ...store.folders.map((folder) => ({
              label: folder.name,
              checked: folder.id === folderId,
              onSelect: () => assignFolder(playlist.id, folder.id),
            })),
            ...(folderId
              ? [{ kind: 'separator' as const }, { label: 'Remove from folder', onSelect: () => assignFolder(playlist.id, '') }]
              : []),
          ],
        },
      ]
    }
    if (entry.kind === 'artist')
      return [
        {
          label: 'Unfollow',
          icon: 'close',
          onSelect: () => {
            toggleSubscription({ id: entry.id, name: entry.title, handle: null, avatarUrl: null })
            updateMusicState({ pinned: store.pinned.filter((key) => key !== entry.key) })
          },
        },
        { ...pin, label: pinned ? 'Unpin artist' : 'Pin artist' },
      ]
    if (entry.kind === 'album')
      return [
        {
          label: 'Remove from Your Library',
          icon: 'close',
          onSelect: () =>
            toggleSavedAlbum({ id: entry.id, title: entry.title, channelTitle: '', channelId: '', thumbnailUrl: null }),
        },
        pin,
      ]
    if (entry.kind === 'folder' && entry.folder) {
      const folder = entry.folder
      return [
        { label: 'Rename', icon: 'edit', onSelect: () => onRenameFolder(folder) },
        { label: 'Delete folder', icon: 'trash', danger: true, onSelect: () => deleteFolder(folder.id) },
        { kind: 'separator' },
        { ...pin, label: pinned ? 'Unpin folder' : 'Pin folder' },
      ]
    }
    return []
  }

  function dropHandlers(entry: Entry) {
    if (entry.kind !== 'playlist' && entry.kind !== 'liked') return {}
    return {
      onDragOver: (event: DragEvent) => {
        if (!isTrackDrag(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropKey(entry.key)
      },
      onDragLeave: () => setDropKey(''),
      onDrop: (event: DragEvent) => {
        setDropKey('')
        const video = readTrackDrag(event)
        if (!video) return
        event.preventDefault()
        if (entry.kind === 'liked') {
          if (isLiked(video.id)) music.toast('Already in Liked Songs.')
          else {
            toggleLiked(video)
            music.toast('Added to Liked Songs.')
          }
        } else void music.addToPlaylist(video, entry.id)
      },
    }
  }

  function renderEntry(entry: Entry, depth = 0): ReactNode {
    const pinned = entry.kind === 'liked' || store.pinned.includes(entry.key)
    const playing = isPlayingFrom(entry)
    const isOpen = expanded.includes(entry.id)
    const content = (
      <>
        {view === 'compact' && !collapsed ? null : entry.art}
        <span className="music-library-item__text">
          <strong>{entry.title}</strong>
          {collapsed ? null : (
            <small>
              {pinned ? <MusicIcon name="pin" filled /> : null}
              {entry.meta}
            </small>
          )}
        </span>
        {playing && !collapsed ? (
          <span className="music-library-item__playing" aria-label={isPlaying ? 'Playing' : 'Paused'}>
            <MusicIcon name="speaker" />
          </span>
        ) : null}
      </>
    )
    const className = `music-library-item ${isCurrentRoute(entry) ? 'is-current' : ''} ${
      playing ? 'is-playing' : ''
    } ${dropKey === entry.key ? 'is-drop-target' : ''}`
    const common = {
      className,
      title: collapsed ? entry.title : undefined,
      style: depth ? { paddingLeft: 9 + depth * 18 } : undefined,
      onContextMenu: (event: React.MouseEvent) => {
        const items = entryMenu(entry)
        if (!items.length) return
        event.preventDefault()
        music.openMenu(items, { x: event.clientX, y: event.clientY }, `${entry.title} options`)
      },
      ...dropHandlers(entry),
    }
    return (
      <div key={entry.key} role="listitem">
        {entry.kind === 'folder' ? (
          <button
            type="button"
            {...common}
            aria-expanded={isOpen}
            onClick={() =>
              setExpanded(isOpen ? expanded.filter((id) => id !== entry.id) : [...expanded, entry.id])
            }
          >
            {content}
            {collapsed ? null : <MusicIcon name={isOpen ? 'down' : 'forward'} />}
          </button>
        ) : (
          <a {...common} href={entry.href}>
            {content}
          </a>
        )}
        {entry.kind === 'folder' && isOpen && !collapsed
          ? entry.children?.length
            ? entry.children.map((child) => renderEntry(child, depth + 1))
            : <p className="music-library__empty">This folder is empty. Use a playlist's menu to move it here.</p>
          : null}
      </div>
    )
  }

  const createMenu: MenuItem[] = [
    { label: 'Playlist', icon: 'music', onSelect: () => music.newPlaylist() },
    { label: 'Folder', icon: 'folder', onSelect: () => music.newFolder() },
  ]
  const optionsMenu: MenuItem[] = [
    { kind: 'heading', label: 'Sort by' },
    ...SORTS.map(([value, label]) => ({
      label,
      checked: store.librarySort === value,
      onSelect: () => updateMusicState({ librarySort: value }),
    })),
    { kind: 'separator' },
    { kind: 'heading', label: 'View as' },
    ...VIEWS.map(([value, label, icon]) => ({
      label,
      icon,
      checked: view === value,
      onSelect: () => updateMusicState({ libraryView: value }),
    })),
  ]
  const filters: [Filter, string][] = [
    ['playlists', 'Playlists'],
    ['artists', 'Artists'],
    ['albums', 'Albums'],
  ]

  return (
    <aside
      className={`music-library ${open ? 'music-library--open' : ''} ${
        collapsed ? 'music-library--collapsed' : ''
      } music-library--${view}`}
      aria-label="Your Library"
    >
      <div className="music-library__heading">
        <button
          type="button"
          className="music-library__title"
          aria-label={collapsed ? 'Expand Your Library' : 'Collapse Your Library'}
          title={collapsed ? 'Expand Your Library' : 'Collapse Your Library'}
          onClick={() => updateMusicState({ libraryCollapsed: !store.libraryCollapsed })}
        >
          <MusicIcon name="library" filled={!collapsed} />
          {collapsed ? null : <span>Your Library</span>}
        </button>
        <button
          type="button"
          className="music-create-button"
          aria-label="Create playlist or folder"
          aria-haspopup="menu"
          onClick={(event) =>
            music.openMenu(createMenu, event.currentTarget.getBoundingClientRect(), 'Create')
          }
        >
          <MusicIcon name="plus" />
          {collapsed ? null : <span>Create</span>}
        </button>
      </div>
      {collapsed ? null : (
        <>
          <div className="music-chips music-library__chips" role="group" aria-label="Filter Your Library">
            {filter ? (
              <button
                type="button"
                className="music-chip-clear"
                aria-label="Clear filter"
                onClick={() => setFilter('')}
              >
                <MusicIcon name="close" />
              </button>
            ) : null}
            {filters
              .filter(([value]) => !filter || filter === value)
              .map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  className={filter === value ? 'is-active' : ''}
                  onClick={() => setFilter(filter === value ? '' : value)}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="music-library__tools">
            {searching || text ? (
              <label className="music-filter has-value">
                <MusicIcon name="search" />
                <input
                  autoFocus
                  type="search"
                  aria-label="Search in Your Library"
                  placeholder="Search in Your Library"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onBlur={() => setSearching(false)}
                />
              </label>
            ) : (
              <button
                type="button"
                className="music-icon-button"
                aria-label="Search in Your Library"
                onClick={() => setSearching(true)}
              >
                <MusicIcon name="search" />
              </button>
            )}
            <button
              type="button"
              className="music-sort-button"
              aria-haspopup="menu"
              aria-label={`Sort by ${SORTS.find(([value]) => value === store.librarySort)?.[1]}, view as ${view}`}
              onClick={(event) =>
                music.openMenu(optionsMenu, event.currentTarget.getBoundingClientRect(), 'Sort and view')
              }
            >
              {SORTS.find(([value]) => value === store.librarySort)?.[1]}
              <MusicIcon name={view} />
            </button>
          </div>
        </>
      )}
      <div className="music-library__items" role="list">
        {shown.map((entry) => renderEntry(entry))}
        {!shown.length ? (
          <p className="music-library__empty">
            {query || filter ? 'Nothing in your library matches.' : 'Your playlists will appear here.'}
          </p>
        ) : null}
      </div>
      {collapsed ? null : (
        <a className="music-library__import" href={musicPath('imports')}>
          <MusicIcon name="download" />
          Import &amp; export tools
        </a>
      )}
    </aside>
  )
}
