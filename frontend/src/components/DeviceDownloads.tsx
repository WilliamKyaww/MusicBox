import { useEffect, useRef, useState } from 'react'
import { ApiError, getApiHref } from '../api/client'
import { cancelDeviceDownload, fetchDeviceDownload, type DeviceDownload } from '../api/downloads'
import type { DownloadOptions, VideoSearchResult } from '../types'

export type DeviceDownloadItem = { job: DeviceDownload; video: VideoSearchResult; options: DownloadOptions }

export function DeviceDownloads({ items, onDismiss, onRetry }: {
  items: DeviceDownloadItem[]
  onDismiss: (id: string) => void
  onRetry: (item: DeviceDownloadItem) => void
}) {
  if (!items.length) return null
  return <aside className="device-downloads" aria-label="Device downloads">
    {items.map((item) => <DeviceDownloadCard key={item.job.id} item={item} onDismiss={onDismiss} onRetry={onRetry} />)}
  </aside>
}

function DeviceDownloadCard({ item, onDismiss, onRetry }: {
  item: DeviceDownloadItem
  onDismiss: (id: string) => void
  onRetry: (item: DeviceDownloadItem) => void
}) {
  const [job, setJob] = useState(item.job)
  const [connectionError, setConnectionError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const handedOff = useRef(false)
  const active = job.status === 'queued' || job.status === 'preparing'

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
    return () => { stopped = true; clearTimeout(timer) }
  }, [active, item.job.id])

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

  async function cancel() {
    setCancelling(true)
    try { setJob(await cancelDeviceDownload(job.id)) }
    catch { setConnectionError('Could not cancel. Check your connection and try again.') }
    finally { setCancelling(false) }
  }

  return <section className="device-download" aria-label={item.video.title}>
    <strong>{item.video.title}</strong>
    <p role="status">{connectionError || job.detail}</p>
    {active && <progress max={100} value={job.progress ?? undefined} aria-label="Download preparation progress" />}
    {job.status === 'ready' && <p>The file is ready. If saving did not start, use Save again.</p>}
    <div className="device-download__actions">
      {active ? <button className="yt-pill" type="button" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? 'Cancelling...' : 'Cancel download'}</button> : <>
        {job.status === 'ready' && job.download_path && <a className="yt-pill" href={getApiHref(job.download_path)} download>Save again</a>}
        {job.status === 'failed' && <button className="yt-pill" type="button" onClick={() => onRetry(item)}>Retry</button>}
        <button className="yt-pill" type="button" onClick={() => onDismiss(job.id)}>Dismiss</button>
      </>}
    </div>
  </section>
}
