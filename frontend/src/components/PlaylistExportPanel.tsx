import { ExportJobList } from './ExportJobList'
import { DownloadIcon } from './Icons'
import type { Playlist, PlaylistExportFormat, PlaylistExportJob } from '../types'

type PlaylistExportPanelProps = {
  activePlaylist: Playlist | null
  exportJobs: PlaylistExportJob[]
  errorMessage: string | null
  isCreatingExport: boolean
  pendingRemovalIds: string[]
  onCreateExport: (playlistId: string, exportFormat: PlaylistExportFormat) => void
  onRemoveExport: (exportJob: PlaylistExportJob, deleteFile: boolean) => void
}

/** Download a saved playlist as a ZIP of MP3s or one combined MP3, with its past exports. */
export function PlaylistExportPanel({
  activePlaylist,
  exportJobs,
  errorMessage,
  isCreatingExport,
  pendingRemovalIds,
  onCreateExport,
  onRemoveExport,
}: PlaylistExportPanelProps) {
  if (!activePlaylist) return null
  const jobs = exportJobs
    .filter((job) => job.playlist_id === activePlaylist.id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
  const empty = activePlaylist.items.length === 0

  return (
    <section className="export-panel" aria-label="Download this playlist">
      <div className="export-panel__header">
        <div>
          <h2>Download This Playlist</h2>
          <p>{empty ? 'Add songs first.' : 'Save every song as MP3 files on this computer.'}</p>
        </div>
        <div className="export-panel__actions">
          <button
            type="button"
            className="yt-pill"
            onClick={() => onCreateExport(activePlaylist.id, 'zip')}
            disabled={isCreatingExport || empty}
          >
            <DownloadIcon className="yt-icon" />
            ZIP of MP3s
          </button>
          <button
            type="button"
            className="yt-pill"
            onClick={() => onCreateExport(activePlaylist.id, 'combined_mp3')}
            disabled={isCreatingExport || empty}
          >
            <DownloadIcon className="yt-icon" />
            One combined MP3
          </button>
        </div>
      </div>
      {errorMessage ? <p className="inline-alert inline-alert--error">{errorMessage}</p> : null}
      {jobs.length ? (
        <ExportJobList jobs={jobs} pendingRemovalIds={pendingRemovalIds} onRemove={onRemoveExport} />
      ) : null}
    </section>
  )
}
