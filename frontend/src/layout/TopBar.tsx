import { useState } from 'react'
import { navigate, paths } from '../router'
import { AppControls } from '../components/AppControls'
import { ArrowLeftIcon, CloseIcon, MenuIcon, SearchIcon } from '../components/Icons'

type TopBarProps = {
  initialQuery: string
  onToggleSidebar: () => void
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

function SearchForm({
  initialQuery,
  autoFocus,
  onClose,
}: {
  initialQuery: string
  autoFocus: boolean
  onClose: () => void
}) {
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
          onClose()
        }
      }}
    >
      <div className="yt-search__field">
        <SearchIcon className="yt-icon yt-search__leading" />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
          }}
          placeholder="Search"
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
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
  isProcessing,
}: TopBarProps) {
  // On phone-sized windows the search box folds into an icon that opens a full-width bar.
  const [searching, setSearching] = useState(false)

  return (
    <header className={`yt-topbar${searching ? ' yt-topbar--searching' : ''}`}>
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

      <button
        type="button"
        className="yt-icon-button yt-topbar__search-back"
        onClick={() => setSearching(false)}
        aria-label="Close search"
        title="Back"
      >
        <ArrowLeftIcon className="yt-icon" />
      </button>

      {/* Remount on route changes so the box shows the current query. */}
      <SearchForm
        key={`${initialQuery}:${searching}`}
        initialQuery={initialQuery}
        autoFocus={searching}
        onClose={() => setSearching(false)}
      />

      <div className="yt-topbar__end">
        <button
          type="button"
          className="yt-icon-button yt-topbar__search-open"
          onClick={() => setSearching(true)}
          aria-label="Open search"
          title="Search"
        >
          <SearchIcon className="yt-icon" />
        </button>
        {isProcessing ? (
          <a className="yt-topbar__status" href={paths.songs()} title="Downloads in progress">
            <span className="yt-spinner yt-spinner--small" />
            Processing
          </a>
        ) : null}
        <AppControls experience="video" />
      </div>
    </header>
  )
}
