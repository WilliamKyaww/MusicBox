import { useDeferredValue, useEffect, useState, type ReactNode } from 'react'
import { searchVideos } from '../../api/search'
import { musicPath, type MusicRoute } from '../../experience'
import { useLibrary } from '../../library'
import { navigate } from '../../router'
import type { Playlist, VideoSearchResult } from '../../types'
import { useCachedResource } from '../../useCachedResource'
import type { MenuItem } from '../Menu'
import { MusicIcon } from '../MusicIcon'
import { mixContextId, playlistVideo, sortedItems } from '../helpers'
import { useContextPlayback, useInView, useStickyHeader } from '../hooks'
import { useMusic, type PlaySource } from '../MusicContext'
import { getPlaybackControls } from '../playback'
import {
  formatTotalDuration,
  hueFor,
  onRepeat,
  parseDuration,
  radioCandidates,
} from '../recommend'
import { assignFolder, togglePinned, useMusicStore } from '../store'
import { ArtistLink, TrackList } from '../TrackList'
import { Artwork, Mosaic, PlayButton } from '../ui'
import { CollectionHeader } from './CollectionHeader'

type Sort = 'custom' | 'title' | 'artist' | 'added' | 'duration'
const SORT_LABELS: Record<Sort, string> = {
  custom: 'Custom order',
  title: 'Title',
  artist: 'Artist',
  added: 'Date added',
  duration: 'Duration',
}

export function MixCover({
  title,
  hue,
  image,
}: {
  title: string
  hue: number
  image?: string | null
}) {
  return (
    <span
      className="music-art music-mix-cover"
      style={{ '--music-hue': String(hue) } as React.CSSProperties}
    >
      {image ? <img src={image} alt="" loading="lazy" /> : null}
      <strong>{title}</strong>
    </span>
  )
}

type Described = {
  kind: PlaySource['kind']
  id: string
  type: string
  title: string
  description?: ReactNode
  hue: number
  art: ReactNode
  imageUrl: string | null
  tracks: VideoSearchResult[]
  addedAt?: (video: VideoSearchResult) => string | undefined
  addedLabel?: string
  plays?: (video: VideoSearchResult) => number | undefined
  playsLabel?: string
  empty: ReactNode
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ComponentProps<typeof MusicIcon>['name']
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="music-empty">
      <MusicIcon name={icon} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function CollectionView({
  route,
  exportsPanel,
  downloadsPanel,
}: {
  route: MusicRoute
  exportsPanel: ReactNode
  downloadsPanel: ReactNode
}) {
  const music = useMusic()
  const store = useMusicStore()
  const history = useLibrary((state) => state.history)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>(route.view === 'liked' ? 'added' : 'custom')
  const [compact, setCompact] = useState(false)
  const [artistChip, setArtistChip] = useState('')
  const query = useDeferredValue(filter).trim().toLocaleLowerCase()
  const mixKey =
    route.view === 'mix' && route.query ? `music-search:${route.query}` : null
  const mix = useCachedResource(mixKey, (signal) =>
    searchVideos(route.query, signal),
  )
  const playlist =
    route.view === 'playlist'
      ? music.playlists.find((p) => p.id === route.id)
      : undefined

  function describe(): Described | null {
    switch (route.view) {
      case 'playlist': {
        if (!playlist) return null
        const items = sortedItems(playlist)
        return {
          kind: 'playlist',
          id: playlist.id,
          type: 'Playlist',
          title: playlist.name,
          description: store.playlistNotes[playlist.id],
          hue: hueFor(playlist.id),
          art: (
            <Mosaic
              images={items.map((item) => item.thumbnail_url)}
              name={playlist.name}
            />
          ),
          imageUrl: items[0]?.thumbnail_url ?? null,
          tracks: items.map(playlistVideo),
          addedAt: (video) => video.published_at,
          empty: <PlaylistSearch playlist={playlist} />,
        }
      }
      case 'liked':
        return {
          kind: 'liked',
          id: 'liked',
          type: 'Playlist',
          title: 'Liked Songs',
          hue: 252,
          art: <Artwork liked name="Liked Songs" />,
          imageUrl: null,
          tracks: store.liked,
          addedAt: (video) => store.likedAt[video.id],
          empty: (
            <EmptyState
              icon="heart"
              title="Songs you like will appear here"
              text="Save songs by tapping the plus icon."
              action={
                <button
                  className="music-button music-button--light"
                  onClick={() => navigate(musicPath('search'))}
                >
                  Find songs
                </button>
              }
            />
          ),
        }
      case 'recent': {
        const played = new Map(history.map((h) => [h.video.id, h.watchedAt]))
        return {
          kind: 'recent',
          id: 'recent',
          type: 'Your history',
          title: 'Recently played',
          description: 'Everything you played here, newest first. Private sessions are not recorded.',
          hue: 205,
          art: <Artwork name="Recently played" icon="clock" hue={205} />,
          imageUrl: null,
          tracks: history.map((h) => h.video),
          addedAt: (video) => played.get(video.id),
          addedLabel: 'Played',
          empty: (
            <EmptyState
              icon="clock"
              title="Nothing played yet"
              text="Songs you listen to will show up here."
            />
          ),
        }
      }
      case 'repeat':
        return {
          kind: 'repeat',
          id: 'repeat',
          type: 'Made for you',
          title: 'On Repeat',
          description: "The songs you can't stop playing, from this device.",
          hue: 330,
          art: <MixCover title="On Repeat" hue={330} image={onRepeat(history, store.playCounts)[0]?.thumbnail_url} />,
          imageUrl: null,
          tracks: onRepeat(history, store.playCounts),
          plays: (video) => store.playCounts[video.id],
          playsLabel: 'Plays',
          empty: (
            <EmptyState
              icon="repeat"
              title="Nothing on repeat yet"
              text="Play a song a few times and it will show up here."
            />
          ),
        }
      case 'mix': {
        const title = route.title || `${route.query} Mix`
        const results = mix.data?.items ?? []
        const seed = route.video
          ? [...store.liked, ...history.map((h) => h.video), ...results].find(
              (video) => video.id === route.video,
            )
          : undefined
        const tracks = [
          ...(seed ? [seed] : []),
          ...radioCandidates(results, new Set(seed ? [seed.id] : []), 50),
        ]
        const hue = hueFor(route.query)
        return {
          kind: 'mix',
          id: mixContextId(route.query, title),
          type: route.video ? 'Song radio' : 'Mix',
          title,
          description: `Songs inspired by ${route.query}. Built from a YouTube search, so it changes as YouTube does.`,
          hue,
          art: <MixCover title={title} hue={hue} image={tracks[0]?.thumbnail_url} />,
          imageUrl: tracks[0]?.thumbnail_url ?? null,
          tracks,
          empty: mix.isLoading ? (
            <p className="music-muted" role="status">
              Building your mix...
            </p>
          ) : (
            <EmptyState
              icon="radio"
              title="Couldn't build this mix"
              text={mix.error ?? 'YouTube returned no songs for it.'}
            />
          ),
        }
      }
      case 'downloads': {
        const ready = music.downloads.filter(
          (d) => d.status === 'completed' && d.media_kind === 'audio',
        )
        const created = new Map(ready.map((d) => [d.video_id, d.created_at]))
        return {
          kind: 'downloads',
          id: 'downloads',
          type: 'Your library',
          title: 'Downloaded',
          description: 'Saved audio plays from this computer, even when YouTube is unavailable.',
          hue: 141,
          art: <Artwork name="Downloaded" icon="download" hue={141} />,
          imageUrl: null,
          tracks: ready.map((d) => ({
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
          })),
          addedAt: (video) => created.get(video.id),
          empty: (
            <EmptyState
              icon="download"
              title="No downloaded songs yet"
              text="Choose Download from a song's menu to keep it on this computer."
            />
          ),
        }
      }
      default:
        return null
    }
  }

  const info = describe()
  const context = useContextPlayback(info?.kind ?? 'search', info?.id ?? '')
  useStickyHeader({
    title: info?.title ?? '',
    hue: info?.hue ?? null,
    playing: context.playing,
    onPlay: info?.tracks.length ? () => playAll() : undefined,
  })
  if (!info)
    return (
      <EmptyState
        icon="music"
        title="Playlist not found"
        text="It may have been deleted. Your other playlists are in Your Library."
      />
    )

  const chips =
    route.view === 'liked'
      ? [...new Set(info.tracks.map((v) => v.channel_title))]
          .map((name) => ({
            name,
            count: info.tracks.filter((v) => v.channel_title === name).length,
          }))
          .filter((chip) => chip.count > 1)
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
      : []
  const filtered = info.tracks.filter(
    (video) =>
      (!artistChip || video.channel_title === artistChip) &&
      (!query ||
        `${video.title} ${video.channel_title}`
          .toLocaleLowerCase()
          .includes(query)),
  )
  const shown =
    sort === 'custom'
      ? filtered
      : [...filtered].sort((a, b) => {
          if (sort === 'title') return a.title.localeCompare(b.title)
          if (sort === 'artist') return a.channel_title.localeCompare(b.channel_title)
          if (sort === 'duration')
            return parseDuration(a.duration_label) - parseDuration(b.duration_label)
          return (info.addedAt?.(b) ?? '').localeCompare(info.addedAt?.(a) ?? '')
        })
  const total = info.tracks.reduce(
    (sum, video) => sum + parseDuration(video.duration_label),
    0,
  )
  const source: PlaySource = {
    kind: info.kind,
    id: info.id,
    title: info.title,
    imageUrl: info.imageUrl,
    subtitle: info.type,
  }
  const canReorder = Boolean(playlist) && sort === 'custom' && !query

  function playAll(shuffle = false) {
    if (context.current && !shuffle) {
      getPlaybackControls()?.toggle()
      return
    }
    // Shuffle play starts anywhere; Play keeps the current shuffle mode, as in Spotify.
    if (shuffle) music.play(shown, -1, source, { shuffle })
    else music.play(shown, 0, source)
  }

  function reorder(from: number, to: number) {
    if (!playlist) return
    const ids = sortedItems(playlist).map((item) => item.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    void music.reorderPlaylist(playlist.id, ids)
  }

  function playlistMenu(list: Playlist): MenuItem[] {
    const pinned = store.pinned.includes(list.id)
    const folderId = store.folders.find((f) => f.playlistIds.includes(list.id))?.id
    return [
      {
        label: 'Add to queue',
        icon: 'queue',
        disabled: !list.items.length,
        onSelect: () => music.enqueueMany(sortedItems(list).map(playlistVideo)),
      },
      { kind: 'separator' },
      { label: 'Edit details', icon: 'edit', onSelect: () => music.editPlaylist(list) },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => music.confirmDeletePlaylist(list) },
      { kind: 'separator' },
      {
        label: pinned ? 'Unpin playlist' : 'Pin playlist',
        icon: 'pin',
        onSelect: () => togglePinned(list.id),
      },
      {
        label: 'Move to folder',
        icon: 'folder',
        submenu: [
          { label: 'Create folder', icon: 'plus', onSelect: () => music.newFolder(list.id) },
          ...(store.folders.length ? [{ kind: 'separator' as const }] : []),
          ...store.folders.map((folder) => ({
            label: folder.name,
            checked: folder.id === folderId,
            onSelect: () => assignFolder(list.id, folder.id),
          })),
          ...(folderId
            ? [
                { kind: 'separator' as const },
                { label: 'Remove from folder', onSelect: () => assignFolder(list.id, '') },
              ]
            : []),
        ],
      },
      { kind: 'separator' },
      {
        label: 'Download or export',
        icon: 'download',
        disabled: !list.items.length,
        onSelect: () =>
          document
            .querySelector<HTMLDetailsElement>('.music-export')
            ?.setAttribute('open', ''),
      },
    ]
  }

  const sortMenu: MenuItem[] = [
    { kind: 'heading', label: 'Sort by' },
    ...(Object.keys(SORT_LABELS) as Sort[])
      .filter((key) => key !== 'added' || info.addedAt)
      .map((key) => ({
        label: key === 'added' && info.addedLabel ? info.addedLabel : SORT_LABELS[key],
        checked: sort === key,
        onSelect: () => setSort(key),
      })),
    { kind: 'separator' },
    { kind: 'heading', label: 'View as' },
    { label: 'List', icon: 'list', checked: !compact, onSelect: () => setCompact(false) },
    { label: 'Compact', icon: 'compact', checked: compact, onSelect: () => setCompact(true) },
  ]

  return (
    <div className="music-page">
      <CollectionHeader
        art={info.art}
        type={info.type}
        title={info.title}
        description={info.description}
        hue={info.hue}
        meta={
          <>
            <strong>MusicBox</strong>
            {info.tracks.length ? (
              <>
                {' '}
                &middot; {info.tracks.length} song{info.tracks.length === 1 ? '' : 's'}
                {total ? <span>, {formatTotalDuration(total)}</span> : null}
              </>
            ) : null}
          </>
        }
      />
      <div className="music-actionbar">
        <PlayButton
          className="music-round-play--large"
          label={`Play ${info.title}`}
          playing={context.playing}
          disabled={!shown.length}
          onClick={() => playAll()}
        />
        <button
          type="button"
          className={`music-icon-button music-icon-button--large ${context.shuffled ? 'is-green' : ''}`}
          aria-label={`Shuffle play ${info.title}`}
          aria-pressed={context.shuffled}
          disabled={!shown.length}
          onClick={() =>
            context.current ? getPlaybackControls()?.toggleShuffle() : playAll(true)
          }
        >
          <MusicIcon name="shuffle" />
        </button>
        {playlist ? (
          <button
            type="button"
            className="music-icon-button music-icon-button--large"
            aria-label={`More options for ${playlist.name}`}
            aria-haspopup="menu"
            onClick={(event) =>
              music.openMenu(
                playlistMenu(playlist),
                event.currentTarget.getBoundingClientRect(),
                `${playlist.name} options`,
              )
            }
          >
            <MusicIcon name="more" />
          </button>
        ) : info.tracks.length ? (
          <button
            type="button"
            className="music-icon-button music-icon-button--large"
            aria-label={`Add ${info.title} to queue`}
            title="Add to queue"
            onClick={() => music.enqueueMany(shown)}
          >
            <MusicIcon name="queue" />
          </button>
        ) : null}
        {info.tracks.length ? (
          <div className="music-actionbar__end">
            <label className={`music-filter ${filter ? 'has-value' : ''}`}>
              <MusicIcon name="search" />
              <input
                type="search"
                aria-label="Filter songs"
                placeholder={`Search in ${info.title}`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="music-sort-button"
              aria-haspopup="menu"
              onClick={(event) =>
                music.openMenu(sortMenu, event.currentTarget.getBoundingClientRect(), 'Sort and view')
              }
            >
              {sort === 'added' && info.addedLabel ? info.addedLabel : SORT_LABELS[sort]}
              <MusicIcon name={compact ? 'compact' : 'list'} />
            </button>
          </div>
        ) : null}
      </div>
      {chips.length ? (
        <div className="music-chips" role="group" aria-label="Filter by artist">
          {chips.map((chip) => (
            <button
              key={chip.name}
              type="button"
              aria-pressed={artistChip === chip.name}
              className={artistChip === chip.name ? 'is-active' : ''}
              onClick={() => setArtistChip(artistChip === chip.name ? '' : chip.name)}
            >
              {chip.name}
            </button>
          ))}
        </div>
      ) : null}
      {info.tracks.length && !shown.length ? (
        <EmptyState
          icon="search"
          title={`Couldn't find "${filter || artistChip}"`}
          text="Try searching again using a different spelling or keyword."
        />
      ) : (
        <TrackList
          tracks={shown}
          source={source}
          compact={compact}
          columns={[
            ...(info.addedAt ? (['added'] as const) : []),
            ...(info.plays ? (['plays'] as const) : []),
          ]}
          addedAt={info.addedAt}
          addedLabel={info.addedLabel}
          plays={info.plays}
          playsLabel={info.playsLabel}
          onReorder={canReorder ? reorder : undefined}
          menuExtras={
            playlist
              ? (_video, index) => ({
                  playlist,
                  ...(canReorder
                    ? {
                        moveUp: index > 0 ? () => reorder(index, index - 1) : undefined,
                        moveDown:
                          index < shown.length - 1 ? () => reorder(index, index + 1) : undefined,
                      }
                    : {}),
                })
              : undefined
          }
          empty={info.empty}
        />
      )}
      {playlist && playlist.items.length ? <Recommended playlist={playlist} /> : null}
      {playlist ? (
        <details className="music-export">
          <summary>Download or export this playlist</summary>
          {exportsPanel}
        </details>
      ) : null}
      {route.view === 'downloads' ? (
        <section className="music-manage">
          <h2>Manage downloads</h2>
          {downloadsPanel}
        </section>
      ) : null}
    </div>
  )
}

/** Spotify's "Recommended: based on what's in this playlist", from a YouTube search for its artists. */
function Recommended({ playlist }: { playlist: Playlist }) {
  const music = useMusic()
  const [round, setRound] = useState(0)
  const [sectionRef, visible] = useInView<HTMLElement>()
  const items = sortedItems(playlist)
  const counts = new Map<string, number>()
  for (const item of items)
    if (item.channel_title)
      counts.set(item.channel_title, (counts.get(item.channel_title) ?? 0) + 1)
  const artists = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  const seed = artists[round % Math.max(1, artists.length)] ?? ''
  const result = useCachedResource(
    visible && seed ? `music-search:${seed}` : null,
    (signal) => searchVideos(seed, signal),
  )
  const inPlaylist = new Set(items.map((item) => item.video_id))
  const picks = radioCandidates(result.data?.items ?? [], inPlaylist, 5)
  if (visible && !picks.length && !result.isLoading) return null
  return (
    <section className="music-recommended" ref={sectionRef}>
      <div className="music-section-heading">
        <div>
          <h2>Recommended</h2>
          <p className="music-muted">Based on what's in this playlist</p>
        </div>
      </div>
      {result.isLoading || !visible ? (
        <p className="music-muted" role="status">
          Finding songs...
        </p>
      ) : null}
      {picks.map((video) => (
        <SuggestionRow
          key={video.id}
          video={video}
          action={
            <button
              type="button"
              className="music-button"
              disabled={music.busy}
              onClick={() => void music.addToPlaylist(video, playlist.id)}
            >
              Add
            </button>
          }
        />
      ))}
      {artists.length > 1 || picks.length ? (
        <button type="button" className="music-text-button" onClick={() => setRound(round + 1)}>
          Refresh
        </button>
      ) : null}
    </section>
  )
}

function SuggestionRow({
  video,
  action,
}: {
  video: VideoSearchResult
  action: ReactNode
}) {
  const music = useMusic()
  return (
    <div className="music-suggestion">
      <button
        type="button"
        className="music-suggestion__play"
        aria-label={`Play ${video.title}`}
        onClick={() => music.play([video], 0)}
      >
        <Artwork src={video.thumbnail_url} name={video.title} />
        <MusicIcon name="play" filled />
      </button>
      <div className="music-track__text">
        <strong>{video.title}</strong>
        <ArtistLink video={video} />
      </div>
      <span className="music-track__duration">{video.duration_label}</span>
      {action}
    </div>
  )
}

/** Spotify's empty-playlist search: "Let's find something for your playlist". */
function PlaylistSearch({ playlist }: { playlist: Playlist }) {
  const music = useMusic()
  const [text, setText] = useState('')
  const query = useDeferredValue(text.trim())
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 400)
    return () => window.clearTimeout(timer)
  }, [query])
  const result = useCachedResource(
    debounced.length > 1 ? `music-search:${debounced}` : null,
    (signal) => searchVideos(debounced, signal),
  )
  const inPlaylist = new Set(playlist.items.map((item) => item.video_id))
  return (
    <section className="music-playlist-search">
      <h2>Let's find something for your playlist</h2>
      <label className="music-filter music-filter--wide has-value">
        <MusicIcon name="search" />
        <input
          type="search"
          aria-label="Search for songs to add"
          placeholder="Search for songs"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {result.error ? <p className="music-notice">{result.error}</p> : null}
      {(result.data?.items ?? []).slice(0, 10).map((video) => (
        <SuggestionRow
          key={video.id}
          video={video}
          action={
            <button
              type="button"
              className="music-button"
              disabled={music.busy || inPlaylist.has(video.id)}
              onClick={() => void music.addToPlaylist(video, playlist.id)}
            >
              {inPlaylist.has(video.id) ? 'Added' : 'Add'}
            </button>
          }
        />
      ))}
    </section>
  )
}
