import type { ReactNode } from 'react'
import { paths } from '../router'
import { SettingsIcon } from './Icons'

type StatusPanelProps = {
  title: string
  body: ReactNode
  tone?: 'neutral' | 'error'
}

/** Messages the backend sends when a key is missing or wrong, which the user fixes in Settings. */
const NEEDS_SETTINGS = /API key/i

export function StatusPanel({
  title,
  body,
  tone = 'neutral',
}: StatusPanelProps) {
  const showSettings = typeof body === 'string' && NEEDS_SETTINGS.test(body)
  return (
    <section className={`status-panel status-panel--${tone}`} aria-live="polite">
      <h2>{title}</h2>
      <p>{body}</p>
      {showSettings ? (
        <a className="yt-pill status-panel__action" href={paths.settings()}>
          <SettingsIcon className="yt-icon" />
          Open Settings
        </a>
      ) : null}
    </section>
  )
}
