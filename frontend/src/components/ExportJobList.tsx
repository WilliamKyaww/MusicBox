import { getExportFileHref } from '../api/exports'
import { formatFileSize } from '../format'
import type { PlaylistExportJob } from '../types'
import { DownloadIcon, TrashIcon } from './Icons'

function statusLabel(job: PlaylistExportJob) {
  if (job.status === 'completed') return 'Ready'
  if (job.status === 'failed') return 'Failed'
  if (job.status === 'queued') return 'Waiting'
  return `${job.progress_percent}%`
}

/** Playlist exports (ZIP of MP3s or one combined MP3) with progress and actions. */
export function ExportJobList({
  jobs,
  pendingRemovalIds,
  onRemove,
}: {
  jobs: PlaylistExportJob[]
  pendingRemovalIds: string[]
  onRemove: (job: PlaylistExportJob, deleteFile: boolean) => void
}) {
  return (
    <ul className="job-list">
      {jobs.map((job) => {
        const combined = job.export_format === 'combined_mp3'
        const active = job.status !== 'completed' && job.status !== 'failed'
        return (
          <li key={job.id} className={`job-row job-row--${job.status}`}>
            <span className="job-row__icon" aria-hidden="true">
              <DownloadIcon className="yt-icon" />
            </span>
            <div className="job-row__text">
              <p className="job-row__title">{job.playlist_name}</p>
              <p className="job-row__meta">
                {combined ? 'One combined MP3' : 'ZIP of MP3s'} · {job.completed_item_count} of{' '}
                {job.item_count} tracks
                {formatFileSize(job.file_size_bytes) ? ` · ${formatFileSize(job.file_size_bytes)}` : ''}
              </p>
              {active || job.status === 'failed' ? (
                <p className={`job-row__detail ${job.status === 'failed' ? 'job-row__detail--error' : ''}`}>
                  {job.error_message || job.status_detail || 'Working…'}
                </p>
              ) : null}
              {active ? (
                <div className="job-row__progress" aria-hidden="true">
                  <span style={{ width: `${job.progress_percent}%` }} />
                </div>
              ) : null}
            </div>
            <span className={`job-row__status job-row__status--${job.status}`}>{statusLabel(job)}</span>
            <div className="job-row__actions">
              {job.status === 'completed' && job.download_path ? (
                <a
                  className="yt-icon-button"
                  href={getExportFileHref(job.id)}
                  download={job.file_name ?? undefined}
                  title={combined ? 'Save combined MP3' : 'Save ZIP'}
                  aria-label={combined ? 'Save combined MP3' : 'Save ZIP'}
                >
                  <DownloadIcon className="yt-icon" />
                </a>
              ) : null}
              {!active ? (
                <button
                  type="button"
                  className="yt-icon-button"
                  onClick={() => onRemove(job, job.status === 'completed')}
                  disabled={pendingRemovalIds.includes(job.id)}
                  title={job.status === 'completed' ? 'Delete export file' : 'Remove export entry'}
                  aria-label={job.status === 'completed' ? 'Delete export file' : 'Remove export entry'}
                >
                  <TrashIcon className="yt-icon" />
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
