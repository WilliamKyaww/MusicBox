import { useState } from 'react'
import {
  DownloadIcon,
  ImageIcon,
  PencilIcon,
  PlayIcon,
  RepeatIcon,
  TrashIcon,
  VideoIcon,
} from './Icons'
import { ModalDialog } from './ModalDialog'
import { PlaylistPicker } from './PlaylistPicker'
import { formatSectionLabel } from '../downloadSections'
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
  onRedownload: (job: DownloadJob) => void
  onRenameJob: (job: DownloadJob, title: string) => void
  onAddToPlaylists: (job: DownloadJob, playlistIds: string[]) => void
  onPlay?: (job: DownloadJob) => void
  onWatch?: (job: DownloadJob) => void
}

function formatFileSize(fileSizeBytes: number | null) {
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = fileSizeBytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

const INITIAL_VISIBLE = 5
const LOAD_MORE_COUNT = 10

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
  onRedownload,
  onRenameJob,
  onAddToPlaylists,
  onPlay,
  onWatch,
}: DownloadQueuePanelProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [searchQuery, setSearchQuery] = useState('')
  const [renameTarget, setRenameTarget] = useState<DownloadJob | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredJobs = normalizedQuery
    ? jobs.filter((job) =>
        [job.title, job.channel_title, job.status]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery)),
      )
    : jobs
  const visibleJobs = filteredJobs.slice(0, visibleCount)
  const hasMore = filteredJobs.length > visibleCount
  const canShowLess = visibleCount > INITIAL_VISIBLE

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setVisibleCount(INITIAL_VISIBLE)
  }

  function openRenameModal(job: DownloadJob) {
    setRenameTarget(job)
    setRenameDraft(job.title)
  }

  function handleRenameConfirm() {
    if (!renameTarget || !renameDraft.trim()) {
      return
    }

    onRenameJob(renameTarget, renameDraft)
    setRenameTarget(null)
    setRenameDraft('')
  }

  return (
    <section className="downloads-panel">
      <div className="downloads-panel__header">
        <h2>Saved Songs</h2>
        {filteredJobs.length > 0 ? (
          <span className="downloads-panel__count">
            {visibleJobs.length} of {filteredJobs.length}
          </span>
        ) : null}
      </div>

      <label className="library-search" htmlFor="saved-songs-search">
        <span className="library-search__label">Search saved songs</span>
        <input
          id="saved-songs-search"
          className="library-search__input"
          type="search"
          value={searchQuery}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Filter by title, channel, or status"
        />
      </label>

      {runtime && !runtime.available ? (
        <div className="downloads-runtime downloads-runtime--warning">
          <h3>Setup required</h3>
          <ul>
            {runtime.missing_dependencies.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="downloads-runtime downloads-runtime--error">
          <h3>Queue refresh failed</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <div className="downloads-empty">
          <p>No saved songs yet</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="downloads-empty">
          <p>No saved songs match your search</p>
        </div>
      ) : (
        <>
          <div className="downloads-list">
            {visibleJobs.map((job) => {
              const thumbnailSrc = job.thumbnail_path
                ? getDownloadThumbnailHref(job.id)
                : job.thumbnail_url
              const thumbnailDownloadHref = job.thumbnail_path
                ? getDownloadThumbnailHref(job.id)
                : getVideoThumbnailHref(job.video_id, job.title, job.thumbnail_url)
              const isVideoJob = job.media_kind === 'video'
              const sectionLabel = formatSectionLabel(
                job.section_start_seconds,
                job.section_end_seconds,
              )

              return (
              <article className="download-job download-job--compact" key={job.id}>
                <div className="download-job__artwork" aria-hidden="true">
                  {thumbnailSrc ? (
                    <img src={thumbnailSrc} alt="" loading="lazy" />
                  ) : (
                    <span>{job.title.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div className="download-job__content">
                  <div className="download-job__meta">
                  <div>
                    <p className="download-job__status">{job.status}</p>
                    <h3>{job.title}</h3>
                    <p className="download-job__channel">
                      {job.channel_title || 'Unknown channel'}
                    </p>
                    <p className="download-job__tags">
                      <span
                        className={`download-job__tag download-job__tag--${job.media_kind}`}
                      >
                        {isVideoJob
                          ? `MP4${job.video_quality === 'best' ? '' : ` ${job.video_quality}p`}`
                          : 'MP3'}
                      </span>
                      {sectionLabel !== 'Whole video' ? (
                        <span className="download-job__tag">{sectionLabel}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className={`download-job__pill download-job__pill--${job.status}`}>
                    {job.status === 'completed'
                      ? 'Ready'
                      : job.status === 'failed'
                        ? 'Failed'
                      : `${job.progress_percent}%`}
                  </span>
                </div>

                  {job.status !== 'completed' ? (
                    <div className="download-job__progress">
                      <div
                        className={`download-job__bar download-job__bar--${job.status}`}
                        style={{ width: `${job.progress_percent}%` }}
                      />
                    </div>
                  ) : null}

                  <p className="download-job__detail">
                    {job.error_message || job.status_detail || 'Working...'}
                  </p>

                  <div className="download-job__footer">
                    <span>
                      {job.file_size_bytes ? formatFileSize(job.file_size_bytes) : 'Pending file'}
                    </span>
                    <div className="download-job__action-group">
                      {job.status === 'completed' &&
                      job.download_path &&
                      isVideoJob &&
                      onWatch ? (
                        <button
                          type="button"
                          className="download-job__icon-button"
                          onClick={() => onWatch(job)}
                          title="Watch in app"
                          aria-label="Watch in app"
                        >
                          <VideoIcon className="action-icon" />
                        </button>
                      ) : null}

                      {job.status === 'completed' &&
                      job.download_path &&
                      !isVideoJob &&
                      onPlay ? (
                        <button
                          type="button"
                          className="download-job__icon-button"
                          onClick={() => onPlay(job)}
                          title="Play in app"
                          aria-label="Play in app"
                        >
                          <PlayIcon className="action-icon" />
                        </button>
                      ) : null}

                      <a
                        className="download-job__icon-button"
                        href={thumbnailDownloadHref}
                        download
                        title="Download thumbnail"
                        aria-label="Download thumbnail"
                      >
                        <ImageIcon className="action-icon" />
                      </a>

                      {job.status === 'completed' ? (
                        <PlaylistPicker
                          playlists={playlists}
                          activePlaylistId={activePlaylistId}
                          isSubmitting={pendingPlaylistVideoId === job.video_id}
                          buttonClassName="download-job__icon-button download-job__icon-button--playlist"
                          title="Add saved song to playlist"
                          onSubmit={(playlistIds) => onAddToPlaylists(job, playlistIds)}
                        />
                      ) : null}

                      {job.status !== 'downloading' && job.status !== 'queued' && job.status !== 'converting' ? (
                        <button
                          type="button"
                          className="download-job__icon-button download-job__icon-button--edit"
                          onClick={() => openRenameModal(job)}
                          disabled={pendingRenameIds.includes(job.id)}
                          title="Rename saved song"
                          aria-label="Rename saved song"
                        >
                          <PencilIcon className="action-icon" />
                        </button>
                      ) : null}

                      {job.status === 'completed' && job.download_path ? (
                        <a
                          className="download-job__icon-button"
                          href={getDownloadFileHref(job.id)}
                          download={job.file_name ?? undefined}
                          title={isVideoJob ? 'Save video file' : 'Save MP3'}
                          aria-label={isVideoJob ? 'Save video file' : 'Save MP3'}
                        >
                          <DownloadIcon className="action-icon" />
                        </a>
                      ) : null}

                      {job.status === 'completed' ? (
                        <button
                          type="button"
                          className="download-job__icon-button download-job__icon-button--danger"
                          onClick={() => onRemoveJob(job, true)}
                          disabled={pendingRemovalIds.includes(job.id)}
                          title={isVideoJob ? 'Delete saved video' : 'Delete saved MP3'}
                          aria-label={
                            isVideoJob ? 'Delete saved video' : 'Delete saved MP3'
                          }
                        >
                          <TrashIcon className="action-icon" />
                        </button>
                      ) : null}

                      {job.status === 'failed' ? (
                        <button
                          type="button"
                          className="download-job__icon-button"
                          onClick={() => onRedownload(job)}
                          disabled={pendingRedownloadIds.includes(job.id)}
                          title="Redownload song"
                          aria-label="Redownload song"
                        >
                          <RepeatIcon className="action-icon" />
                        </button>
                      ) : null}

                      {job.status === 'failed' ? (
                        <button
                          type="button"
                          className="download-job__icon-button download-job__icon-button--danger"
                          onClick={() => onRemoveJob(job, false)}
                          disabled={pendingRemovalIds.includes(job.id)}
                          title="Remove failed entry"
                          aria-label="Remove failed entry"
                        >
                          <TrashIcon className="action-icon" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            )})}
          </div>

          {hasMore || canShowLess ? (
            <div className="downloads-panel__pager">
              {hasMore ? (
                <button
                  type="button"
                  className="downloads-panel__show-more"
                  onClick={() => setVisibleCount((prev) => prev + LOAD_MORE_COUNT)}
                >
                  Show more ({filteredJobs.length - visibleCount} remaining)
                </button>
              ) : null}
              {canShowLess ? (
                <button
                  type="button"
                  className="downloads-panel__show-more downloads-panel__show-more--muted"
                  onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                >
                  Collapse to latest 5
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {renameTarget ? (
        <ModalDialog
          title="Rename saved song"
          description=""
          confirmLabel="Save changes"
          isBusy={pendingRenameIds.includes(renameTarget.id)}
          onConfirm={handleRenameConfirm}
          onCancel={() => {
            if (pendingRenameIds.includes(renameTarget.id)) {
              return
            }
            setRenameTarget(null)
            setRenameDraft('')
          }}
        >
          <input
            className="modal-dialog__input"
            type="text"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            autoFocus
          />
        </ModalDialog>
      ) : null}
    </section>
  )
}
