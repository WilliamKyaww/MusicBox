import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

const STEP = 16
const LARGE_STEP = 64

/**
 * A draggable divider between two panels, like Spotify's. `side` says where
 * the resized panel is: dragging towards it makes it narrower.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  side,
  onResize,
  onReset,
  className = '',
  style,
}: {
  label: string
  value: number
  min: number
  max: number
  side: 'start' | 'end'
  /** Called with the proposed width; the caller clamps or snaps it. */
  onResize: (width: number) => void
  onReset: () => void
  className?: string
  style?: CSSProperties
}) {
  const drag = useRef<{ x: number; width: number; frame: number } | null>(null)
  const direction = side === 'start' ? 1 : -1

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    cancelAnimationFrame(drag.current.frame)
    drag.current = null
    document.body.classList.remove('is-resizing-panels')
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}. Drag to resize, double-click to reset.`}
      className={`resize-handle ${className}`}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, width: value, frame: 0 }
        document.body.classList.add('is-resizing-panels')
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current) return
        const width = current.width + (event.clientX - current.x) * direction
        cancelAnimationFrame(current.frame)
        current.frame = requestAnimationFrame(() => onResize(width))
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={onReset}
      onKeyDown={(event: KeyboardEvent) => {
        const step = event.shiftKey ? LARGE_STEP : STEP
        const keys: Record<string, number> = {
          ArrowRight: value + step * direction,
          ArrowLeft: value - step * direction,
          Home: min,
          End: max,
        }
        if (event.key in keys) {
          event.preventDefault()
          onResize(keys[event.key])
        } else if (event.key === 'Enter') {
          event.preventDefault()
          onReset()
        }
      }}
    />
  )
}
