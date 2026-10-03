import type { MouseEvent, ReactNode } from 'react'
import type { VideoSearchResult } from '../types'
import { hueStyle } from './helpers'
import { MusicIcon, type MusicIconName } from './MusicIcon'
import { hueFor } from './recommend'
import { isLiked, toggleLiked, useMusicStore } from './store'

export function Artwork({
  src,
  name,
  round = false,
  liked = false,
  icon = 'music',
  hue,
  className = '',
}: {
  src?: string | null
  name: string
  round?: boolean
  liked?: boolean
  icon?: MusicIconName
  hue?: number
  className?: string
}) {
  return (
    <span
      className={`music-art ${liked ? 'music-art--liked' : ''} ${
        round ? 'music-art--round' : ''
      } ${className}`}
      style={hueStyle(hue ?? (src || liked ? undefined : hueFor(name)))}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
      ) : (
        <MusicIcon name={liked ? 'heart' : icon} filled={liked} />
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}

/** Spotify's playlist cover: a 2x2 grid once there are four different covers. */
export function Mosaic({
  images,
  name,
  className = '',
}: {
  images: (string | null | undefined)[]
  name: string
  className?: string
}) {
  const unique = [...new Set(images.filter(Boolean) as string[])]
  if (unique.length < 4)
    return <Artwork src={unique[0]} name={name} className={className} />
  return (
    <span className={`music-art music-art--mosaic ${className}`}>
      {unique.slice(0, 4).map((src) => (
        <img key={src} src={src} alt="" loading="lazy" />
      ))}
      <span className="sr-only">{name}</span>
    </span>
  )
}

/** The animated bars Spotify shows beside the song that is playing. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span
      className={`music-eq ${playing ? 'is-playing' : ''}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** Spotify's add-to-Liked button: a plus that becomes a green check. */
export function LikeButton({
  video,
  label,
  onToast,
  className = '',
}: {
  video: VideoSearchResult
  label?: string
  onToast?: (message: string) => void
  className?: string
}) {
  useMusicStore()
  const liked = isLiked(video.id)
  return (
    <button
      type="button"
      className={`music-icon-button music-like ${liked ? 'is-liked' : ''} ${className}`}
      aria-label={label ?? `${liked ? 'Unlike' : 'Like'} ${video.title}`}
      aria-pressed={liked}
      title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      onClick={(event) => {
        event.stopPropagation()
        const added = toggleLiked(video)
        onToast?.(added ? 'Added to Liked Songs.' : 'Removed from Liked Songs.')
      }}
    >
      <MusicIcon name={liked ? 'check-circle' : 'plus-circle'} />
    </button>
  )
}

export function PlayButton({
  label,
  playing,
  onClick,
  className = '',
  disabled = false,
}: {
  label: string
  playing?: boolean
  onClick: (event: MouseEvent) => void
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`music-round-play ${className}`}
      aria-label={playing ? label.replace(/^Play/, 'Pause') : label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
    >
      <MusicIcon name={playing ? 'pause' : 'play'} filled />
    </button>
  )
}

export function Card({
  title,
  subtitle,
  art,
  onOpen,
  onPlay,
  playing = false,
  onContextMenu,
  className = '',
}: {
  title: string
  subtitle?: ReactNode
  art: ReactNode
  onOpen: () => void
  onPlay?: () => void
  playing?: boolean
  onContextMenu?: (event: MouseEvent) => void
  className?: string
}) {
  return (
    <article
      className={`music-card ${playing ? 'is-playing' : ''} ${className}`}
      onContextMenu={
        onContextMenu
          ? (event) => {
              event.preventDefault()
              onContextMenu(event)
            }
          : undefined
      }
    >
      <div className="music-card__media">
        <button
          type="button"
          className="music-card__cover"
          onClick={onOpen}
          aria-label={title}
        >
          {art}
        </button>
        {onPlay ? (
          <PlayButton
            className="music-card__play"
            label={`Play ${title}`}
            playing={playing}
            onClick={onPlay}
          />
        ) : null}
      </div>
      {/* The cover button already names the card for assistive technology. */}
      <button
        type="button"
        className="music-card__name"
        onClick={onOpen}
        tabIndex={-1}
        aria-hidden="true"
      >
        {title}
      </button>
      {subtitle ? <p>{subtitle}</p> : null}
    </article>
  )
}

/** One row of cards with "Show all", like a Spotify home shelf. */
export function Shelf({
  title,
  subtitle,
  href,
  children,
}: {
  title: string
  subtitle?: string
  href?: string
  children: ReactNode
}) {
  return (
    <section className="music-shelf">
      <div className="music-section-heading">
        <div>
          {subtitle ? <span className="music-shelf__eyebrow">{subtitle}</span> : null}
          <h2>{href ? <a href={href}>{title}</a> : title}</h2>
        </div>
        {href ? <a href={href}>Show all</a> : null}
      </div>
      <div className="music-cards music-cards--row">{children}</div>
    </section>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="music-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function Skeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="music-cards music-cards--row" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="music-card music-card--skeleton">
          <span className="music-art" />
          <span className="music-skeleton-line" />
          <span className="music-skeleton-line music-skeleton-line--short" />
        </div>
      ))}
    </div>
  )
}
