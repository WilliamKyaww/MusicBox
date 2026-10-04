import { useState } from 'react'
import { clearHistory, removeHistoryEntry, useLibrary, type HistoryEntry } from '../library'
import { useVideoActions } from '../videoActions'
import { HistoryIcon, SearchIcon, TrashIcon } from '../components/Icons'
import { ModalDialog } from '../components/ModalDialog'
import { PageHeader } from '../components/PageHeader'
import { VideoListItem } from '../components/VideoListItem'

function dayLabel(isoDate: string, now = new Date()) {
  const date = new Date(isoDate)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000)

  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' })
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

function groupByDay(entries: HistoryEntry[]) {
  const groups: { label: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const label = dayLabel(entry.watchedAt)
    const group = groups.at(-1)
    if (group && group.label === label) {
      group.entries.push(entry)
    } else {
      groups.push({ label, entries: [entry] })
    }
  }
  return groups
}

export function HistoryPage() {
  const { setWatchQueue, pushToast } = useVideoActions()
  const history = useLibrary((state) => state.history)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [filter, setFilter] = useState('')

  const needle = filter.trim().toLowerCase()
  const visible = needle
    ? history.filter(
        (entry) =>
          entry.video.title.toLowerCase().includes(needle) ||
          entry.video.channel_title.toLowerCase().includes(needle),
      )
    : history

  return (
    <div className="library-view library-view--narrow">
      <PageHeader
        title="Watch History"
        subtitle="Stored on this device only, along with where you left off in each video."
        actions={
          <button
            type="button"
            className="yt-pill"
            disabled={history.length === 0}
            onClick={() => setConfirmingClear(true)}
          >
            <TrashIcon className="yt-icon" />
            Clear all
          </button>
        }
      >
        <label className="toolbar-search">
          <SearchIcon className="yt-icon" />
          <input
            type="search"
            aria-label="Search watch history"
            placeholder="Search watch history"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </PageHeader>

      {history.length === 0 ? (
        <div className="empty-state">
          <HistoryIcon className="yt-icon" />
          <h2>Nothing Here Yet</h2>
          <p>Videos you watch show up here, so you can pick up where you left off.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <SearchIcon className="yt-icon" />
          <p>Nothing in your history matches "{filter.trim()}".</p>
        </div>
      ) : null}

      {groupByDay(visible).map((group) => (
        <section key={group.label} className="history-group">
          <h2>{group.label}</h2>
          {group.entries.map((entry) => (
            <VideoListItem
              key={entry.video.id}
              video={entry.video}
              onOpen={() => setWatchQueue({ label: 'History', items: visible.map((item) => item.video) })}
              onRemove={() => removeHistoryEntry(entry.video.id)}
              removeLabel="Remove from watch history"
            />
          ))}
        </section>
      ))}

      {confirmingClear ? (
        <ModalDialog
          title="Clear Watch History?"
          description="This also clears where you left off in partly watched videos."
          confirmLabel="Clear history"
          confirmTone="danger"
          onConfirm={() => {
            clearHistory()
            setConfirmingClear(false)
            pushToast('Watch history cleared.')
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      ) : null}
    </div>
  )
}
