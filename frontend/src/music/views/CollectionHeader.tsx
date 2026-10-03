import type { ReactNode } from 'react'
import { hueStyle } from '../helpers'

/** Spotify's big header: cover, type, title, description and summary line over a colour wash. */
export function CollectionHeader({
  art,
  type,
  title,
  description,
  meta,
  hue,
  round = false,
}: {
  art: ReactNode
  type: string
  title: string
  description?: ReactNode
  meta?: ReactNode
  hue: number
  round?: boolean
}) {
  return (
    <header
      className={`music-collection ${round ? 'music-collection--round' : ''}`}
      style={hueStyle(hue)}
    >
      <div className="music-collection__art">{art}</div>
      <div className="music-collection__text">
        <span className="music-collection__type">{type}</span>
        <h1 className={title.length > 28 ? 'is-long' : ''}>{title}</h1>
        {description ? (
          <p className="music-collection__description">{description}</p>
        ) : null}
        {meta ? <p className="music-collection__meta">{meta}</p> : null}
      </div>
    </header>
  )
}
