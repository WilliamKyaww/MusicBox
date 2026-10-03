import { useState } from 'react'
import { navigate, paths } from '../router'
import { CloseIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from '../components/Icons'
import { ExperienceSwitcher } from '../components/ExperienceSwitcher'

type TopBarProps = {
  initialQuery: string
  onToggleSidebar: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  isProcessing: boolean
}

export function Logo() {
  return (
    <a className="yt-logo" href={paths.home()} aria-label="MusicBox home">
      <svg viewBox="0 0 32 24" aria-hidden="true">
        <rect width="32" height="24" rx="6" fill="#7c3aed" />
        <path d="M13 7.5v9l7.5-4.5L13 7.5Z" fill="#fff" />
      </svg>
      <span>MusicBox</span>
    </a>
  )
}

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery)

  return (
    <form
      className="yt-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        const query = value.trim()
        if (query) {
          navigate(paths.results(query))
          ;(document.activeElement as HTMLElement | null)?.blur()
        }
      }}
    >
      <div className="yt-search__field">
        <SearchIcon className="yt-icon yt-search__leading" />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search"
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
        />
        {value ? (
          <button
            type="button"
            className="yt-search__clear"
            onClick={() => setValue('')}
            aria-label="Clear search"
          >
            <CloseIcon className="yt-icon" />
          </button>
        ) : null}
      </div>
      <button type="submit" className="yt-search__submit" aria-label="Search" title="Search">
        <SearchIcon className="yt-icon" />
      </button>
    </form>
  )
}

export function TopBar({
  initialQuery,
  onToggleSidebar,
  theme,
  onToggleTheme,
  isProcessing,
}: TopBarProps) {
  return (
    <header className="yt-topbar">
      <div className="yt-topbar__start">
        <button
          type="button"
          className="yt-icon-button"
          onClick={onToggleSidebar}
          aria-label="Guide"
          title="Guide"
        >
          <MenuIcon className="yt-icon" />
        </button>
        <Logo />
      </div>

      {/* Remount on route changes so the box shows the current query. */}
      <SearchForm key={initialQuery} initialQuery={initialQuery} />

      <div className="yt-topbar__end">
        <ExperienceSwitcher active="video" />
        {isProcessing ? (
          <a className="yt-topbar__status" href={paths.songs()} title="Downloads in progress">
            <span className="yt-spinner yt-spinner--small" />
            Processing
          </a>
        ) : null}
        <button
          type="button"
          className="yt-icon-button"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Dark theme' : 'Light theme'}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? <MoonIcon className="yt-icon" /> : <SunIcon className="yt-icon" />}
        </button>
      </div>
    </header>
  )
}
