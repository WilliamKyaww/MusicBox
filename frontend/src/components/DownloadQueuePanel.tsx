import { useState } from 'react'
import {
  CloseIcon,
  DownloadIcon,
  ImageIcon,
  PencilIcon,
  PlayIcon,
  RepeatIcon,
  SearchIcon,
  TrashIcon,
  VideoIcon,
} from './Icons'
import { ModalDialog } from './ModalDialog'
import { PageHeader } from './PageHeader'
import { PlaylistPicker } from './PlaylistPicker'
import { formatSectionLabel } from '../downloadSections'
import { formatFileSize, formatRelativeTime, joinMeta } from '../format'
import {
  getDownloadFileHref,
  getDownloadThumbnailHref,
  getVideoThumbnailHref,
} from '../api/downloads'
import type { DownloadJob, DownloadRuntimeStatus, Playlist } from '../types'

type DownloadQueuePanelProps = {
  runtime: DownloadRuntimeStatus | null
  jobs: DownloadJob[]
  errorMessage: string | null
  pendingRemovalIds: string[]
  pendingRenameIds: string[]
  pendingRedownloadIds: string[]
  pendingPlaylistVideoId: string | null
  playlists: Playlist[]
  activePlaylistId: string | null
  onRemoveJob: (job: DownloadJob, deleteFile: boolean) => void
  onCancelJob: (job: DownloadJob) => void
  onRedownload: (job: DownloadJob) => void
  onRenameJob: (job: DownloadJob, title: string) => void
  onAddToPlaylists: (job: DownloadJob, playlistIds: string[]) => void
  onPlay?: (job: DownloadJob) => void
  onWatch?: (job: DownloadJob) => void
  /** Inside the Music experience the page supplies its own heading. */
  embedded?: boolean
}

type Filter = 'all' | 'audio' | 'video' | 'active' | 'failed'
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['audio', 'Audio'],
  ['video', 'Video'],
  ['active', 'In progress'],
  ['failed', 'Failed'],
]
const PAGE_SIZE = 20

function isActive(job: DownloadJob) {
  return job.status === 'queued' || job.status === 'downloading' || job.status === 'converting'
}

function matchesFilter(job: DownloadJob, filter: Filter) {
  if (filter === 'audio') return job.media_kind === 'audio'
  if (filter === 'video') return job.media_kind === 'video'
  if (filter === 'active') return isActive(job)
  if (filter === 'failed') return job.status === 'failed'
  return true
}

function statusText(job: DownloadJob) {
  if (job.status === 'queued') return 'Waiting to start'
  if (job.status === 'converting') return 'Converting'
  if (job.status === 'downloading') return `Downloading · ${job.progress_percent}%`
  return null
}

export function DownloadQueuePanel({
  runtime,
  jobs,
  errorMessage,
  pendingRemovalIds,
  pendingRenameIds,
  pendingRedownloadIds,
  pendingPlaylistVideoId,
  playlists,
  activePlaylistId,
  onRemoveJob,
  onCancelJob,
  onRedownload,
  onRenameJob,
  onAddToPlaylists,
  onPlay,
  onWatch,
  embedded = false,
}: DownloadQueuePanelProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [renameTarget, setRenameTarget] = useState<DownloadJob | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const needle = query.trim().toLowerCase()
  const filtered = jobs.filter(
    (job) =>
      matchesFilter(job, filter) &&
      (!needle ||
        [job.title, job.channel_title].some((value) => value?.toLowerCase().includes(needle))),
  )
  const visible = filtered.slice(0, visibleCount)
  const counts = {
    ready: jobs.filter((job) => job.status === 'completed').length,
    active: jobs.filter(isActive).length,
  }

  const toolbar = (
    <>
      <label className="toolbar-search">
        <SearchIcon className="yt-icon" />
        <input
          type="search"
          aria-label="Search downloads"
          placeholder="Search downloads"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(PAGE_SIZE)
          }}
        />
      </label>
      <div className="chip-row" role="group" aria-label="Filter downloads">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`yt-chip ${filter === value ? 'yt-chip--active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value)
              setVisibleCount(PAGE_SIZE)
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )

  const subtitle = jobs.length
    ? joinMeta(`${counts.ready} saved`, counts.active ? `${counts.active} in progress` : null)
    : 'Songs and videos you download are kept on this computer.'

  return (
    <section className={`downloads ${embedded ? 'downloads--embedded' : ''}`} aria-label="Downloads">
      {embedded ? (
        <div className="downloads__toolbar">{toolbar}</div>
      ) : (
        <PageHeader title="Downloads" subtitle={subtitle}>
          {toolbar}
        </PageHeader>
      )}

      {runtime && !runtime.available ? (
        <div className="inline-alert inline-alert--warning">
          <strong>Downloads need setting up</strong>
          <ul>
            {runtime.missing_dependencies.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {errorMessage ? (
        <p className="inline-alert inline-alert--error">Couldn't refresh downloads: {errorMessage}</p>
      ) : null}

      {jobs.length === 0 ? (
        <div className="empty-state">
          <DownloadIcon className="yt-icon" />
          <h2>No Downloads Yet</h2>
          <p>Choose Download from any video's menu to keep it as an MP3 or video file.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <SearchIcon className="yt-icon" />
          <p>No downloads match.</p>
        </div>
      ) : (
        <ul className="download-list">
          {visible.map((job) => {
            const thumbnail = job.thumbnail_path ? getDownloadThumbnailHref(job.id) : job.thumbnail_url
            const thumbnailHref = job.thumbnail_path
              ? getDownloadThumbnailHref(job.id)
              : getVideoThumbnailHref(job.video_id, job.title, job.thumbnail_url)
            const isVideo = job.media_kind === 'video'
            const section = formatSectionLabel(job.section_start_seconds, job.section_end_seconds)
            const ready = job.status === 'completed' && job.download_path
            const pending = pendingRemovalIds.includes(job.id)
            const progress = statusText(job)
            return (
              <li key={job.id} className={`download-row download-row--${job.status}`}>
                <div className="download-row__thumb">
                  {thumbnail ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
                  <span className={`download-row__badge download-row__badge--${job.media_kind}`}>
                    {isVideo ? `MP4${job.video_quality === 'best' ? '' : ` ${job.video_quality}p`}` : 'MP3'}
                  </span>
                </div>
                <div className="download-row__text">
                  <p className="download-row__title" title={job.title}>
                    {job.title}
                  </p>
                  <p className="download-row__meta">
                    {joinMeta(
                      job.channel_title || 'Unknown channel',
                      formatFileSize(job.file_size_bytes),
                      section !== 'Whole video' ? section : null,
                      job.status === 'completed' ? formatRelativeTime(job.updated_at) : null,
                    )}
                  </p>
                  {progress ? (
                    <>
                      <p className="download-row__status">{progress}</p>
                      <div className="download-row__progress" aria-hidden="true">
                        <span style={{ width: `${job.progress_percent}%` }} />
                      </div>
                    </>
                  ) : null}
                  {job.status === 'failed' ? (
                    <p className="download-row__status download-row__status--error">
                      {job.error_message || 'The download failed.'}
                    </p>
                  ) : null}
                </div>
                <div className="download-row__actions">
                  {ready && isVideo && onWatch ? (
                    <button type="button" className="yt-icon-button" onClick={() => onWatch(job)} title="Watch" aria-label="Watch in app">
                      <VideoIcon className="yt-icon" />
                    </button>
                  ) : null}
                  {ready && !isVideo && onPlay ? (
                    <button type="button" className="yt-icon-button" onClick={() => onPlay(job)} title="Play" aria-label="Play in app">
                      <PlayIcon className="yt-icon" />
                    </button>
                  ) : null}
                  {job.status === 'completed' ? (
                    <PlaylistPicker
                      playlists={playlists}
                      activePlaylistId={activePlaylistId}
                      isSubmitting={pendingPlaylistVideoId === job.video_id}
                      buttonClassName="yt-icon-button"
                      title="Save to playlist"
                      onSubmit={(playlistIds) => onAddToPlaylists(job, playlistIds)}
                    />
                  ) : null}
                  {ready ? (
                    <a
                      className="yt-icon-button"
                      href={getDownloadFileHref(job.id)}
                      download={job.file_name ?? undefined}
                      title={isVideo ? 'Save video file' : 'Save MP3'}
                      aria-label={isVideo ? 'Save video file' : 'Save MP3'}
                    >
                      <DownloadIcon className="yt-icon" />
                    </a>
                  ) : null}
                  <a className="yt-icon-button" href={thumbnailHref} download title="Save thumbnail" aria-label="Download thumbnail">
                    <ImageIcon className="yt-icon" />
                  </a>
                  {!isActive(job) ? (
                    <button
                      type="button"
                      className="yt-icon-button"
                      onClick={() => {
                        setRenameTarget(job)
                        setRenameDraft(job.title)
                      }}
                      disabled={pendingRenameIds.includes(job.id)}
                      title="Rename"
                      aria-label="Rename saved song"
                    >
                      <PencilIcon className="yt-icon" />
                    </button>
                  ) : null}
                  {job.status === 'failed' ? (
                    <button
                      type="button"
                      className="yt-icon-button"
                      onClick={() => onRedownload(job)}
                      disabled={pendingRedownloadIds.includes(job.id)}
                      title="Try again"
                      aria-label="Redownload song"
                    >
                      <RepeatIcon className="yt-icon" />
                    </button>
                  ) : null}
                  {isActive(job) ? (
                    <button type="button" className="yt-pill yt-pill--danger" onClick={() => onCancelJob(job)} disabled={pending} title="Cancel and delete partial files">
                      <CloseIcon className="yt-icon" />
                      {pending ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="yt-icon-button"
                      onClick={() => onRemoveJob(job, job.status === 'completed')}
                      disabled={pending}
                      title={job.status === 'completed' ? 'Delete' : 'Remove'}
                      aria-label={
                        job.status === 'completed'
                          ? isVideo
                            ? 'Delete saved video'
                            : 'Delete saved MP3'
                          : 'Remove failed entry'
                      }
                    >
                      <TrashIcon className="yt-icon" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {filtered.length > visibleCount ? (
        <button type="button" className="yt-pill show-more" onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}>
          Show more ({filtered.length - visibleCount})
        </button>
      ) : null}

      {renameTarget ? (
        <ModalDialog
          title="Rename Download"
          description=""
          confirmLabel="Save"
          isBusy={pendingRenameIds.includes(renameTarget.id)}
          onConfirm={() => {
            if (!renameDraft.trim()) return
            onRenameJob(renameTarget, renameDraft)
            setRenameTarget(null)
          }}
          onCancel={() => {
            if (!pendingRenameIds.includes(renameTarget.id)) setRenameTarget(null)
          }}
        >
          <input
            className="modal-dialog__input"
            type="text"
            aria-label="Name"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            autoFocus
          />
        </ModalDialog>
      ) : null}
    </section>
  )
}
