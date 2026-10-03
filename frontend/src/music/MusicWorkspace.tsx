import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fetchTrending } from '../api/browse'
import { searchVideos } from '../api/search'
import { previewSpotifyPlaylist } from '../api/spotify'
import { ExperienceSwitcher } from '../components/ExperienceSwitcher'
import { MusicDialog as ModalDialog } from './MusicDialog'
import { musicPath, type MusicRoute } from '../experience'
import { clearHistory, useLibrary } from '../library'
import { navigate, paths } from '../router'
import type {
  DownloadJob,
  Playlist,
  PlaylistItem,
  SpotifyPlaylistPreview,
  VideoSearchResult,
} from '../types'
import {
  cacheKeys,
  useCachedResource,
  useMorePages,
} from '../useCachedResource'
import { MusicIcon } from './MusicIcon'
import type { PlayerSession } from './queue'
import {
  assignFolder,
  createFolder,
  toggleLiked,
  togglePinned,
  updateMusicState,
  useMusicStore,
} from './store'

type Props = {
  route: MusicRoute
  playlists: Playlist[]
  downloads: DownloadJob[]
  session: PlayerSession | null
  currentVideo: VideoSearchResult | null
  playlistError: string | null
  busy: boolean
  onPlay: (
    videos: VideoSearchResult[],
    index?: number,
    playlistId?: string,
  ) => void
  onEnqueue: (video: VideoSearchResult, next: boolean) => void
  onQueueJump: (index: number) => void
  onQueueRemove: (index: number) => void
  onQueueMove: (index: number, direction: -1 | 1) => void
  onQueueClear: () => void
  onDownload: (video: VideoSearchResult) => void
  onSave: (video: VideoSearchResult) => void
  onCreatePlaylist: (name: string) => Promise<Playlist | null>
  onSelectPlaylist: (id: string) => void
  onRenamePlaylist: (id: string, name: string) => Promise<boolean>
  onDeletePlaylist: (id: string) => Promise<boolean>
  onRemoveItem: (id: string, itemId: string) => Promise<void>
  onMoveItem: (
    id: string,
    itemId: string,
    direction: 'up' | 'down',
  ) => Promise<void>
  onToast: (message: string) => void
  downloadsPanel: ReactNode
  exportsPanel: ReactNode
  importsPanel: ReactNode
}

function playlistVideo(item: PlaylistItem): VideoSearchResult {
  return {
    id: item.video_id,
    title: item.title,
    channel_title: item.channel_title,
    thumbnail_url: item.thumbnail_url ?? '',
    video_url: item.source_url,
    duration_label: item.duration_label ?? '',
    channel_id: '',
    description: '',
    duration_iso: '',
    published_at: item.added_at,
  }
}

function Artwork({
  src,
  name,
  liked = false,
}: {
  src?: string | null
  name: string
  liked?: boolean
}) {
  return (
    <span className={`music-art ${liked ? 'music-art--liked' : ''}`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
      ) : (
        <MusicIcon name={liked ? 'heart' : 'music'} filled={liked} />
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}

export function MusicWorkspace(props: Props) {
  const { route, playlists, downloads, session, currentVideo } = props
  const music = useMusicStore()
  const history = useLibrary((state) => state.history)
  const subscriptions = useLibrary((state) => state.subscriptions)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [librarySort, setLibrarySort] = useState('recent')
  const [folderFilter, setFolderFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [trackSort, setTrackSort] = useState('custom')
  const [editing, setEditing] = useState<
    'create' | 'rename' | 'delete' | 'folder' | null
  >(null)
  const [draftName, setDraftName] = useState('')
  const [mobileLibrary, setMobileLibrary] = useState(false)
  const [menuTrack, setMenuTrack] = useState<VideoSearchResult | null>(null)
  const libraryFilter = useDeferredValue(libraryQuery).toLocaleLowerCase()
  const songFilter = useDeferredValue(trackFilter).toLocaleLowerCase()
  const playlist = playlists.find((p) => p.id === route.playlistId)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const searchKey = `music-search:${route.query}`
  const search = useCachedResource(
    route.view === 'search' && route.query ? searchKey : null,
    (signal) => searchVideos(route.query, signal),
  )
  const more = useMorePages<Awaited<ReturnType<typeof searchVideos>>>(searchKey)
  const feed = useCachedResource(
    route.view === 'home' ? cacheKeys.trending() : null,
    fetchTrending,
  )
  const results = [search.data, ...more.pages]
    .flatMap((page) => page?.items ?? [])
    .filter(
      (v, index, all) => all.findIndex((other) => other.id === v.id) === index,
    )
  const nextToken =
    more.pages.at(-1)?.next_page_token ??
    (more.pages.length ? null : search.data?.next_page_token)
  const folder = music.folders.find((f) => f.id === folderFilter)
  const shownPlaylists = playlists
    .filter(
      (p) =>
        (!folder || folder.playlistIds.includes(p.id)) &&
        p.name.toLocaleLowerCase().includes(libraryFilter),
    )
    .sort((a, b) => {
      const pin =
        Number(music.pinned.includes(b.id)) -
        Number(music.pinned.includes(a.id))
      return (
        pin ||
        (librarySort === 'name'
          ? a.name.localeCompare(b.name)
          : b.updated_at.localeCompare(a.updated_at))
      )
    })
  const readyDownloads = downloads
    .filter((d) => d.status === 'completed' && d.media_kind === 'audio')
    .map((d) => ({
      id: d.video_id,
      title: d.title,
      channel_title: d.channel_title,
      thumbnail_url: d.thumbnail_url ?? '',
      video_url: d.source_url,
      duration_label: '',
      channel_id: '',
      description: '',
      duration_iso: '',
      published_at: d.created_at,
    }))
  const sourceTracks =
    route.view === 'search'
      ? results
      : route.view === 'liked'
        ? music.liked
        : route.view === 'recent'
          ? history.map((h) => h.video)
          : route.view === 'playlist'
            ? [...(playlist?.items ?? [])]
                .sort((a, b) => a.position - b.position)
                .map(playlistVideo)
            : []
  const shownTracks = sourceTracks
    .filter((v) =>
      `${v.title} ${v.channel_title}`.toLocaleLowerCase().includes(songFilter),
    )
    .sort((a, b) =>
      trackSort === 'title'
        ? a.title.localeCompare(b.title)
        : trackSort === 'artist'
          ? a.channel_title.localeCompare(b.channel_title)
          : 0,
    )
  const upcoming = session?.tracks.slice(session.index + 1) ?? []

  function openPlaylist(id: string) {
    props.onSelectPlaylist(id)
    navigate(musicPath('playlist', id))
    setMobileLibrary(false)
    setTrackFilter('')
    setTrackSort('custom')
  }
  function openEditor(mode: typeof editing) {
    setDraftName(mode === 'rename' ? (playlist?.name ?? '') : '')
    setEditing(mode)
  }
  async function confirmEdit() {
    if (editing === 'create') {
      const created = await props.onCreatePlaylist(draftName.trim())
      if (!created) return
      openPlaylist(created.id)
    }
    if (editing === 'folder') createFolder(draftName)
    if (
      editing === 'rename' &&
      playlist &&
      !(await props.onRenamePlaylist(playlist.id, draftName.trim()))
    )
      return
    if (editing === 'delete' && playlist) {
      if (!(await props.onDeletePlaylist(playlist.id))) return
      navigate(musicPath('playlists'))
    }
    setEditing(null)
  }
  function playList(videos: VideoSearchResult[], index = 0) {
    if (videos.length)
      props.onPlay(
        videos,
        index,
        route.view === 'playlist' ? playlist?.id : undefined,
      )
  }
  const sleepLabel =
    music.sleepAt === 'end'
      ? 'End of track'
      : typeof music.sleepAt === 'number'
        ? new Date(music.sleepAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Off'

  function trackRows(videos: VideoSearchResult[], allowOrder = false) {
    return (
      <div
        className={`music-tracks ${allowOrder ? 'music-tracks--reorder' : ''}`}
        aria-label="Songs"
      >
        <div className="music-track music-track--head">
          <span>#</span>
          <span>Title</span>
          <span>Artist / channel</span>
          <span />
          <span>
            <MusicIcon name="clock" />
          </span>
          <span />
        </div>
        {videos.map((video, index) => (
          <div
            className={`music-track ${video.id === currentVideo?.id ? 'music-track--active' : ''}`}
            key={`${video.id}-${index}`}
          >
            <button
              className="music-track__play"
              onClick={() => playList(videos, index)}
              aria-label={`Play ${video.title}`}
            >
              <span>{index + 1}</span>
              <MusicIcon name="play" filled />
            </button>
            <button
              className="music-track__title"
              onClick={() => playList(videos, index)}
            >
              <Artwork src={video.thumbnail_url} name={video.title} />
              <span>
                <strong>{video.title}</strong>
                <small>{video.channel_title}</small>
              </span>
            </button>
            <button
              className="music-track__artist"
              onClick={() => navigate(musicPath('search', video.channel_title))}
            >
              {video.channel_title}
            </button>
            <button
              className={`music-icon-button ${music.liked.some((v) => v.id === video.id) ? 'is-green' : ''}`}
              aria-label={`${music.liked.some((v) => v.id === video.id) ? 'Unlike' : 'Like'} ${video.title}`}
              aria-pressed={music.liked.some((v) => v.id === video.id)}
              onClick={() => toggleLiked(video)}
            >
              <MusicIcon
                name="heart"
                filled={music.liked.some((v) => v.id === video.id)}
              />
            </button>
            <span className="music-track__duration">
              {video.duration_label || '--:--'}
            </span>
            <div className="music-track__actions">
              {allowOrder && playlist ? (
                <>
                  <button
                    className="music-icon-button"
                    disabled={props.busy || index === 0}
                    aria-label={`Move ${video.title} up`}
                    onClick={() => {
                      const item = playlist.items.find(
                        (i) => i.video_id === video.id,
                      )
                      if (item)
                        void props.onMoveItem(playlist.id, item.id, 'up')
                    }}
                  >
                    <MusicIcon name="up" />
                  </button>
                  <button
                    className="music-icon-button"
                    disabled={props.busy || index === videos.length - 1}
                    aria-label={`Move ${video.title} down`}
                    onClick={() => {
                      const item = playlist.items.find(
                        (i) => i.video_id === video.id,
                      )
                      if (item)
                        void props.onMoveItem(playlist.id, item.id, 'down')
                    }}
                  >
                    <MusicIcon name="down" />
                  </button>
                </>
              ) : null}
              <button
                className="music-icon-button"
                aria-label={`More options for ${video.title}`}
                onClick={() => setMenuTrack(video)}
              >
                <MusicIcon name="more" />
              </button>
            </div>
          </div>
        ))}
        {!videos.length ? (
          <div className="music-empty">
            <MusicIcon name="music" />
            <h3>
              {sourceTracks.length
                ? 'No matching songs'
                : 'Your next favorite is out there'}
            </h3>
            <p>
              {sourceTracks.length
                ? 'Try a different filter.'
                : 'Search for a song, like it, or add it to a playlist.'}
            </p>
            <button
              className="music-button"
              onClick={() => navigate(musicPath('search'))}
            >
              Find music
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  function songCards(videos: VideoSearchResult[]) {
    return (
      <div className="music-cards">
        {videos.slice(0, 6).map((video, index) => (
          <article className="music-card" key={`${video.id}-${index}`}>
            <button
              className="music-card__cover"
              onClick={() => playList(videos, index)}
              aria-label={`Play ${video.title}`}
            >
              <Artwork src={video.thumbnail_url} name={video.title} />
              <span className="music-card__play">
                <MusicIcon name="play" filled />
              </span>
            </button>
            <button
              className="music-card__name"
              onClick={() => playList(videos, index)}
            >
              {video.title}
            </button>
            <p>{video.channel_title}</p>
            <button
              className="music-card__more music-icon-button"
              aria-label={`More options for ${video.title}`}
              onClick={() => setMenuTrack(video)}
            >
              <MusicIcon name="more" />
            </button>
          </article>
        ))}
      </div>
    )
  }

  function content() {
    if (route.view === 'home')
      return (
        <>
          <div className="music-chips">
            <button className="is-active" onClick={() => navigate(musicPath())}>
              All
            </button>
            <button onClick={() => navigate(musicPath('liked'))}>
              Liked Songs
            </button>
            <button onClick={() => navigate(musicPath('playlists'))}>
              Playlists
            </button>
            <button onClick={() => navigate(musicPath('downloads'))}>
              Downloaded
            </button>
          </div>
          <div className="music-shortcuts">
            <button onClick={() => navigate(musicPath('liked'))}>
              <Artwork name="Liked Songs" liked />
              <strong>Liked Songs</strong>
            </button>
            {playlists.slice(0, 5).map((p) => (
              <button key={p.id} onClick={() => openPlaylist(p.id)}>
                <Artwork src={p.items[0]?.thumbnail_url} name={p.name} />
                <strong>{p.name}</strong>
              </button>
            ))}
          </div>
          <section className="music-hero">
            <div>
              <span className="music-eyebrow">YOUR MUSIC. YOUR SPACE.</span>
              <h1>
                Find your
                <br />
                next favorite.
              </h1>
              <p>A familiar way to listen. The same MusicBox library.</p>
              <button
                className="music-button music-button--green"
                onClick={() => navigate(musicPath('search'))}
              >
                Discover music
              </button>
            </div>
            <div className="music-hero__record" aria-hidden="true">
              <MusicIcon name="music" />
            </div>
          </section>
          {history.length ? (
            <section>
              <div className="music-section-heading">
                <h2>Jump back in</h2>
                <a href={musicPath('recent')}>Show all</a>
              </div>
              {songCards(history.map((h) => h.video))}
            </section>
          ) : null}
          {readyDownloads.length ? (
            <section>
              <div className="music-section-heading">
                <h2>Ready whenever you are</h2>
                <a href={musicPath('downloads')}>Your downloads</a>
              </div>
              {songCards(readyDownloads)}
            </section>
          ) : null}
          <section>
            <div className="music-section-heading">
              <h2>Explore on YouTube</h2>
              <a href={musicPath('search')}>Search music</a>
            </div>
            {feed.isLoading ? (
              <p role="status">Finding something to play...</p>
            ) : feed.error ? (
              <p className="music-notice">{feed.error}</p>
            ) : (
              songCards(feed.data?.items ?? [])
            )}
          </section>
          <p className="music-footnote">
            MusicBox music view uses your YouTube and downloaded library. It is
            not connected to the Spotify streaming catalog.
          </p>
        </>
      )
    if (route.view === 'search' && !route.query)
      return (
        <>
          <h1>Browse music</h1>
          <p className="music-muted">
            Search for a title, artist, or YouTube link above.
          </p>
          <div className="music-browse">
            {[
              ['Focus', 'instrumental focus music'],
              ['Chill', 'lofi chill official audio'],
              ['Pop', 'pop official audio'],
              ['Electronic', 'electronic music official audio'],
              ['Jazz', 'jazz music'],
              ['Indie', 'indie official audio'],
              ['Soundtracks', 'game soundtrack music'],
              ['Live music', 'live music performance'],
            ].map(([name, query], i) => (
              <button
                key={name}
                style={
                  {
                    '--category-hue': `${[190, 275, 350, 25, 145, 225, 310, 60][i]}`,
                  } as React.CSSProperties
                }
                onClick={() => navigate(musicPath('search', query))}
              >
                <strong>{name}</strong>
                <MusicIcon name="music" />
              </button>
            ))}
          </div>
        </>
      )
    if (['search', 'liked', 'recent', 'playlist'].includes(route.view)) {
      if (route.view === 'playlist' && !playlist)
        return (
          <div className="music-empty">
            <h1>Playlist not found</h1>
            <p>
              It may have been deleted. Your other playlists are in Your
              Library.
            </p>
          </div>
        )
      const title =
        route.view === 'liked'
          ? 'Liked Songs'
          : route.view === 'recent'
            ? 'Recently played'
            : route.view === 'search'
              ? `Results for "${route.query}"`
              : playlist!.name
      return (
        <>
          <header
            className={`music-collection ${route.view === 'liked' ? 'music-collection--liked' : ''}`}
          >
            <Artwork
              liked={route.view === 'liked'}
              src={
                route.view === 'playlist'
                  ? playlist?.items[0]?.thumbnail_url
                  : undefined
              }
              name={title}
            />
            <div>
              <span className="music-eyebrow">
                {route.view === 'playlist' ? 'PLAYLIST' : 'YOUR MUSIC'}
              </span>
              <h1>{title}</h1>
              <p>
                MusicBox <span aria-hidden="true">/</span> {sourceTracks.length}{' '}
                songs{route.view === 'liked' ? ' you love' : ''}
              </p>
            </div>
          </header>
          <div className="music-collection-tools">
            <button
              className="music-round-play"
              disabled={!shownTracks.length}
              aria-label={`Play ${title}`}
              onClick={() => playList(shownTracks)}
            >
              <MusicIcon name="play" filled />
            </button>
            {playlist ? (
              <>
                <button
                  className={`music-icon-button ${music.pinned.includes(playlist.id) ? 'is-green' : ''}`}
                  aria-label="Pin playlist"
                  aria-pressed={music.pinned.includes(playlist.id)}
                  onClick={() => togglePinned(playlist.id)}
                >
                  <MusicIcon name="pin" />
                </button>
                <button
                  className="music-button"
                  onClick={() => openEditor('rename')}
                >
                  Rename
                </button>
                <button
                  className="music-button"
                  onClick={() => openEditor('delete')}
                >
                  Delete
                </button>
                <select
                  aria-label="Playlist folder"
                  value={
                    music.folders.find((f) =>
                      f.playlistIds.includes(playlist.id),
                    )?.id ?? ''
                  }
                  onChange={(e) => assignFolder(playlist.id, e.target.value)}
                >
                  <option value="">No folder</option>
                  {music.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {route.view === 'recent' ? (
              <button className="music-button" onClick={clearHistory}>
                Clear history
              </button>
            ) : null}
            <input
              aria-label="Filter songs"
              type="search"
              placeholder="Search in this list"
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
            />
            <select
              aria-label="Sort songs"
              value={trackSort}
              onChange={(e) => setTrackSort(e.target.value)}
            >
              <option value="custom">Original order</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
            </select>
          </div>
          {search.isLoading && route.view === 'search' ? (
            <p role="status">Searching YouTube...</p>
          ) : null}
          {search.error && route.view === 'search' ? (
            <p className="music-notice" role="alert">
              {search.error}
            </p>
          ) : null}
          {trackRows(
            shownTracks,
            route.view === 'playlist' && !trackFilter && trackSort === 'custom',
          )}
          {route.view === 'search' && nextToken ? (
            <button
              className="music-button"
              disabled={more.isLoading}
              onClick={() =>
                more.load(() =>
                  searchVideos(route.query, undefined, {
                    pageToken: nextToken,
                  }),
                )
              }
            >
              {more.isLoading ? 'Loading...' : 'Load more songs'}
            </button>
          ) : null}
          {more.error && route.view === 'search' ? (
            <p role="alert">{more.error}</p>
          ) : null}
          {playlist ? props.exportsPanel : null}
        </>
      )
    }
    if (route.view === 'downloads')
      return (
        <>
          <h1>Your downloads</h1>
          <p className="music-muted">
            Saved audio is available from your local MusicBox backend, even
            without YouTube. Video downloads remain available in Video view.
          </p>
          {props.downloadsPanel}
        </>
      )
    if (route.view === 'imports')
      return (
        <>
          <h1>Bring your music</h1>
          <p className="music-muted">
            Keep using the playlist tools from your original MusicBox.
          </p>
          <SpotifyPreview
            onSearch={(query) => navigate(musicPath('search', query))}
          />
          {props.importsPanel}
        </>
      )
    if (route.view === 'artists')
      return (
        <>
          <h1>Artists &amp; channels</h1>
          <p className="music-muted">
            Your followed YouTube channels, shared with Video view.
          </p>
          <div className="music-cards">
            {subscriptions.map((s) => (
              <article className="music-card" key={s.id}>
                <button
                  className="music-card__cover"
                  onClick={() => navigate(musicPath('search', s.name))}
                >
                  <Artwork src={s.avatarUrl} name={s.name} />
                </button>
                <h3>{s.name}</h3>
                <a href={paths.channel(s.id)}>Open channel in Video</a>
              </article>
            ))}
          </div>
          {!subscriptions.length ? (
            <div className="music-empty">
              <p>
                Follow an artist's YouTube channel in Video view to see it here.
              </p>
            </div>
          ) : null}
        </>
      )
    if (route.view === 'settings')
      return (
        <>
          <h1>Listening settings</h1>
          <section className="music-setting">
            <div>
              <h3>Private listening</h3>
              <p>
                Do not record new audio listening history or share it through
                Discord. Resets when you restart.
              </p>
            </div>
            <button
              className="music-button"
              aria-pressed={music.privateSession}
              onClick={() =>
                updateMusicState({ privateSession: !music.privateSession })
              }
            >
              {music.privateSession ? 'On' : 'Off'}
            </button>
          </section>
          <section className="music-setting">
            <div>
              <h3>Sleep timer</h3>
              <p>
                Pause playback after a set time or when this track ends. Current
                setting: {sleepLabel}.
              </p>
            </div>
            <select
              aria-label="Sleep timer"
              value={
                music.sleepAt === 'end'
                  ? 'end'
                  : music.sleepAt
                    ? 'active'
                    : 'off'
              }
              onChange={(e) =>
                updateMusicState({
                  sleepAt:
                    e.target.value === 'off'
                      ? null
                      : e.target.value === 'end'
                        ? 'end'
                        : Date.now() + Number(e.target.value) * 60000,
                })
              }
            >
              <option value="off">Off</option>
              {typeof music.sleepAt === 'number' ? (
                <option value="active">Until {sleepLabel}</option>
              ) : null}
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
              <option value="end">End of track</option>
            </select>
          </section>
          <section className="music-setting">
            <div>
              <h3>One library, two experiences</h3>
              <p>
                Playlists and downloads are shared. Likes, folders, pins, and
                the queue are saved on this device. Switching views does not
                interrupt audio; opening a video does.
              </p>
            </div>
          </section>
          <section className="music-setting">
            <div>
              <h3>Playback &amp; shortcuts</h3>
              <p>
                Space: play/pause. M: mute. Alt + Left/Right: previous/next. Use
                the queue to arrange what plays next. Repeat cycles through off,
                queue, and one song.
              </p>
            </div>
          </section>
          <section className="music-setting">
            <div>
              <h3>About this experience</h3>
              <p>
                This is MusicBox with a Spotify-inspired layout, not Spotify.
                Spotify Connect, Jam, Blend, AI DJ, licensed lyrics, account
                sync, and Spotify catalog streaming are not enabled. Crossfade
                and equalizer need a separate audio-engine update.
              </p>
              <a
                href="https://support.spotify.com/us/"
                target="_blank"
                rel="noreferrer"
              >
                Spotify feature reference
              </a>
            </div>
          </section>
        </>
      )
    return (
      <>
        <div className="music-section-heading">
          <h1>Your playlists</h1>
          <button
            className="music-button music-button--green"
            onClick={() => openEditor('create')}
          >
            Create playlist
          </button>
        </div>
        <div className="music-cards">
          {playlists.map((p) => (
            <article className="music-card" key={p.id}>
              <button
                className="music-card__cover"
                onClick={() => openPlaylist(p.id)}
              >
                <Artwork src={p.items[0]?.thumbnail_url} name={p.name} />
              </button>
              <button
                className="music-card__name"
                onClick={() => openPlaylist(p.id)}
              >
                {p.name}
              </button>
              <p>{p.items.length} songs</p>
            </article>
          ))}
        </div>
        {!playlists.length ? (
          <div className="music-empty">
            <h2>Make room for your favorites</h2>
            <p>Create a playlist, then add songs from search.</p>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className={`music-app ${music.sidebar ? 'music-app--aside' : ''}`}>
      <header className="music-topbar">
        <a className="music-brand" href={musicPath()}>
          <img src="/favicon.svg" alt="" />
          <strong>MusicBox</strong>
        </a>
        <button
          className="music-icon-button music-mobile-library"
          aria-label="Toggle library"
          onClick={() => setMobileLibrary(!mobileLibrary)}
        >
          <MusicIcon name="library" />
        </button>
        <a
          className="music-home-button"
          href={musicPath()}
          aria-label="Music home"
        >
          <MusicIcon name="home" />
        </a>
        <form
          className="music-search"
          role="search"
          key={route.query}
          onSubmit={(e) => {
            e.preventDefault()
            const query = searchRef.current?.value.trim()
            if (query) navigate(musicPath('search', query))
          }}
        >
          <MusicIcon name="search" />
          <input
            ref={searchRef}
            type="search"
            defaultValue={route.query}
            placeholder="What do you want to play?"
            aria-label="Search music"
          />
          <button type="submit" aria-label="Submit music search">
            <MusicIcon name="music" />
          </button>
        </form>
        <ExperienceSwitcher active="music" />
        <a
          className="music-icon-button"
          href={musicPath('settings')}
          aria-label="Listening settings"
        >
          <MusicIcon name="settings" />
        </a>
      </header>
      <aside
        className={`music-library ${mobileLibrary ? 'music-library--open' : ''}`}
        aria-label="Your Library"
      >
        <div className="music-library__heading">
          <h2>
            <MusicIcon name="library" />
            Your Library
          </h2>
          <button
            className="music-icon-button"
            aria-label="Create playlist"
            onClick={() => openEditor('create')}
          >
            <MusicIcon name="plus" />
          </button>
        </div>
        <nav className="music-library__nav">
          <a href={musicPath('playlists')}>Playlists</a>
          <a href={musicPath('artists')}>Artists</a>
          <a href={musicPath('downloads')}>Downloaded</a>
        </nav>
        <div className="music-library__filter">
          <input
            type="search"
            aria-label="Search your library"
            placeholder="Search your library"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
          />
          <select
            aria-label="Sort library"
            value={librarySort}
            onChange={(e) => setLibrarySort(e.target.value)}
          >
            <option value="recent">Recents</option>
            <option value="name">A-Z</option>
          </select>
        </div>
        <div className="music-library__items">
          <a
            className={`music-library-item ${route.view === 'liked' ? 'is-current' : ''}`}
            href={musicPath('liked')}
          >
            <Artwork name="Liked Songs" liked />
            <span>
              <strong>Liked Songs</strong>
              <small>
                <MusicIcon name="pin" /> {music.liked.length} songs
              </small>
            </span>
          </a>
          <a className="music-library-item" href={musicPath('recent')}>
            <span className="music-art">
              <MusicIcon name="clock" />
            </span>
            <span>
              <strong>Recently played</strong>
              <small>Your listening history</small>
            </span>
          </a>
          {shownPlaylists.map((p) => (
            <button
              key={p.id}
              className={`music-library-item ${p.id === playlist?.id ? 'is-current' : ''}`}
              onClick={() => openPlaylist(p.id)}
            >
              <Artwork src={p.items[0]?.thumbnail_url} name={p.name} />
              <span>
                <strong>{p.name}</strong>
                <small>
                  {music.pinned.includes(p.id) ? (
                    <MusicIcon name="pin" />
                  ) : null}{' '}
                  Playlist / {p.items.length} songs
                </small>
              </span>
            </button>
          ))}
          {!shownPlaylists.length ? (
            <p className="music-library__empty">
              {libraryQuery || folder
                ? 'No matching playlists.'
                : 'Your playlists will appear here.'}
            </p>
          ) : null}
        </div>
        <div className="music-folder-tools">
          <select
            aria-label="Filter library by folder"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
          >
            <option value="">All folders</option>
            {music.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            className="music-icon-button"
            onClick={() => openEditor('folder')}
            aria-label="Create folder"
          >
            <MusicIcon name="folder" />
          </button>
          {folder ? (
            <button
              className="music-icon-button"
              aria-label="Delete folder (keep playlists)"
              onClick={() => {
                updateMusicState({
                  folders: music.folders.filter((f) => f.id !== folder.id),
                })
                setFolderFilter('')
              }}
            >
              <MusicIcon name="close" />
            </button>
          ) : null}
        </div>
        <a className="music-library__import" href={musicPath('imports')}>
          <MusicIcon name="download" />
          Import &amp; export tools
        </a>
      </aside>
      <main
        className="music-main"
        key={`${route.view}:${route.playlistId}:${route.query}`}
      >
        <div className="music-main__toolbar">
          <div className="music-breadcrumb">
            MUSICBOX <span>/</span> MUSIC
          </div>
          <div>
            {music.privateSession ? (
              <span className="music-private">Private listening</span>
            ) : null}
            <button
              className={`music-icon-button ${music.sidebar === 'now-playing' ? 'is-green' : ''}`}
              aria-label="Toggle Now Playing"
              aria-pressed={music.sidebar === 'now-playing'}
              onClick={() =>
                updateMusicState({
                  sidebar:
                    music.sidebar === 'now-playing' ? null : 'now-playing',
                })
              }
            >
              <MusicIcon name="music" />
            </button>
            <button
              className={`music-icon-button ${music.sidebar === 'queue' ? 'is-green' : ''}`}
              aria-label="Toggle queue"
              aria-pressed={music.sidebar === 'queue'}
              onClick={() =>
                updateMusicState({
                  sidebar: music.sidebar === 'queue' ? null : 'queue',
                })
              }
            >
              <MusicIcon name="queue" />
            </button>
          </div>
        </div>
        {props.playlistError ? (
          <p className="music-notice" role="alert">
            {props.playlistError}
          </p>
        ) : null}
        {content()}
      </main>
      {music.sidebar ? (
        <aside
          className="music-now"
          aria-label={music.sidebar === 'queue' ? 'Play queue' : 'Now Playing'}
        >
          <div className="music-section-heading">
            <h2>{music.sidebar === 'queue' ? 'Queue' : 'Now Playing'}</h2>
            <button
              className="music-icon-button"
              aria-label="Close side panel"
              onClick={() => updateMusicState({ sidebar: null })}
            >
              <MusicIcon name="close" />
            </button>
          </div>
          {currentVideo ? (
            <>
              <Artwork
                src={currentVideo.thumbnail_url}
                name={currentVideo.title}
              />
              <div className="music-now__title">
                <h2>{currentVideo.title}</h2>
                <button
                  className={`music-icon-button ${music.liked.some((v) => v.id === currentVideo.id) ? 'is-green' : ''}`}
                  aria-label="Like current song"
                  aria-pressed={music.liked.some(
                    (v) => v.id === currentVideo.id,
                  )}
                  onClick={() => toggleLiked(currentVideo)}
                >
                  <MusicIcon
                    name="heart"
                    filled={music.liked.some((v) => v.id === currentVideo.id)}
                  />
                </button>
              </div>
              <p>{currentVideo.channel_title}</p>
              <button
                className="music-button"
                onClick={() => navigate(paths.watch(currentVideo.id))}
              >
                <MusicIcon name="video" />
                Watch in Video view
              </button>
            </>
          ) : (
            <div className="music-empty">
              <MusicIcon name="music" />
              <p>Choose a song to start listening.</p>
            </div>
          )}
          <div className="music-section-heading">
            <h3>Next in queue</h3>
            {upcoming.length ? (
              <button onClick={props.onQueueClear}>Clear</button>
            ) : null}
          </div>
          {upcoming
            .slice(0, music.sidebar === 'queue' ? upcoming.length : 3)
            .map((track, i) => {
              const index = (session?.index ?? 0) + 1 + i
              return (
                <div
                  className="music-queue-track"
                  key={`${track.videoId}-${index}`}
                >
                  <button onClick={() => props.onQueueJump(index)}>
                    <Artwork src={track.thumbnailUrl} name={track.title} />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.channelTitle}</small>
                    </span>
                  </button>
                  <div>
                    <button
                      className="music-icon-button"
                      disabled={i === 0}
                      aria-label={`Move queued ${track.title} up`}
                      onClick={() => props.onQueueMove(index, -1)}
                    >
                      <MusicIcon name="up" />
                    </button>
                    <button
                      className="music-icon-button"
                      disabled={i === upcoming.length - 1}
                      aria-label={`Move queued ${track.title} down`}
                      onClick={() => props.onQueueMove(index, 1)}
                    >
                      <MusicIcon name="down" />
                    </button>
                    <button
                      className="music-icon-button"
                      aria-label={`Remove queued ${track.title}`}
                      onClick={() => props.onQueueRemove(index)}
                    >
                      <MusicIcon name="close" />
                    </button>
                  </div>
                </div>
              )
            })}
          {!upcoming.length ? (
            <p className="music-muted">
              Your queue is clear. Add songs using their options menu.
            </p>
          ) : music.sidebar !== 'queue' ? (
            <button
              className="music-button"
              onClick={() => updateMusicState({ sidebar: 'queue' })}
            >
              Open queue ({upcoming.length})
            </button>
          ) : null}
        </aside>
      ) : null}
      {!currentVideo ? (
        <footer className="music-idle-player">
          <MusicIcon name="music" />
          <span>
            <strong>Find something you love</strong>
            <small>Your music will play here.</small>
          </span>
          <MusicIcon name="play" />
        </footer>
      ) : null}
      {menuTrack ? (
        <ModalDialog title="Song options" onClose={() => setMenuTrack(null)}>
          <p>{menuTrack.title}</p>
          <div className="music-song-menu">
            {[
              ['Play next', () => props.onEnqueue(menuTrack, true)],
              ['Add to queue', () => props.onEnqueue(menuTrack, false)],
              ['Save to playlist', () => props.onSave(menuTrack)],
              ['Download', () => props.onDownload(menuTrack)],
              [
                'Watch in Video view',
                () => navigate(paths.watch(menuTrack.id)),
              ],
            ].map(([label, action]) => (
              <button
                key={String(label)}
                className="music-button"
                onClick={() => {
                  ;(action as () => void)()
                  setMenuTrack(null)
                }}
              >
                {String(label)}
              </button>
            ))}
            {playlist ? (
              <button
                className="music-button"
                disabled={props.busy}
                onClick={() => {
                  const item = playlist.items.find(
                    (i) => i.video_id === menuTrack.id,
                  )
                  if (item) void props.onRemoveItem(playlist.id, item.id)
                  setMenuTrack(null)
                }}
              >
                Remove from this playlist
              </button>
            ) : null}
            <button
              className="music-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(menuTrack.video_url)
                  .then(() => props.onToast('Copied YouTube link.'))
                  .catch(() => props.onToast('Could not copy the link.'))
                setMenuTrack(null)
              }}
            >
              Copy song link
            </button>
          </div>
        </ModalDialog>
      ) : null}
      {editing ? (
        <ModalDialog
          title={
            editing === 'delete'
              ? 'Delete playlist?'
              : editing === 'folder'
                ? 'New folder'
                : editing === 'rename'
                  ? 'Rename playlist'
                  : 'Create playlist'
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void confirmEdit()
            }}
          >
            {editing === 'delete' ? (
              <p>
                Delete "{playlist?.name}"? Downloaded files and other playlists
                are kept.
              </p>
            ) : (
              <label className="music-editor-label">
                Name
                <input
                  autoFocus
                  aria-label="Name"
                  value={draftName}
                  maxLength={120}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </label>
            )}
            <div className="music-editor-actions">
              <button
                type="button"
                className="music-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="music-button music-button--green"
                disabled={
                  props.busy || (editing !== 'delete' && !draftName.trim())
                }
              >
                {props.busy
                  ? 'Saving...'
                  : editing === 'delete'
                    ? 'Delete'
                    : 'Save'}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </div>
  )
}

function SpotifyPreview({ onSearch }: { onSearch: (query: string) => void }) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<SpotifyPlaylistPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <section className="music-import">
      <h2>Spotify playlist preview</h2>
      <p>
        Metadata preview only, not Spotify playback. Search individual tracks on
        YouTube to choose a version yourself.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          setPreview(null)
          void previewSpotifyPlaylist(url)
            .then(setPreview)
            .catch((e) =>
              setError(e instanceof Error ? e.message : 'Preview failed.'),
            )
            .finally(() => setBusy(false))
        }}
      >
        <input
          aria-label="Spotify playlist URL"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
        />
        <button className="music-button" disabled={busy || !url.trim()}>
          {busy ? 'Loading...' : 'Preview playlist'}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <>
          <h3>{preview.playlist_name}</h3>
          <p>
            Showing {preview.preview_tracks.length} of {preview.total_tracks}{' '}
            tracks.
          </p>
          {preview.preview_tracks.map((t, i) => (
            <div className="music-setting" key={`${t.spotify_track_id}-${i}`}>
              <span>
                <strong>{t.title}</strong>
                <small>{t.artists.join(', ')}</small>
              </span>
              <button
                className="music-button"
                onClick={() => onSearch(`${t.artists.join(' ')} ${t.title}`)}
              >
                Find on YouTube
              </button>
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}
