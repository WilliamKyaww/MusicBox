import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AppControls } from '../components/AppControls'
import { CheckIcon, CloseIcon, MenuIcon, SearchIcon } from '../components/Icons'
import { navigate } from '../router'
import { type Profile } from './api'
import { matchesQuery, releaseYear, typeLabel } from './format'
import { useMovieLibrary } from './libraryStore'
import { moviesPath, type MoviesRoute, type MoviesView } from './routes'

const NAV: [MoviesView, string][] = [['home', 'Home'], ['movies', 'Movies'], ['tv', 'TV shows'], ['free', 'Free to watch'], ['list', 'My list']]
const ACCOUNT: [MoviesView, string][] = [['history', 'Watch history'], ['library', 'My files'], ['profiles', 'Manage profiles']]

/** Closes a popover on Escape or a click elsewhere. */
function useDismiss(open: boolean, close: () => void, area: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!area.current?.contains(event.target as Node)) close() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open, close, area])
}

function HeaderMenu({ className, label, button, children }: { className: string; label: string; button: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const panel = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, area)
  return <div className={`movies-menu ${className}`} ref={area}>
    <button type="button" className="movies-menu__button" aria-label={label} title={label} aria-expanded={open} aria-controls={panel} onClick={() => setOpen(value => !value)}>{button}</button>
    <div className="movies-menu__panel" id={panel} hidden={!open}>{children(close)}</div>
  </div>
}

function ProfileChoices({ profiles, selected, onSelect, close }: { profiles: Profile[]; selected: string; onSelect: (id: string) => void; close: () => void }) {
  return <>
    <p className="movies-menu__heading">Profiles</p>
    {profiles.map(profile => <button type="button" key={profile.id} className="movies-menu__item" aria-pressed={profile.id === selected}
      onClick={() => { onSelect(profile.id); close() }}>
      <span className="movies-avatar movies-avatar--small" aria-hidden="true">{Array.from(profile.name)[0]?.toLocaleUpperCase('en-GB')}</span>
      <span>{profile.name}</span>{profile.id === selected && <CheckIcon className="yt-icon movies-menu__check" />}
    </button>)}
  </>
}

function AccountLinks({ route, close }: { route: MoviesRoute; close: () => void }) {
  return <>{ACCOUNT.map(([view, label]) => <a key={view} className="movies-menu__item" href={moviesPath(view)} aria-current={route.view === view ? 'page' : undefined} onClick={close}>{label}</a>)}</>
}

/** Search over the titles that can be played, with instant suggestions. */
function HeaderSearch({ query }: { query: string }) {
  const { items } = useMovieLibrary()
  const [open, setOpen] = useState(query !== '')
  const [text, setText] = useState(query)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => text.trim().length >= 2 && items ? items.filter(item => matchesQuery(item, text)).slice(0, 6) : [], [items, text])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const collapse = () => { setText(''); setOpen(false); setFocused(false) }
  return <form className={`movies-search${open ? ' movies-search--open' : ''}`} role="search"
    onSubmit={event => { event.preventDefault(); const value = text.trim(); setFocused(false); if (value) navigate(moviesPath('search', '', value)) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); if (!text.trim() && query === '') setOpen(false) } }}>
    {open
      ? <>
        <SearchIcon className="yt-icon movies-search__icon" />
        <input ref={input} type="search" aria-label="Search movies and TV" placeholder="Titles, genres, people" value={text} maxLength={200} autoComplete="off"
          onFocus={() => setFocused(true)} onChange={event => { setText(event.target.value); setFocused(true) }}
          onKeyDown={event => { if (event.key === 'Escape') { if (text) setText(''); else collapse() } }} />
        <button type="button" className="movies-icon-button" aria-label="Close search" title="Close search" onClick={collapse}><CloseIcon className="yt-icon" /></button>
        {focused && text.trim().length >= 2 && <div className="movies-suggestions" role="region" aria-label="Search suggestions">
          {matches.length > 0
            ? matches.map(item => <a key={item.id} href={moviesPath('details', item.id)} onClick={() => setFocused(false)}>
              <span>{item.title}</span><small>{[typeLabel(item), releaseYear(item.date)].filter(Boolean).join(' · ')}</small></a>)
            : <p>{items ? 'No playable titles match that search.' : 'Searching…'}</p>}
        </div>}
      </>
      : <button type="button" className="movies-icon-button" aria-label="Search" title="Search" onClick={() => setOpen(true)}><SearchIcon className="yt-icon" /></button>}
  </form>
}

export function MoviesHeader({ route, ready, profiles, selected, onSelect }: {
  route: MoviesRoute; ready: boolean; profiles: Profile[]; selected: string; onSelect: (id: string) => void
}) {
  const active = profiles.find(profile => profile.id === selected) ?? profiles[0]
  return <header className="movies-header">
    <div className="movies-header__start">
      <a className="movies-brand" href={moviesPath()} aria-label="Movies home"><img src="/favicon.svg" alt="" /><strong>MusicBox</strong></a>
      {ready && <>
        <nav className="movies-nav" aria-label="Movies navigation">
          {NAV.map(([view, label]) => <a key={view} href={moviesPath(view)} aria-current={route.view === view ? 'page' : undefined}>{label}</a>)}
        </nav>
        <HeaderMenu className="movies-browse" label="Browse Movies" button={<><MenuIcon className="yt-icon" /><span>Browse</span></>}>
          {close => <>
            <nav aria-label="Browse Movies">
              {NAV.map(([view, label]) => <a key={view} className="movies-menu__item" href={moviesPath(view)} aria-current={route.view === view ? 'page' : undefined} onClick={close}>{label}</a>)}
            </nav>
            {/* The profile menu is hidden on phone-sized windows, so its contents move here. */}
            <div className="movies-menu__phone-only">
              <div className="movies-menu__rule" />
              <AccountLinks route={route} close={close} />
              <div className="movies-menu__rule" />
              {active && <ProfileChoices profiles={profiles} selected={active.id} onSelect={onSelect} close={close} />}
            </div>
          </>}
        </HeaderMenu>
      </>}
    </div>
    <div className="movies-header__end">
      {ready && <HeaderSearch key={route.view === 'search' ? route.query : ''} query={route.view === 'search' ? route.query : ''} />}
      {ready && active && <HeaderMenu className="movies-account" label={`Profile: ${active.name}`}
        button={<span className="movies-avatar" aria-hidden="true">{Array.from(active.name)[0]?.toLocaleUpperCase('en-GB')}</span>}>
        {close => <>
          <ProfileChoices profiles={profiles} selected={active.id} onSelect={onSelect} close={close} />
          <div className="movies-menu__rule" />
          <AccountLinks route={route} close={close} />
        </>}
      </HeaderMenu>}
      <AppControls experience="movies" />
    </div>
  </header>
}
