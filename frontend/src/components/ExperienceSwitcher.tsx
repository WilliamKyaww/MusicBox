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
              <path d="M8 5v14l12-7Z" fill="currentColor" />
            ) : (
              <path
                d="M9 17V5l11-2v12M9 8l11-2M9 17c0 2-6 4-6 1s6-4 6-1Zm11-2c0 2-6 4-6 1s6-4 6-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}
          </svg>
          <span>{mode === 'video' ? 'Video' : 'Music'}</span>
        </button>
      ))}
    </nav>
  )
}
