import { useEffect, useState, type ReactNode } from 'react'
import { useLibrary } from '../library'
import { paths, type Route } from '../router'
import { ChannelAvatar } from '../components/ChannelAvatar'
import {
  DownloadIcon,
  HistoryIcon,
  HomeIcon,
  LibraryIcon,
  ListIcon,
  MenuIcon,
  SubscriptionsIcon,
} from '../components/Icons'
import { Logo } from './TopBar'

export type SidebarMode = 'full' | 'mini' | 'hidden'

type SidebarProps = {
  mode: SidebarMode
  drawerOpen: boolean
  onCloseDrawer: () => void
  route: Route
}

type NavItem = {
  href: string
  label: string
  icon: ReactNode
  active: boolean
}

const COLLAPSED_SUBSCRIPTIONS = 7

function NavLink({ item, mini }: { item: NavItem; mini: boolean }) {
  return (
    <a
      className={`yt-nav__item ${mini ? 'yt-nav__item--mini' : ''} ${
        item.active ? 'yt-nav__item--active' : ''
      }`}
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      title={mini ? item.label : undefined}
    >
      {item.icon}
      <span>{item.label}</span>
    </a>
  )
}

function SidebarContent({ route, mini }: { route: Route; mini: boolean }) {
  const subscriptions = useLibrary((state) => state.subscriptions)
  const [showAll, setShowAll] = useState(false)

  const primary: NavItem[] = [
    { href: paths.home(), label: 'Home', icon: <HomeIcon className="yt-icon" />, active: route.name === 'home' },
    {
      href: paths.subscriptions(),
      label: 'Subscriptions',
      icon: <SubscriptionsIcon className="yt-icon" />,
      active: route.name === 'subscriptions',
    },
  ]
  const library: NavItem[] = [
    { href: paths.history(), label: 'History', icon: <HistoryIcon className="yt-icon" />, active: route.name === 'history' },
    { href: paths.songs(), label: 'Downloads', icon: <DownloadIcon className="yt-icon" />, active: route.name === 'songs' },
    { href: paths.playlists(), label: 'Playlists', icon: <ListIcon className="yt-icon" />, active: route.name === 'playlists' },
    {
      href: paths.import(),
      label: 'Playlist download',
      icon: <LibraryIcon className="yt-icon" />,
      active: route.name === 'import',
    },
  ]

  if (mini) {
    return (
      <nav className="yt-nav yt-nav--mini" aria-label="Main">
        {[...primary, ...library.slice(0, 3)].map((item) => (
          <NavLink key={item.href} item={item} mini />
        ))}
      </nav>
    )
  }

  const visibleSubscriptions = showAll
    ? subscriptions
    : subscriptions.slice(0, COLLAPSED_SUBSCRIPTIONS)
  const activeChannel = route.name === 'channel' ? route.channelRef : null

  return (
    <nav className="yt-nav" aria-label="Main">
      <div className="yt-nav__section">
        {primary.map((item) => (
          <NavLink key={item.href} item={item} mini={false} />
        ))}
      </div>
      <div className="yt-nav__section">
        <h2 className="yt-nav__heading">You</h2>
        {library.map((item) => (
          <NavLink key={item.href} item={item} mini={false} />
        ))}
      </div>
      {subscriptions.length > 0 ? (
        <div className="yt-nav__section">
          <h2 className="yt-nav__heading">Subscriptions</h2>
          {visibleSubscriptions.map((channel) => (
            <a
              key={channel.id}
              className={`yt-nav__item ${activeChannel === channel.id ? 'yt-nav__item--active' : ''}`}
              href={paths.channel(channel.id)}
            >
              <ChannelAvatar name={channel.name} url={channel.avatarUrl} size={24} />
              <span>{channel.name}</span>
            </a>
          ))}
          {subscriptions.length > COLLAPSED_SUBSCRIPTIONS ? (
            <button type="button" className="yt-nav__item" onClick={() => setShowAll((value) => !value)}>
              <span className="yt-nav__chevron" aria-hidden="true">
                {showAll ? '˄' : '˅'}
              </span>
              <span>{showAll ? 'Show fewer' : `Show ${subscriptions.length - COLLAPSED_SUBSCRIPTIONS} more`}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="yt-nav__footer">MusicBox · personal YouTube client</p>
    </nav>
  )
}

export function Sidebar({ mode, drawerOpen, onCloseDrawer, route }: SidebarProps) {
  useEffect(() => {
    if (!drawerOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseDrawer()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, onCloseDrawer])

  return (
    <>
      {mode !== 'hidden' ? (
        <aside className={`yt-sidebar yt-sidebar--${mode}`}>
          <SidebarContent route={route} mini={mode === 'mini'} />
        </aside>
      ) : null}

      {drawerOpen ? (
        <div className="yt-drawer" role="presentation" onClick={onCloseDrawer}>
          <aside
            className="yt-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Guide"
            onClick={(event) => {
              event.stopPropagation()
              // Following a link closes the drawer, like YouTube's guide.
              if ((event.target as HTMLElement).closest('a')) onCloseDrawer()
            }}
          >
            <div className="yt-drawer__header">
              <button type="button" className="yt-icon-button" onClick={onCloseDrawer} aria-label="Close guide">
                <MenuIcon className="yt-icon" />
              </button>
              <Logo />
            </div>
            <SidebarContent route={route} mini={false} />
          </aside>
        </div>
      ) : null}
    </>
  )
}
