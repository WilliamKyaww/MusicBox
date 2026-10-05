import { experiencePath, type Experience } from '../experience'
import { navigate } from '../router'
import { useMoviesStatus } from '../movies/status'

export function ExperienceSwitcher({ active }: { active: Experience }) {
  const { data } = useMoviesStatus()
  const modes: Experience[] = data?.enabled || active === 'movies'
    ? ['video', 'music', 'movies'] : ['video', 'music']
  return (
    <nav className="experience-switch" aria-label="MusicBox experience">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === active}
          onClick={() => {
            if (mode !== active) navigate(experiencePath(mode))
          }}
          title={
            mode === 'movies' ? 'Movies experience preview' : mode === 'video'
              ? 'YouTube-style video experience'
              : 'Spotify-style music experience'
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {mode === 'movies' ? (
              <path d="M3 5h18v14H3Zm4 0v14M17 5v14M3 10h4m-4 4h4m10-4h4m-4 4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            ) : mode === 'video' ? (
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
          <span>{mode === 'movies' ? 'Movies' : mode === 'video' ? 'Video' : 'Music'}</span>
        </button>
      ))}
    </nav>
  )
}
