import { useState } from 'react'
import { formatClock, formatDate, formatFullViews, formatRelativeTime, formatViews } from '../format'
import { paths } from '../router'
import { RichText } from './RichText'
import type { VideoDetails } from '../types'

type DescriptionBoxProps = {
  details: VideoDetails
  onSeek: (seconds: number) => void
}

export function DescriptionBox({ details, onSeek }: DescriptionBoxProps) {
  const [expanded, setExpanded] = useState(false)
  const isLive = details.live_status === 'is_live'
  const tags = details.tags.slice(0, 3)
  const hasChapters = details.chapters.length > 1

  const headline = expanded
    ? [
        formatFullViews(details.view_count),
        isLive ? 'Started streaming' : null,
        formatDate(details.published_at),
      ]
    : [formatViews(details.view_count, isLive), formatRelativeTime(details.published_at)]

  return (
    <section
      className={`description ${expanded ? 'description--expanded' : ''}`}
      onClick={() => {
        if (!expanded) setExpanded(true)
      }}
    >
      <p className="description__headline">
        {headline.filter(Boolean).join('  ')}
        {tags.map((tag) => (
          <a
            key={tag}
            href={paths.results(`#${tag.replace(/\s+/g, '')}`)}
            onClick={(event) => event.stopPropagation()}
          >
            #{tag.replace(/\s+/g, '')}
          </a>
        ))}
      </p>

      <div className="description__text">
        {details.description ? (
          <RichText text={details.description} onSeek={onSeek} />
        ) : (
          <span className="description__empty">No description has been added to this video.</span>
        )}
      </div>

      {expanded && hasChapters ? (
        <div className="description__chapters">
          <h3>Chapters</h3>
          <ol>
            {details.chapters.map((chapter) => (
              <li key={chapter.start_seconds}>
                <button type="button" onClick={() => onSeek(chapter.start_seconds)}>
                  <span className="description__chapter-time">
                    {formatClock(chapter.start_seconds)}
                  </span>
                  <span>{chapter.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {expanded && details.category ? (
        <p className="description__category">Category: {details.category}</p>
      ) : null}

      <button
        type="button"
        className="description__toggle"
        onClick={(event) => {
          event.stopPropagation()
          setExpanded((current) => !current)
        }}
      >
        {expanded ? 'Show less' : '…more'}
      </button>
    </section>
  )
}
