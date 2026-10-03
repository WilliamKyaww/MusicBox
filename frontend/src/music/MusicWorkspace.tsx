import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ExperienceSwitcher } from '../components/ExperienceSwitcher'
import { artistPath, musicPath, type MusicRoute } from '../experience'
import { navigate, paths } from '../router'
import type { DownloadJob, Playlist, VideoSearchResult } from '../types'
import { FullScreenPlayer } from './FullScreenPlayer'
import { copyText, hueStyle } from './helpers'
import { LibraryPanel } from './LibraryPanel'
import { Menu, type MenuAnchor, type MenuItem } from './Menu'
import { MusicDialog } from './MusicDialog'
import { MusicIcon } from './MusicIcon'
import {
  MusicContext,
  type MusicActions,
  type PlaySource,
  type StickyHeader,
  type TrackMenuExtras,
} from './MusicContext'
import type { PlayerSession } from './queue'
import { SHORTCUTS, useMusicShortcuts } from './shortcuts'
import { NowPlayingPanel, QueuePanel } from './SidePanels'
import {
  assignFolder,
  createFolder,
  getMusicState,
  isLiked,
  NARROW,
  recordContext,
  renameFolder,
  setPlaylistNote,
  toggleLiked,
  updateMusicState,
  useMusicStore,
  type Folder,
} from './store'
import { PlayButton } from './ui'
import { AlbumView } from './views/AlbumView'
import { ArtistView } from './views/ArtistView'
import { CollectionView } from './views/CollectionView'
import { HomeView } from './views/HomeView'
import { ArtistsView, ImportsView, PlaylistsView } from './views/LibraryViews'
import { LyricsView } from './views/LyricsView'
import { SearchView } from './views/SearchView'
import { SettingsView } from './views/SettingsView'

type Props = {
  route: MusicRoute
  playlists: Playlist[]
  downloads: DownloadJob[]
  session: PlayerSession | null
  currentVideo: VideoSearchResult | null
  playlistError: string | null
  busy: boolean
  fullScreen: boolean
  onFullScreenChange: (open: boolean) => void
  onPlay: (
    videos: VideoSearchResult[],
    index: number,
    source: PlaySource | undefined,
    options: { shuffle?: boolean },
  ) => void
  onEnqueue: (video: VideoSearchResult, next: boolean) => void
  onEnqueueMany: (videos: VideoSearchResult[]) => void
  onQueueJump: (index: number) => void
  onQueueRemove: (index: number) => void
  onQueueMove: (index: number, direction: -1 | 1) => void
  onQueueMoveTo: (from: number, to: number) => void
  onQueueClear: () => void
  onDownload: (video: VideoSearchResult) => void
  onSave: (video: VideoSearchResult) => void
  onAddToPlaylist: (video: VideoSearchResult, playlistId: string) => Promise<void>
  onCreatePlaylist: (name: string) => Promise<Playlist | null>
  onRenamePlaylist: (id: string, name: string) => Promise<boolean>
  onDeletePlaylist: (id: string) => Promise<boolean>
  onRemoveItem: (id: string, itemId: string) => Promise<void>
  onReorderPlaylist: (id: string, orderedItemIds: string[]) => Promise<void>
  onToast: (message: string) => void
  downloadsPanel: ReactNode
  exportsPanel: ReactNode
  importsPanel: ReactNode
}

type Editing =
  | { mode: 'create'; thenAdd?: VideoSearchResult }
  | { mode: 'edit'; playlist: Playlist }
  | { mode: 'delete'; playlist: Playlist }
  | { mode: 'folder'; thenAssign?: string }
  | { mode: 'rename-folder'; folder: Folder }

const SCROLLED_AT = 260

export function MusicWorkspace(props: Props) {
  const { route, currentVideo } = props
  const music = useMusicStore()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [menu, setMenu] = useState<{ items: MenuItem[]; anchor: MenuAnchor; label: string } | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [mobileLibrary, setMobileLibrary] = useState(false)
  const [sticky, setSticky] = useState<Omit<StickyHeader, 'onPlay'> & { canPlay: boolean } | null>(null)
  const stickyPlay = useRef<(() => void) | undefined>(undefined)
  const [scrolled, setScrolled] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const routeSearch = route.view === 'search' ? route.query : ''
  const [search, setSearch] = useState({ text: routeSearch, query: routeSearch })
  let searchText = search.text
  if (search.query !== routeSearch) {
    // Keep what is being typed when the debounced search catches up with it.
    const text = routeSearch === search.text.trim() ? search.text : routeSearch
    setSearch({ text, query: routeSearch })
    searchText = text
  }

  useEffect(() => {
    const value = searchText.trim()
    if (value === routeSearch) return
    if (!value) {
      if (route.view === 'search' && routeSearch)
        navigate(musicPath('search'), { replace: true })
      return
    }
    // Each YouTube search costs API quota, so wait for a pause and a few letters.
    if (value.length < 3) return
    const timer = window.setTimeout(
      () => navigate(musicPath('search', value), { replace: route.view === 'search' }),
      700,
    )
    return () => window.clearTimeout(timer)
  }, [searchText, routeSearch, route.view])

  const setStickyHeader = useCallback((header: StickyHeader | null) => {
    stickyPlay.current = header?.onPlay
    setSticky((previous) => {
      if (!header) return null
      const next = {
        title: header.title,
        hue: header.hue,
        playing: header.playing,
        canPlay: Boolean(header.onPlay),
      }
      return previous &&
        previous.title === next.title &&
        previous.hue === next.hue &&
        previous.playing === next.playing &&
        previous.canPlay === next.canPlay
        ? previous
        : next
    })
  }, [])

  function play(
    videos: VideoSearchResult[],
    index = 0,
    source?: PlaySource,
    options: { shuffle?: boolean } = {},
  ) {
    if (!videos.length) return
    if (source)
      recordContext({
        kind: source.kind,
        id: source.id,
        title: source.title,
        subtitle: source.subtitle ?? '',
        imageUrl: source.imageUrl ?? videos[0]?.thumbnail_url ?? null,
      })
    props.onPlay(videos, index, source, options)
  }

  function openEditor(next: Editing) {
    setDraftName(
      next.mode === 'edit'
        ? next.playlist.name
        : next.mode === 'rename-folder'
          ? next.folder.name
          : next.mode === 'create' && next.thenAdd
            ? next.thenAdd.title.slice(0, 120)
            : '',
    )
    setDraftNote(next.mode === 'edit' ? (getMusicState().playlistNotes[next.playlist.id] ?? '') : '')
    setEditing(next)
  }

  async function confirmEdit() {
    if (!editing) return
    const name = draftName.trim()
    if (editing.mode === 'create') {
      const created = await props.onCreatePlaylist(name)
      if (!created) return
      if (editing.thenAdd) await props.onAddToPlaylist(editing.thenAdd, created.id)
      else navigate(musicPath('playlist', created.id))
    }
    if (editing.mode === 'edit') {
      if (name !== editing.playlist.name && !(await props.onRenamePlaylist(editing.playlist.id, name)))
        return
      setPlaylistNote(editing.playlist.id, draftNote)
    }
    if (editing.mode === 'delete') {
      if (!(await props.onDeletePlaylist(editing.playlist.id))) return
      if (route.view === 'playlist' && route.id === editing.playlist.id)
        navigate(musicPath('playlists'))
    }
    if (editing.mode === 'folder') {
      const folder = createFolder(name)
      if (folder && editing.thenAssign) assignFolder(editing.thenAssign, folder.id)
    }
    if (editing.mode === 'rename-folder') renameFolder(editing.folder.id, name)
    setEditing(null)
  }

  function trackMenu(video: VideoSearchResult, extras: TrackMenuExtras = {}): MenuItem[] {
    const liked = isLiked(video.id)
    const item = extras.playlist?.items.find((entry) => entry.video_id === video.id)
    const items: (MenuItem | false | undefined)[] = [
      {
        label: 'Add to playlist',
        icon: 'plus',
        searchPlaceholder: 'Find a playlist',
        submenu: [
          {
            label: 'New playlist',
            icon: 'plus',
            onSelect: () => openEditor({ mode: 'create', thenAdd: video }),
          },
          ...(props.playlists.length ? [{ kind: 'separator' as const }] : []),
          ...props.playlists.map((playlist) => ({
            label: playlist.name,
            onSelect: () => void props.onAddToPlaylist(video, playlist.id),
          })),
        ],
      },
      extras.playlist &&
        item && {
          label: 'Remove from this playlist',
          icon: 'trash',
          disabled: props.busy,
          onSelect: () => void props.onRemoveItem(extras.playlist!.id, item.id),
        },
      {
        label: liked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs',
        icon: liked ? 'check-circle' : 'heart',
        onSelect: () =>
          props.onToast(toggleLiked(video) ? 'Added to Liked Songs.' : 'Removed from Liked Songs.'),
      },
      { label: 'Add to queue', icon: 'queue', onSelect: () => props.onEnqueue(video, false) },
      { label: 'Play next', icon: 'next', onSelect: () => props.onEnqueue(video, true) },
      extras.queueIndex !== undefined && {
        label: 'Remove from queue',
        icon: 'close',
        onSelect: () => props.onQueueRemove(extras.queueIndex!),
      },
      extras.moveUp && { label: 'Move up', icon: 'up', onSelect: extras.moveUp },
      extras.moveDown && { label: 'Move down', icon: 'down', onSelect: extras.moveDown },
      { kind: 'separator' },
      {
        label: 'Go to song radio',
        icon: 'radio',
        onSelect: () =>
          navigate(
            musicPath('mix', video.channel_title || video.title, {
              title: `${video.title} Radio`,
              v: video.id,
            }),
          ),
      },
      {
        label: 'Go to artist',
        icon: 'artist',
        onSelect: () => navigate(artistPath(video.channel_id, video.id)),
      },
      video.id === currentVideo?.id && {
        label: 'Show lyrics',
        icon: 'mic',
        onSelect: () => navigate(musicPath('lyrics')),
      },
      { kind: 'separator' },
      { label: 'Download', icon: 'download', onSelect: () => props.onDownload(video) },
      {
        label: 'Watch music video',
        icon: 'video',
        onSelect: () => navigate(paths.watch(video.id)),
      },
      {
        label: 'Share',
        icon: 'link',
        submenu: [
          {
            label: 'Copy song link',
            icon: 'link',
            onSelect: () =>
              copyText(
                video.video_url || `https://www.youtube.com/watch?v=${video.id}`,
                props.onToast,
              ),
          },
        ],
      },
    ]
    return items.filter(Boolean) as MenuItem[]
  }

  const actions: MusicActions = {
    playlists: props.playlists,
    downloads: props.downloads,
    session: props.session,
    currentVideo,
    busy: props.busy,
    play,
    enqueue: props.onEnqueue,
    enqueueMany: props.onEnqueueMany,
    download: props.onDownload,
    saveToPlaylists: props.onSave,
    addToPlaylist: props.onAddToPlaylist,
    createPlaylist: props.onCreatePlaylist,
    newPlaylist: (thenAdd) => openEditor({ mode: 'create', thenAdd }),
    editPlaylist: (playlist) => openEditor({ mode: 'edit', playlist }),
    confirmDeletePlaylist: (playlist) => openEditor({ mode: 'delete', playlist }),
    removeFromPlaylist: props.onRemoveItem,
    reorderPlaylist: props.onReorderPlaylist,
    newFolder: (thenAssign) => openEditor({ mode: 'folder', thenAssign }),
    toast: props.onToast,
    openMenu: (items, anchor, label) => setMenu({ items, anchor, label }),
    openTrackMenu: (video, anchor, extras) =>
      setMenu({ items: trackMenu(video, extras), anchor, label: `${video.title} options` }),
    queue: {
      jump: props.onQueueJump,
      remove: props.onQueueRemove,
      move: props.onQueueMove,
      moveTo: props.onQueueMoveTo,
      clear: props.onQueueClear,
    },
    showFullScreen: () => props.onFullScreenChange(true),
    setStickyHeader,
  }

  useMusicShortcuts({
    focusSearch: () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    },
    newPlaylist: () => openEditor({ mode: 'create' }),
    toggleLibrary: () => updateMusicState({ libraryCollapsed: !getMusicState().libraryCollapsed }),
    toggleSidebar: (panel) =>
      updateMusicState({ sidebar: getMusicState().sidebar === panel ? null : panel }),
    showShortcuts: () => setShowShortcuts(true),
    fullScreen: () => props.onFullScreenChange(true),
    likeCurrent: () => {
      if (currentVideo)
        props.onToast(
          toggleLiked(currentVideo) ? 'Added to Liked Songs.' : 'Removed from Liked Songs.',
        )
    },
  })

  const routeKey = `${route.view}:${route.id}:${route.query}:${route.title}:${route.video}`
  const mainRef = useRef<HTMLElement>(null)
  const [shownRoute, setShownRoute] = useState(routeKey)
  if (shownRoute !== routeKey) {
    // Following a link from the phone library sheet closes it.
    setShownRoute(routeKey)
    setMobileLibrary(false)
  }
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    if (window.matchMedia(NARROW).matches && getMusicState().sidebar)
      updateMusicState({ sidebar: null })
  }, [routeKey])
  const panel = music.sidebar === 'now-playing' && !currentVideo ? null : music.sidebar
  const scrolledHue = useMemo(() => hueStyle(sticky?.hue), [sticky?.hue])

  function content() {
    switch (route.view) {
      case 'home':
        return <HomeView />
      case 'search':
        return <SearchView route={route} />
      case 'playlist':
      case 'liked':
      case 'recent':
      case 'repeat':
      case 'mix':
      case 'downloads':
        return (
          <CollectionView
            route={route}
            exportsPanel={props.exportsPanel}
            downloadsPanel={props.downloadsPanel}
          />
        )
      case 'artist':
        return <ArtistView route={route} />
      case 'album':
        return <AlbumView route={route} />
      case 'lyrics':
        return <LyricsView />
      case 'playlists':
        return <PlaylistsView />
      case 'artists':
        return <ArtistsView />
      case 'imports':
        return <ImportsView importsPanel={props.importsPanel} />
      case 'settings':
        return <SettingsView onShowShortcuts={() => setShowShortcuts(true)} />
    }
  }

  const editorTitle = editing
    ? {
        create: 'Create playlist',
        edit: 'Edit details',
        delete: 'Delete from Your Library?',
        folder: 'Create folder',
        'rename-folder': 'Rename folder',
      }[editing.mode]
    : ''

  return (
    <MusicContext.Provider value={actions}>
      <div
        className={`music-app ${panel ? 'music-app--aside' : ''} ${
          music.libraryCollapsed ? 'music-app--library-collapsed' : ''
        } ${currentVideo ? '' : 'music-app--idle'}`}
      >
        <header className="music-topbar">
          <a className="music-brand" href={musicPath()} aria-label="MusicBox home">
            <img src="/favicon.svg" alt="" />
            <strong>MusicBox</strong>
          </a>
          <div className="music-topbar__history">
            <button
              type="button"
              className="music-icon-button music-icon-button--dark"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <MusicIcon name="back" />
            </button>
            <button
              type="button"
              className="music-icon-button music-icon-button--dark"
              aria-label="Go forward"
              onClick={() => window.history.forward()}
            >
              <MusicIcon name="forward" />
            </button>
          </div>
          <div className="music-topbar__center">
            <a
              className={`music-home-button ${route.view === 'home' ? 'is-current' : ''}`}
              href={musicPath()}
              aria-label="Home"
              title="Home"
            >
              <MusicIcon name="home" filled={route.view === 'home'} />
            </a>
            <form
              className="music-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault()
                const query = searchText.trim()
                navigate(musicPath('search', query))
              }}
            >
              <MusicIcon name="search" />
              <input
                ref={searchRef}
                type="search"
                value={searchText}
                onChange={(event) => setSearch({ text: event.target.value, query: routeSearch })}
                placeholder="What do you want to play?"
                aria-label="Search music"
              />
              <button type="submit" aria-label="Submit music search" title="Browse">
                <MusicIcon name="browse" />
              </button>
            </form>
          </div>
          <div className="music-topbar__end">
            {music.privateSession ? (
              <span className="music-private" title="Private session">
                <MusicIcon name="artist" />
                <span>Private session</span>
              </span>
            ) : null}
            <ExperienceSwitcher active="music" />
            <a
              className="music-icon-button"
              href={musicPath('settings')}
              aria-label="Listening settings"
              title="Settings"
            >
              <MusicIcon name="settings" />
            </a>
          </div>
        </header>

        <LibraryPanel
          route={route}
          open={mobileLibrary}
          onRenameFolder={(folder) => openEditor({ mode: 'rename-folder', folder })}
        />

        <main
          ref={mainRef}
          className="music-main"
          style={scrolledHue}
          onScroll={(event) => {
            const next = event.currentTarget.scrollTop > SCROLLED_AT
            if (next !== scrolled) setScrolled(next)
          }}
        >
          <div className={`music-main__bar ${scrolled && sticky ? 'is-scrolled' : ''}`}>
            {scrolled && sticky ? (
              <>
                {sticky.canPlay ? (
                  <PlayButton
                    className="music-round-play--small"
                    label={`Play ${sticky.title}`}
                    playing={sticky.playing}
                    onClick={() => stickyPlay.current?.()}
                  />
                ) : null}
                <span className="music-main__bar-title">{sticky.title}</span>
              </>
            ) : null}
          </div>
          {props.playlistError ? (
            <p className="music-notice" role="alert">
              {props.playlistError}
            </p>
          ) : null}
          <div key={routeKey} className="music-view">
            {content()}
          </div>
        </main>

        {panel === 'queue' ? (
          <QueuePanel onClose={() => updateMusicState({ sidebar: null })} />
        ) : panel === 'now-playing' ? (
          <NowPlayingPanel onClose={() => updateMusicState({ sidebar: null })} />
        ) : null}

        {!currentVideo ? (
          <footer className="music-idle-player" aria-label="Player">
            <span className="music-idle-player__track">
              <MusicIcon name="music" />
              <span>
                <strong>Nothing playing</strong>
                <small>Pick a song to start listening.</small>
              </span>
            </span>
            <span className="music-idle-player__controls" aria-hidden="true">
              <MusicIcon name="shuffle" />
              <MusicIcon name="previous" filled />
              <span className="music-idle-player__play">
                <MusicIcon name="play" filled />
              </span>
              <MusicIcon name="next" filled />
              <MusicIcon name="repeat" />
            </span>
            <span />
          </footer>
        ) : null}

        <nav className="music-mobile-nav" aria-label="Music sections">
          <a href={musicPath()} className={route.view === 'home' && !mobileLibrary ? 'is-current' : ''}>
            <MusicIcon name="home" filled={route.view === 'home'} />
            <span>Home</span>
          </a>
          <a
            href={musicPath('search')}
            className={route.view === 'search' && !mobileLibrary ? 'is-current' : ''}
          >
            <MusicIcon name="search" />
            <span>Search</span>
          </a>
          <button
            type="button"
            className={mobileLibrary ? 'is-current' : ''}
            aria-pressed={mobileLibrary}
            onClick={() => setMobileLibrary(!mobileLibrary)}
          >
            <MusicIcon name="library" filled={mobileLibrary} />
            <span>Your Library</span>
          </button>
        </nav>

        {menu ? (
          <Menu
            items={menu.items}
            anchor={menu.anchor}
            label={menu.label}
            onClose={() => setMenu(null)}
          />
        ) : null}

        {props.fullScreen && currentVideo ? (
          <FullScreenPlayer onClose={() => props.onFullScreenChange(false)} />
        ) : null}

        {showShortcuts ? (
          <MusicDialog title="Keyboard shortcuts" onClose={() => setShowShortcuts(false)}>
            <div className="music-shortcut-columns">
              {SHORTCUTS.map((group) => (
                <dl key={group.group} className="music-shortcut-list">
                  <dt>{group.group}</dt>
                  {group.items.map(([keys, action]) => (
                    <dd key={keys}>
                      <span>{action}</span>
                      <kbd>{keys}</kbd>
                    </dd>
                  ))}
                </dl>
              ))}
            </div>
          </MusicDialog>
        ) : null}

        {editing ? (
          <MusicDialog title={editorTitle} onClose={() => setEditing(null)}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void confirmEdit()
              }}
            >
              {editing.mode === 'delete' ? (
                <p>
                  This will delete <strong>{editing.playlist.name}</strong> from Your Library.
                  Downloaded files and other playlists are kept.
                </p>
              ) : (
                <>
                  <label className="music-editor-label">
                    Name
                    <input
                      autoFocus
                      aria-label="Name"
                      value={draftName}
                      maxLength={120}
                      placeholder={editing.mode === 'folder' ? 'New folder' : 'My playlist'}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </label>
                  {editing.mode === 'edit' ? (
                    <label className="music-editor-label">
                      Description
                      <textarea
                        aria-label="Description"
                        value={draftNote}
                        maxLength={300}
                        rows={4}
                        placeholder="Add an optional description"
                        onChange={(event) => setDraftNote(event.target.value)}
                      />
                    </label>
                  ) : null}
                </>
              )}
              {props.playlistError && editing.mode !== 'folder' && editing.mode !== 'rename-folder' ? (
                <p className="music-dialog__error">{props.playlistError}</p>
              ) : null}
              <div className="music-editor-actions">
                <button type="button" className="music-button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`music-button ${editing.mode === 'delete' ? 'music-button--danger' : 'music-button--light'}`}
                  disabled={props.busy || (editing.mode !== 'delete' && !draftName.trim())}
                >
                  {props.busy ? 'Saving...' : editing.mode === 'delete' ? 'Delete' : 'Save'}
                </button>
              </div>
            </form>
          </MusicDialog>
        ) : null}
      </div>
    </MusicContext.Provider>
  )
}
