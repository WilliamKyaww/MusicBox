import { musicPath, type Experience } from '../experience'
import { paths } from '../router'
import { moviesPath } from '../movies/routes'
import { ExperienceSwitcher } from './ExperienceSwitcher'

/**
 * The Video/Music switch and Settings button at the end of both top bars.
 * It looks and behaves the same in both experiences, so its styles don't
 * depend on either experience's theme.
 */
export function AppControls({ experience }: { experience: Experience }) {
  const settingsHref = experience === 'movies' ? moviesPath('settings')
    : experience === 'music' ? musicPath('settings') : paths.settings()
  const current = window.location.hash === settingsHref
  return (
    <div className="app-controls">
      <ExperienceSwitcher active={experience} />
      <a
        className={`app-icon-button ${current ? 'is-current' : ''}`}
        href={settingsHref}
        aria-label="Settings"
        aria-current={current ? 'page' : undefined}
        title="Settings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </div>
  )
}
