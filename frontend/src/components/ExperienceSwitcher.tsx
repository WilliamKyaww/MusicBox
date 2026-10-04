import { experiencePath, type Experience } from '../experience'
import { navigate } from '../router'

export function ExperienceSwitcher({ active }: { active: Experience }) {
  return (
    <nav className="experience-switch" aria-label="MusicBox experience">
      {(['video', 'music'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === active}
          onClick={() => {
            if (mode !== active) navigate(experiencePath(mode))
          }}
          title={
            mode === 'video'
              ? 'YouTube-style video experience'
              : 'Spotify-style music experience'
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {mode === 'video' ? (
              <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" />
            ) : (
              <path
                d="M9 17V6l10-2v11M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <span>{mode === 'video' ? 'Video' : 'Music'}</span>
        </button>
      ))}
    </nav>
  )
}
