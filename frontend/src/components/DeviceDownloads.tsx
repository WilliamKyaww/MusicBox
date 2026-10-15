import { useEffect, useRef, useState } from 'react'
import { ApiError, getApiHref } from '../api/client'
import { cancelDeviceDownload, fetchDeviceDownload, type DeviceDownload } from '../api/downloads'
import { getDesktopBridge, type SavedDownload } from '../desktop'
import type { DownloadOptions, VideoSearchResult } from '../types'
import { AlertIcon, CheckIcon, CloseIcon, DownloadIcon, FolderIcon } from './Icons'

export type DeviceDownloadItem = { job: DeviceDownload; video: VideoSearchResult; options: DownloadOptions }

type Props = {
  items: DeviceDownloadItem[]
  onDismiss: (id: string) => void
  onRetry: (item: DeviceDownloadItem) => void
}

/** How long a finished card stays before it tidies itself away. Failures stay until dismissed. */
const READY_VISIBLE_MS = 12000
const SAVED_VISIBLE_MS = 9000
const CANCELLED_VISIBLE_MS = 3000

export function DeviceDownloads({ items, onDismiss, onRetry }: Props) {
  if (!items.length) return null
  return (
    <aside className="download-toasts" aria-label="Device downloads">
      {items.map((item) => (
        <DownloadToast key={item.job.id} item={item} onDismiss={onDismiss} onRetry={onRetry} />
      ))}
    </aside>
  )
}

function DownloadToast({ item, onDismiss, onRetry }: { item: DeviceDownloadItem } & Omit<Props, 'items'>) {
  const [job, setJob] = useState(item.job)
  const [connectionError, setConnectionError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [saved, setSaved] = useState<SavedDownload | null>(null)
  const [paused, setPaused] = useState(false)
  const handedOff = useRef(false)
  const dismissRef = useRef(onDismiss)
  const desktop = getDesktopBridge()
  const active = job.status === 'queued' || job.status === 'preparing'

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const next = await fetchDeviceDownload(item.job.id)
        if (stopped) return
        setJob(next)
        setConnectionError('')
      } catch (error) {
        if (stopped) return
        if (error instanceof ApiError && error.status === 404) {
          setJob((current) => ({ ...current, status: 'failed', detail: error.message }))
        } else setConnectionError('Connection interrupted. Checking again...')
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1500)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [active, item.job.id])

  // Hand the finished file to the browser (or the desktop app, which saves it itself).
  useEffect(() => {
    if (job.status !== 'ready' || !job.download_path || handedOff.current) return
    handedOff.current = true
    const link = document.createElement('a')
    link.href = getApiHref(job.download_path)
    link.download = ''
    document.body.append(link)
    link.click()
    link.remove()
  }, [job.status, job.download_path])

  // The desktop app reports where the file landed, so the card can say so.
  useEffect(() => {
    if (!desktop) return
    return desktop.onDownloadSaved((details) => {
      if (details.id === item.job.id) setSaved(details)
    })
  }, [desktop, item.job.id])

  const dismissAfter =
    job.status === 'ready'
      ? saved || !desktop
        ? SAVED_VISIBLE_MS
        : READY_VISIBLE_MS
      : job.status === 'cancelled'
        ? CANCELLED_VISIBLE_MS
        : null

  useEffect(() => {
    if (dismissAfter === null || paused) return
    const timer = setTimeout(() => dismissRef.current(job.id), dismissAfter)
    return () => clearTimeout(timer)
  }, [dismissAfter, paused, job.id, saved])

  async function cancel() {
    setCancelling(true)
    try {
      setJob(await cancelDeviceDownload(job.id))
    } catch {
      setConnectionError('Could not cancel. Check your connection and try again.')
    } finally {
      setCancelling(false)
    }
  }

  const failed = job.status === 'failed'
  const ready = job.status === 'ready'
  const tone = failed ? 'failed' : ready ? 'ready' : job.status === 'cancelled' ? 'cancelled' : 'active'

  let headline = connectionError || job.detail
  if (ready) {
    headline = saved
      ? `Saved to ${saved.folder}`
      : desktop
        ? 'Saving to your computer...'
        : 'Ready. Your browser is saving the file.'
  } else if (job.status === 'cancelled') {
    headline = 'Download cancelled.'
  }

  const percent = job.progress
  return (
    <section
      className={`download-toast download-toast--${tone}`}
      aria-label={item.video.title}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="download-toast__badge" aria-hidden="true">
        {failed ? (
          <AlertIcon className="download-toast__icon" />
        ) : ready ? (
          <CheckIcon className="download-toast__icon" />
        ) : (
          <DownloadIcon className="download-toast__icon" />
        )}
      </span>

      <div className="download-toast__body">
        <strong className="download-toast__title" title={item.video.title}>
          {saved?.name ?? item.video.title}
        </strong>
        <p className="download-toast__status" role="status">
          {headline}
          {active && percent !== null ? ` ${percent}%` : ''}
        </p>

        {active ? (
          <div
            className={`download-toast__bar ${percent === null ? 'download-toast__bar--indeterminate' : ''}`}
            role="progressbar"
            aria-label="Download preparation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <span style={percent === null ? undefined : { width: `${percent}%` }} />
          </div>
        ) : null}

        <div className="download-toast__actions">
          {active ? (
            <button
              type="button"
              className="download-toast__action"
              aria-label="Cancel download"
              disabled={cancelling}
              onClick={() => void cancel()}
            >
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          ) : null}
          {ready && saved && desktop ? (
            <button
              type="button"
              className="download-toast__action download-toast__action--primary"
              onClick={() => void desktop.showInFolder(saved.path)}
            >
              <FolderIcon className="download-toast__action-icon" />
              Show in folder
            </button>
          ) : null}
          {ready && !desktop && job.download_path ? (
            <a className="download-toast__action download-toast__action--primary" href={getApiHref(job.download_path)} download>
              Save again
            </a>
          ) : null}
          {failed ? (
            <button
              type="button"
              className="download-toast__action download-toast__action--primary"
              onClick={() => onRetry(item)}
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>

      {!active ? (
        <button
          type="button"
          className="download-toast__close"
          onClick={() => onDismiss(job.id)}
          aria-label={`Dismiss ${item.video.title}`}
          title="Dismiss"
        >
          <CloseIcon className="download-toast__close-icon" />
        </button>
      ) : null}
    </section>
  )
}
