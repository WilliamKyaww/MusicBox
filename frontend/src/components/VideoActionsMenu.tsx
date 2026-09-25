import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getVideoThumbnailHref } from '../api/downloads'
import { paths } from '../router'
import { useVideoActions } from '../videoActions'
import {
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  ListIcon,
  MoreVertIcon,
  MusicNoteIcon,
  ShareIcon,
  TrashIcon,
  VideoIcon,
} from './Icons'
import type { VideoSearchResult } from '../types'

type VideoActionsMenuProps = {
  video: VideoSearchResult
  onRemove?: () => void
  removeLabel?: string
}

const MENU_WIDTH = 248
const GUTTER = 8

export function VideoActionsMenu({ video, onRemove, removeLabel }: VideoActionsMenuProps) {
  const actions = useVideoActions()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen) return
    const button = buttonRef.current
    const menu = menuRef.current
    if (!button || !menu) return

    const rect = button.getBoundingClientRect()
    const menuHeight = menu.offsetHeight
    const left = Math.min(
      Math.max(GUTTER, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - GUTTER,
    )
    const below = rect.bottom + 4
    const top =
      below + menuHeight > window.innerHeight - GUTTER
        ? Math.max(GUTTER, rect.top - menuHeight - 4)
        : below
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function close(event: Event) {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return
      if (event.type === 'pointerdown') {
        const target = event.target as Node
        if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      }
      setIsOpen(false)
    }

    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [isOpen])

  function run(action: () => void) {
    setIsOpen(false)
    action()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(video.video_url)
      actions.pushToast('Link copied to clipboard.')
    } catch {
      actions.pushToast(video.video_url)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="yt-icon-button yt-icon-button--menu"
        aria-label="Action menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setIsOpen((current) => !current)
        }}
      >
        <MoreVertIcon className="yt-icon" />
      </button>
      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              className="yt-menu"
              role="menu"
              style={{ width: MENU_WIDTH, visibility: 'hidden' }}
            >
              <a
                className="yt-menu__item"
                role="menuitem"
                href={paths.watch(video.id)}
                onClick={() => setIsOpen(false)}
              >
                <VideoIcon className="yt-icon" />
                Watch
              </a>
              <button
                type="button"
                className="yt-menu__item"
                role="menuitem"
                onClick={() => run(() => actions.playAudio(video))}
              >
                <MusicNoteIcon className="yt-icon" />
                Listen (audio only)
              </button>
              <button
                type="button"
                className="yt-menu__item"
                role="menuitem"
                onClick={() => run(() => actions.openSaveToPlaylist(video))}
              >
                <ListIcon className="yt-icon" />
                Save to playlist
              </button>
              <button
                type="button"
                className="yt-menu__item"
                role="menuitem"
                onClick={() => run(() => actions.openDownload(video))}
              >
                <DownloadIcon className="yt-icon" />
                Download…
              </button>
              <a
                className="yt-menu__item"
                role="menuitem"
                href={getVideoThumbnailHref(video.id, video.title, video.thumbnail_url)}
                download
                onClick={() => setIsOpen(false)}
              >
                <ImageIcon className="yt-icon" />
                Download thumbnail
              </a>
              <div className="yt-menu__divider" />
              <button
                type="button"
                className="yt-menu__item"
                role="menuitem"
                onClick={() => run(() => void copyLink())}
              >
                <ShareIcon className="yt-icon" />
                Copy link
              </button>
              <a
                className="yt-menu__item"
                role="menuitem"
                href={video.video_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setIsOpen(false)}
              >
                <ExternalLinkIcon className="yt-icon" />
                Open on YouTube
              </a>
              {onRemove ? (
                <>
                  <div className="yt-menu__divider" />
                  <button
                    type="button"
                    className="yt-menu__item"
                    role="menuitem"
                    onClick={() => run(onRemove)}
                  >
                    <TrashIcon className="yt-icon" />
                    {removeLabel ?? 'Remove'}
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
