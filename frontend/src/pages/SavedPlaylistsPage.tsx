import { useState, type ReactNode } from 'react'
import { formatRelativeTime, joinMeta } from '../format'
import { formatTotalDuration, parseDuration } from '../music/recommend'
import { paths } from '../router'
import type { Playlist, PlaylistItem } from '../types'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ListIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShuffleIcon,
  TrashIcon,
} from '../components/Icons'
import { ModalDialog } from '../components/ModalDialog'
import { PageHeader } from '../components/PageHeader'

type Props = {
  playlistId: string | null
  playlists: Playlist[]
  errorMessage: string | null
  isCreating: boolean
  isMutating: boolean
  onCreatePlaylist: (name: string) => Promise<Playlist | null>
  onRenamePlaylist: (playlistId: string, name: string) => Promise<boolean>
  onDeletePlaylist: (playlistId: string) => Promise<boolean>
  onRemoveItem: (playlistId: string, itemId: string) => void
  onMoveItem: (playlistId: string, itemId: string, direction: 'up' | 'down') => void
  onPlayPlaylist: (playlist: Playlist, shuffle: boolean) => void
  onPlayItem: (playlist: Playlist, itemId: string, shuffle: boolean) => void
  playingPlaylistId: string | null
  playingVideoId: string | null
  exportPanel: ReactNode
}

type Sort = 'updated' | 'name'

function sortedItems(playlist: Playlist) {
  return [...playlist.items].sort((left, right) => left.position - right.position)
}

function cover(playlist: Playlist) {
  return sortedItems(playlist).find((item) => item.thumbnail_url)?.thumbnail_url ?? null
}

function countLabel(count: number) {
  return `${count} video${count === 1 ? '' : 's'}`
}

/** Name prompt shared by creating and renaming. */
function NameDialog({
  title,
  confirmLabel,
  initial,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  confirmLabel: string
  initial: string
  busy: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  return (
    <ModalDialog
      title={title}
      description=""
      confirmLabel={confirmLabel}
      isBusy={busy}
      onConfirm={() => {
        if (name.trim()) onConfirm(name.trim())
      }}
      onCancel={onCancel}
    >
      <input
        className="modal-dialog__input"
        type="text"
        aria-label="Playlist name"
        placeholder="Playlist name"
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && name.trim()) onConfirm(name.trim())
        }}
        autoFocus
      />
    </ModalDialog>
  )
}

export function SavedPlaylistsPage(props: Props) {
  if (!props.playlistId) return <PlaylistGrid {...props} />
  const playlist = props.playlists.find((entry) => entry.id === props.playlistId)
  if (!playlist)
    return (
      <div className="empty-state">
        <ListIcon className="yt-icon" />
        <h2>Playlist Not Found</h2>
        <p>It may have been deleted.</p>
        <a className="yt-pill" href={paths.playlists()}>
          Back to playlists
        </a>
      </div>
    )
  return <PlaylistDetail {...props} playlist={playlist} />
}

function PlaylistGrid({ playlists, errorMessage, isCreating, onCreatePlaylist, onPlayPlaylist }: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('updated')
  const [creating, setCreating] = useState(false)
  const needle = query.trim().toLowerCase()
  const shown = playlists
    .filter(
      (playlist) =>
        !needle ||
        [playlist.name, ...playlist.items.map((item) => item.title)].some((value) =>
          value.toLowerCase().includes(needle),
        ),
    )
    .sort((left, right) =>
      sort === 'name' ? left.name.localeCompare(right.name) : right.updated_at.localeCompare(left.updated_at),
    )

  return (
    <div className="library-view">
      <PageHeader
        title="Playlists"
        subtitle={playlists.length ? `${playlists.length} playlist${playlists.length === 1 ? '' : 's'}` : undefined}
        actions={
          <button type="button" className="yt-pill yt-pill--primary" onClick={() => setCreating(true)}>
            <PlusIcon className="yt-icon" />
            New playlist
          </button>
        }
      >
        <label className="toolbar-search">
          <SearchIcon className="yt-icon" />
          <input
            type="search"
            aria-label="Search playlists"
            placeholder="Search playlists and songs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="chip-row" role="group" aria-label="Sort playlists">
          {(
            [
              ['updated', 'Recently updated'],
              ['name', 'A–Z'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`yt-chip ${sort === value ? 'yt-chip--active' : ''}`}
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {errorMessage ? <p className="inline-alert inline-alert--error">{errorMessage}</p> : null}

      {playlists.length === 0 ? (
        <div className="empty-state">
          <ListIcon className="yt-icon" />
          <h2>Create Your First Playlist</h2>
          <p>Save videos to playlists from any video's menu, then play them here or in Music.</p>
          <button type="button" className="yt-pill yt-pill--primary" onClick={() => setCreating(true)}>
            <PlusIcon className="yt-icon" />
            New playlist
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <SearchIcon className="yt-icon" />
          <p>No playlists match "{query.trim()}".</p>
        </div>
      ) : (
        <div className="playlist-grid">
          {shown.map((playlist) => {
            const image = cover(playlist)
            return (
              <article key={playlist.id} className="playlist-tile">
                <div className="playlist-tile__cover">
                  <a href={paths.playlists(playlist.id)} tabIndex={-1} aria-hidden="true">
                    {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ListIcon className="yt-icon" />}
                  </a>
                  <span className="playlist-tile__count">
                    <ListIcon className="yt-icon" />
                    {countLabel(playlist.items.length)}
                  </span>
                  {playlist.items.length ? (
                    <button
                      type="button"
                      className="playlist-tile__play"
                      aria-label={`Play ${playlist.name}`}
                      onClick={() => onPlayPlaylist(playlist, false)}
                    >
                      <PlayIcon className="yt-icon" />
                      Play all
                    </button>
                  ) : null}
                </div>
                <h3 className="playlist-tile__title">
                  <a href={paths.playlists(playlist.id)}>{playlist.name}</a>
                </h3>
                <p className="playlist-tile__meta">
                  {joinMeta('Playlist', `Updated ${formatRelativeTime(playlist.updated_at) ?? 'recently'}`)}
                </p>
                <a className="playlist-tile__link" href={paths.playlists(playlist.id)}>
                  View full playlist
                </a>
              </article>
            )
          })}
        </div>
      )}

      {creating ? (
        <NameDialog
          title="New Playlist"
          confirmLabel="Create"
          initial=""
          busy={isCreating}
          onConfirm={(name) =>
            void onCreatePlaylist(name).then((created) => {
              setCreating(false)
              if (created) window.location.hash = paths.playlists(created.id)
            })
          }
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}

function PlaylistDetail({
  playlist,
  errorMessage,
  isMutating,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemoveItem,
  onMoveItem,
  onPlayPlaylist,
  onPlayItem,
  playingPlaylistId,
  playingVideoId,
  exportPanel,
}: Props & { playlist: Playlist }) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const items = sortedItems(playlist)
  const image = cover(playlist)
  const total = items.reduce((sum, item) => sum + parseDuration(item.duration_label), 0)
  const isPlayingHere = playingPlaylistId === playlist.id

  return (
    <div className="playlist-page playlist-page--saved">
      <aside className="playlist-hero">
        <div className="playlist-hero__backdrop">{image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : null}</div>
        <div className="playlist-hero__content">
          <a className="playlist-hero__back" href={paths.playlists()}>
            <ChevronLeftIcon className="yt-icon" />
            Playlists
          </a>
          {image ? (
            <img className="playlist-hero__thumb" src={image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="playlist-hero__thumb playlist-hero__thumb--empty">
              <ListIcon className="yt-icon" />
            </div>
          )}
          <h1>{playlist.name}</h1>
          <p className="playlist-hero__meta">
            {joinMeta('Playlist', countLabel(items.length), formatTotalDuration(total) || null)}
          </p>
          <p className="playlist-hero__meta">Updated {formatRelativeTime(playlist.updated_at) ?? 'recently'}</p>
          <div className="playlist-hero__actions">
            <button
              type="button"
              className="yt-pill yt-pill--light"
              disabled={!items.length}
              onClick={() => onPlayPlaylist(playlist, false)}
            >
              <PlayIcon className="yt-icon" />
              Play all
            </button>
            <button
              type="button"
              className="yt-pill yt-pill--glass"
              disabled={!items.length}
              onClick={() => onPlayPlaylist(playlist, true)}
            >
              <ShuffleIcon className="yt-icon" />
              Shuffle
            </button>
            <button
              type="button"
              className="yt-icon-button yt-icon-button--glass"
              onClick={() => setRenaming(true)}
              disabled={isMutating}
              title="Rename playlist"
              aria-label="Rename playlist"
            >
              <PencilIcon className="yt-icon" />
            </button>
            <button
              type="button"
              className="yt-icon-button yt-icon-button--glass"
              onClick={() => setDeleting(true)}
              disabled={isMutating}
              title="Delete playlist"
              aria-label="Delete playlist"
            >
              <TrashIcon className="yt-icon" />
            </button>
          </div>
        </div>
      </aside>

      <div className="playlist-page__items">
        {errorMessage ? <p className="inline-alert inline-alert--error">{errorMessage}</p> : null}
        {items.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <ListIcon className="yt-icon" />
            <p>This playlist is empty. Use "Save to playlist" in any video's menu to add to it.</p>
          </div>
        ) : (
          <ol className="saved-list">
            {items.map((item, index) => (
              <SavedRow
                key={item.id}
                item={item}
                index={index}
                last={index === items.length - 1}
                playing={isPlayingHere && playingVideoId === item.video_id}
                busy={isMutating}
                onPlay={() => onPlayItem(playlist, item.id, false)}
                onMove={(direction) => onMoveItem(playlist.id, item.id, direction)}
                onRemove={() => onRemoveItem(playlist.id, item.id)}
              />
            ))}
          </ol>
        )}
        {exportPanel}
      </div>

      {renaming ? (
        <NameDialog
          title="Rename Playlist"
          confirmLabel="Save"
          initial={playlist.name}
          busy={isMutating}
          onConfirm={(name) =>
            void onRenamePlaylist(playlist.id, name).then((ok) => {
              if (ok) setRenaming(false)
            })
          }
          onCancel={() => setRenaming(false)}
        />
      ) : null}
      {deleting ? (
        <ModalDialog
          title="Delete Playlist?"
          description={`"${playlist.name}" will be deleted. Downloaded files are kept.`}
          confirmLabel="Delete"
          confirmTone="danger"
          isBusy={isMutating}
          onConfirm={() =>
            void onDeletePlaylist(playlist.id).then((ok) => {
              setDeleting(false)
              if (ok) window.location.hash = paths.playlists()
            })
          }
          onCancel={() => setDeleting(false)}
        />
      ) : null}
    </div>
  )
}

function SavedRow({
  item,
  index,
  last,
  playing,
  busy,
  onPlay,
  onMove,
  onRemove,
}: {
  item: PlaylistItem
  index: number
  last: boolean
  playing: boolean
  busy: boolean
  onPlay: () => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}) {
  const href = paths.watch(item.video_id)
  return (
    <li className={`saved-row ${playing ? 'saved-row--playing' : ''}`}>
      <span className="saved-row__index">{playing ? '▶' : index + 1}</span>
      <a className="saved-row__thumb" href={href} tabIndex={-1} aria-hidden="true">
        {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
        {item.duration_label ? <span className="yt-thumb__badge">{item.duration_label}</span> : null}
      </a>
      <div className="saved-row__text">
        <a className="saved-row__title" href={href} title={item.title}>
          {item.title}
        </a>
        <p className="saved-row__meta">{item.channel_title || 'Unknown channel'}</p>
      </div>
      <div className="saved-row__actions">
        <button type="button" className="yt-icon-button" onClick={onPlay} title="Play audio" aria-label={`Play ${item.title}`}>
          <PlayIcon className="yt-icon" />
        </button>
        <button type="button" className="yt-icon-button" onClick={() => onMove('up')} disabled={busy || index === 0} title="Move up" aria-label="Move track up">
          <ArrowUpIcon className="yt-icon" />
        </button>
        <button type="button" className="yt-icon-button" onClick={() => onMove('down')} disabled={busy || last} title="Move down" aria-label="Move track down">
          <ArrowDownIcon className="yt-icon" />
        </button>
        <button type="button" className="yt-icon-button" onClick={onRemove} disabled={busy} title="Remove from playlist" aria-label="Remove from playlist">
          <TrashIcon className="yt-icon" />
        </button>
      </div>
    </li>
  )
}
