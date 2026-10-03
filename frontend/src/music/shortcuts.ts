import { useEffect, useEffectEvent } from 'react'
import { musicPath } from '../experience'
import { navigate } from '../router'
import { getPlayback, getPlaybackControls } from './playback'

/** Spotify's desktop shortcuts, where a browser lets the page use them. */
export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Playback',
    items: [
      ['Space', 'Play or pause'],
      ['Ctrl + Right', 'Next song'],
      ['Ctrl + Left', 'Previous song (restarts after 3 seconds)'],
      ['Ctrl + Up / Down', 'Volume up or down'],
      ['M', 'Mute or unmute'],
      ['Alt + S', 'Shuffle'],
      ['Alt + R', 'Repeat'],
      ['Alt + Shift + B', 'Like or unlike the playing song'],
      ['F', 'Full screen'],
    ],
  },
  {
    group: 'Navigation',
    items: [
      ['Ctrl + K', 'Search'],
      ['Alt + Shift + H', 'Home'],
      ['Alt + Shift + S', 'Liked Songs'],
      ['Alt + Shift + 1', 'Playlists'],
      ['Alt + Shift + 3', 'Artists'],
      ['Alt + Shift + Q', 'Queue'],
      ['Alt + Shift + R', 'Now Playing view'],
      ['Alt + Shift + L', 'Collapse or expand Your Library'],
      ['Ctrl + N', 'New playlist (desktop app; browsers keep this key)'],
      ['Ctrl + /', 'Show these shortcuts'],
      ['Escape', 'Close menus, dialogs and full screen'],
    ],
  },
]

type Handlers = {
  focusSearch: () => void
  newPlaylist: () => void
  toggleLibrary: () => void
  toggleSidebar: (panel: 'queue' | 'now-playing') => void
  showShortcuts: () => void
  fullScreen: () => void
  likeCurrent: () => void
}

export function useMusicShortcuts(handlers: Handlers) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    const typing =
      target?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
    const ctrl = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    // Full screen is a dialog too, but playback keys should keep working there.
    const overlay = document.querySelector('[role="dialog"]:not(.music-fullscreen), .music-menu')
    const act = (action: () => void) => {
      event.preventDefault()
      action()
    }
    if (overlay) return
    if (ctrl && key === 'k') return act(handlers.focusSearch)
    if (typing) return
    if (ctrl && (key === '/' || key === '?')) return act(handlers.showShortcuts)
    if (ctrl && key === 'n') return act(handlers.newPlaylist)
    const controls = getPlaybackControls()
    if (ctrl && !event.altKey) {
      if (event.key === 'ArrowRight') return act(() => controls?.next())
      if (event.key === 'ArrowLeft') return act(() => controls?.previous())
      if (event.key === 'ArrowUp')
        return act(() => controls?.setVolume(getPlayback().volume + 0.1))
      if (event.key === 'ArrowDown')
        return act(() => controls?.setVolume(getPlayback().volume - 0.1))
      return
    }
    if (event.altKey && event.shiftKey) {
      const routes: Record<string, string> = {
        KeyH: musicPath(),
        KeyS: musicPath('liked'),
        Digit1: musicPath('playlists'),
        Digit3: musicPath('artists'),
      }
      if (routes[event.code]) return act(() => navigate(routes[event.code]))
      if (event.code === 'KeyQ') return act(() => handlers.toggleSidebar('queue'))
      if (event.code === 'KeyR') return act(() => handlers.toggleSidebar('now-playing'))
      if (event.code === 'KeyL') return act(handlers.toggleLibrary)
      if (event.code === 'KeyB') return act(handlers.likeCurrent)
      return
    }
    if (event.altKey) {
      if (event.code === 'KeyS') return act(() => controls?.toggleShuffle())
      if (event.code === 'KeyR') return act(() => controls?.toggleLoop())
      if (event.key === 'ArrowRight') return act(() => controls?.next())
      if (event.key === 'ArrowLeft') return act(() => controls?.previous())
      return
    }
    // Space on a focused button presses that button instead.
    if (event.code === 'Space' && target?.tagName !== 'BUTTON' && target?.tagName !== 'A')
      return act(() => controls?.toggle())
    if (key === 'm') return act(() => controls?.toggleMute())
    if (key === 'f' && getPlayback().videoId) return act(handlers.fullScreen)
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
