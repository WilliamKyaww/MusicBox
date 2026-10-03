import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { MusicIcon, type MusicIconName } from './MusicIcon'

export type MenuEntry = {
  kind?: 'item'
  label: string
  icon?: MusicIconName
  onSelect?: () => void
  disabled?: boolean
  /** Shows a check and uses menuitemradio semantics. */
  checked?: boolean
  danger?: boolean
  submenu?: MenuItem[]
  /** Adds a filter box to the submenu, like Spotify's "Find a playlist". */
  searchPlaceholder?: string
}
export type MenuItem =
  | MenuEntry
  | { kind: 'separator' }
  | { kind: 'heading'; label: string }

/** A click position (context menu) or the element the menu belongs to. */
export type MenuAnchor = { x: number; y: number } | DOMRect

const GAP = 4

function isEntry(item: MenuItem): item is MenuEntry {
  return item.kind === undefined || item.kind === 'item'
}

function place(anchor: MenuAnchor, width: number, height: number, side: boolean) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left: number
  let top: number
  if ('width' in anchor) {
    if (side) {
      left = anchor.right - 2
      if (left + width > vw - GAP) left = anchor.left - width + 2
      top = anchor.top - 6
    } else {
      left = anchor.right - width
      if (left < GAP) left = anchor.left
      top = anchor.bottom + GAP
      if (top + height > vh - GAP) top = anchor.top - height - GAP
    }
  } else {
    left = anchor.x
    top = anchor.y
    if (left + width > vw - GAP) left = anchor.x - width
    if (top + height > vh - GAP) top = anchor.y - height
  }
  return {
    left: Math.max(GAP, Math.min(left, vw - width - GAP)),
    top: Math.max(GAP, Math.min(top, vh - height - GAP)),
  }
}

function MenuList({
  items,
  anchor,
  label,
  search,
  side = false,
  onClose,
  onBack,
}: {
  items: MenuItem[]
  anchor: MenuAnchor
  label: string
  search?: string
  side?: boolean
  onClose: () => void
  onBack?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({
    left: -9999,
    top: -9999,
  })
  const [open, setOpen] = useState<{ entry: MenuEntry; rect: DOMRect } | null>(
    null,
  )
  const [filter, setFilter] = useState('')
  const hoverTimer = useRef(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    setPosition(place(anchor, width, height, side))
  }, [anchor, side, filter])

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('input, [role^="menuitem"]:not(:disabled)')
      ?.focus()
    return () => window.clearTimeout(hoverTimer.current)
  }, [])

  const query = filter.trim().toLocaleLowerCase()
  const shown = query
    ? items.filter(
        (item) => isEntry(item) && item.label.toLocaleLowerCase().includes(query),
      )
    : items

  function focusables() {
    return [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        ':scope > .music-menu__items > [role^="menuitem"]:not(:disabled)',
      ) ?? []),
    ]
  }

  function onKeyDown(event: KeyboardEvent) {
    const list = focusables()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      event.preventDefault()
      list[(to + list.length) % list.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index < 0 ? list.length - 1 : index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(list.length - 1)
    else if (event.key === 'Escape' || (event.key === 'ArrowLeft' && onBack)) {
      event.preventDefault()
      event.stopPropagation()
      ;(onBack ?? onClose)()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      className="music-menu"
      style={position}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {search ? (
        <input
          className="music-menu__search"
          type="search"
          placeholder={search}
          aria-label={search}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              event.stopPropagation()
              focusables()[0]?.focus()
            }
          }}
        />
      ) : null}
      <div className="music-menu__items">
        {shown.map((item, index) => {
          if (item.kind === 'separator')
            return <hr key={`sep-${index}`} className="music-menu__separator" />
          if (item.kind === 'heading')
            return (
              <div key={`head-${index}`} className="music-menu__heading">
                {item.label}
              </div>
            )
          const hasSubmenu = Boolean(item.submenu)
          const openSubmenu = (target: HTMLElement) =>
            setOpen({ entry: item, rect: target.getBoundingClientRect() })
          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              aria-haspopup={hasSubmenu ? 'menu' : undefined}
              aria-expanded={hasSubmenu ? open?.entry === item : undefined}
              disabled={item.disabled}
              className={`music-menu__item ${item.danger ? 'is-danger' : ''} ${
                item.checked ? 'is-checked' : ''
              }`}
              onMouseEnter={(event) => {
                window.clearTimeout(hoverTimer.current)
                const target = event.currentTarget
                hoverTimer.current = window.setTimeout(() => {
                  if (hasSubmenu) openSubmenu(target)
                  else setOpen(null)
                }, 140)
              }}
              onKeyDown={(event) => {
                if (hasSubmenu && event.key === 'ArrowRight') {
                  event.preventDefault()
                  openSubmenu(event.currentTarget)
                }
              }}
              onClick={(event) => {
                if (hasSubmenu) {
                  openSubmenu(event.currentTarget)
                  return
                }
                onClose()
                item.onSelect?.()
              }}
            >
              {item.icon ? <MusicIcon name={item.icon} /> : null}
              <span>{item.label}</span>
              {item.checked ? <MusicIcon name="check" /> : null}
              {hasSubmenu ? <MusicIcon name="forward" /> : null}
            </button>
          )
        })}
        {query && !shown.length ? (
          <p className="music-menu__empty">No matches</p>
        ) : null}
      </div>
      {open?.entry.submenu ? (
        <MenuList
          key={open.entry.label}
          items={open.entry.submenu}
          anchor={open.rect}
          label={open.entry.label}
          search={open.entry.searchPlaceholder}
          side
          onClose={onClose}
          onBack={() => {
            const opener = focusables().find(
              (element) => element.getAttribute('aria-expanded') === 'true',
            )
            setOpen(null)
            opener?.focus()
          }}
        />
      ) : null}
    </div>
  )
}

export function Menu({
  items,
  anchor,
  label,
  onClose,
}: {
  items: MenuItem[]
  anchor: MenuAnchor
  label: string
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const close = () => closeRef.current()
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', close)
    window.addEventListener('hashchange', close)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('hashchange', close)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(
    <div ref={rootRef} className="music-menu-root">
      <MenuList items={items} anchor={anchor} label={label} onClose={onClose} />
    </div>,
    document.body,
  )
}
