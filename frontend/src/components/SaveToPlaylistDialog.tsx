import { useState } from 'react'
import { ModalDialog } from './ModalDialog'
import type { Playlist, VideoSearchResult } from '../types'

type SaveToPlaylistDialogProps = {
  video: VideoSearchResult
  playlists: Playlist[]
  isBusy: boolean
  onSave: (video: VideoSearchResult, playlistIds: string[], newPlaylistName: string) => void
  onCancel: () => void
}

export function SaveToPlaylistDialog({
  video,
  playlists,
  isBusy,
  onSave,
  onCancel,
}: SaveToPlaylistDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function toggle(playlistId: string) {
    setSelectedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId],
    )
  }

  function handleConfirm() {
    if (selectedIds.length === 0 && !newPlaylistName.trim()) {
      setError('Pick a playlist or name a new one.')
      return
    }
    onSave(video, selectedIds, newPlaylistName.trim())
  }

  return (
    <ModalDialog
      title="Save to playlist"
      description={video.title}
      confirmLabel="Save"
      isBusy={isBusy}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    >
      <div className="save-dialog">
        {playlists.length > 0 ? (
          <ul className="save-dialog__list">
            {playlists.map((playlist) => {
              const alreadyAdded = playlist.items.some((item) => item.video_id === video.id)
              return (
                <li key={playlist.id}>
                  <label className="save-dialog__option">
                    <input
                      type="checkbox"
                      checked={alreadyAdded || selectedIds.includes(playlist.id)}
                      disabled={alreadyAdded}
                      onChange={() => toggle(playlist.id)}
                    />
                    <span>{playlist.name}</span>
                    <span className="save-dialog__meta">
                      {alreadyAdded ? 'Already saved' : `${playlist.items.length} videos`}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="save-dialog__empty">You have no playlists yet.</p>
        )}
        <label className="save-dialog__new">
          <span>New playlist</span>
          <input
            type="text"
            value={newPlaylistName}
            maxLength={80}
            placeholder="Enter playlist name…"
            onChange={(event) => {
              setNewPlaylistName(event.target.value)
              setError(null)
            }}
          />
        </label>
        {error ? (
          <p className="download-options__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  )
}
