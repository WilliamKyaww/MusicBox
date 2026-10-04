import { useState } from 'react'
import { ExportJobList } from './ExportJobList'
import { DownloadIcon, LibraryIcon } from './Icons'
import { PageHeader } from './PageHeader'
import type { PlaylistExportFormat, PlaylistExportJob } from '../types'

type YouTubePlaylistDownloadPanelProps = {
  exportJobs: PlaylistExportJob[]
  errorMessage: string | null
  isCreating: boolean
  pendingRemovalIds: string[]
  onCreateExport: (playlistUrl: string, exportFormat: PlaylistExportFormat) => void
  onRemoveExport: (exportJob: PlaylistExportJob, deleteFile: boolean) => void
  /** Inside the Music experience the page supplies its own heading. */
  embedded?: boolean
}

const FORMATS: [PlaylistExportFormat, string, string][] = [
  ['zip', 'ZIP of MP3s', 'One MP3 file per video, in a single ZIP.'],
  ['combined_mp3', 'One combined MP3', 'The whole playlist joined into one long MP3.'],
]

export function YouTubePlaylistDownloadPanel({
  exportJobs,
  errorMessage,
  isCreating,
  pendingRemovalIds,
  onCreateExport,
  onRemoveExport,
  embedded = false,
}: YouTubePlaylistDownloadPanelProps) {
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [format, setFormat] = useState<PlaylistExportFormat>('zip')
  const jobs = exportJobs.filter((job) => job.playlist_id.startsWith('youtube_playlist:'))
  const url = playlistUrl.trim()

  const form = (
    <form
      className="download-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (url) onCreateExport(url, format)
      }}
    >
      <label className="download-form__field">
        <span>YouTube playlist link</span>
        <input
          type="url"
          required
          value={playlistUrl}
          onChange={(event) => setPlaylistUrl(event.target.value)}
          placeholder="https://www.youtube.com/playlist?list=…"
        />
      </label>
      <fieldset className="download-form__formats">
        <legend>Save as</legend>
        {FORMATS.map(([value, label, hint]) => (
          <label key={value} className={`download-format ${format === value ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name="playlist-format"
              value={value}
              checked={format === value}
              onChange={() => setFormat(value)}
            />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="yt-pill yt-pill--primary" disabled={isCreating || !url}>
        <DownloadIcon className="yt-icon" />
        {isCreating ? 'Starting…' : 'Download playlist'}
      </button>
    </form>
  )

  const list = (
    <section className="download-history" aria-label="Playlist downloads">
      <h2>Your Playlist Downloads</h2>
      {errorMessage ? <p className="inline-alert inline-alert--error">{errorMessage}</p> : null}
      {jobs.length ? (
        <ExportJobList jobs={jobs} pendingRemovalIds={pendingRemovalIds} onRemove={onRemoveExport} />
      ) : (
        <div className="empty-state empty-state--compact">
          <LibraryIcon className="yt-icon" />
          <p>Playlists you download appear here while they are prepared, ready to save.</p>
        </div>
      )}
    </section>
  )

  if (embedded)
    return (
      <div className="download-page download-page--embedded">
        <h2>Download a YouTube Playlist</h2>
        {form}
        {list}
      </div>
    )

  return (
    <div className="download-page">
      <PageHeader
        title="Playlist Download"
        subtitle="Save a whole YouTube playlist as MP3s on this computer."
      />
      {form}
      {list}
    </div>
  )
}
