import { useState } from 'react'
import { clearHistory, removeHistoryEntry, useLibrary, type HistoryEntry } from '../library'
import { useVideoActions } from '../videoActions'
import { ModalDialog } from '../components/ModalDialog'
import { StatusPanel } from '../components/StatusPanel'
import { VideoListItem } from '../components/VideoListItem'

function dayLabel(isoDate: string, now = new Date()) {
  const date = new Date(isoDate)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000)

  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return date.toLocaleDateString('en', { weekday: 'long' })
  return date.toLocaleDateString('en', {
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
    <div className="history-page">
      <div className="history-page__main">
        <h1 className="page-title">Watch history</h1>
        {history.length === 0 ? (
          <StatusPanel
            title="This list has no videos."
            body="Videos you watch here will show up in your history."
          />
        ) : null}
        {groupByDay(visible).map((group) => (
          <section key={group.label} className="history-group">
            <h2>{group.label}</h2>
            {group.entries.map((entry) => (
              <VideoListItem
                key={entry.video.id}
                video={entry.video}
                onOpen={() =>
                  setWatchQueue({ label: 'History', items: visible.map((item) => item.video) })
                }
                onRemove={() => removeHistoryEntry(entry.video.id)}
                removeLabel="Remove from watch history"
              />
            ))}
          </section>
        ))}
      </div>

      <aside className="history-page__side">
        <input
          type="search"
          className="history-page__search"
          placeholder="Search watch history"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button
          type="button"
          className="yt-pill"
          disabled={history.length === 0}
          onClick={() => setConfirmingClear(true)}
        >
          Clear all watch history
        </button>
        <p className="history-page__note">
          History and resume points are stored in this browser only.
        </p>
      </aside>

      {confirmingClear ? (
        <ModalDialog
          title="Clear watch history?"
          description="This also clears resume points for partly watched videos."
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
