import { useEffect, useRef, useState } from 'react'
import { fetchComments } from '../api/browse'
import { formatCompact, formatRelativeTime } from '../format'
import { paths } from '../router'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { SortIcon, ThumbUpIcon } from '../components/Icons'
import { LoadMoreSentinel } from '../components/LoadMoreSentinel'
import { RichText } from './RichText'
import type { VideoComment } from '../types'

type CommentsSectionProps = {
  videoId: string
  channelId: string
  commentCount: number | null
  videoUrl: string
  onSeek: (seconds: number) => void
}

type Order = 'relevance' | 'time'

type CommentsState = {
  key: string
  items: VideoComment[]
  nextPageToken: string | null
  disabled: boolean
  isLoading: boolean
  error: string | null
}

function emptyState(key: string): CommentsState {
  return { key, items: [], nextPageToken: null, disabled: false, isLoading: true, error: null }
}

export function CommentsSection({
  videoId,
  channelId,
  commentCount,
  videoUrl,
  onSeek,
}: CommentsSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [order, setOrder] = useState<Order>('relevance')
  const [pageToken, setPageToken] = useState<string | null>(null)
  const key = `${videoId}:${order}`
  const [state, setState] = useState<CommentsState>(() => emptyState(key))

  // Like YouTube, comments load only once they scroll into view.
  useEffect(() => {
    const element = sectionRef.current
    if (!element || isVisible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsVisible(true)
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isVisible])

  let current = state
  if (state.key !== key) {
    current = emptyState(key)
    setState(current)
    setPageToken(null)
  }

  useEffect(() => {
    if (!isVisible) return
    const controller = new AbortController()
    fetchComments(videoId, { pageToken, order, channelId }, controller.signal)
      .then((response) => {
        setState((previous) =>
          previous.key !== key
            ? previous
            : {
                key,
                items: pageToken ? [...previous.items, ...response.items] : response.items,
                nextPageToken: response.next_page_token,
                disabled: response.disabled,
                isLoading: false,
                error: null,
              },
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Could not load comments.',
        }))
      })
    return () => controller.abort()
  }, [isVisible, key, videoId, order, channelId, pageToken])

  const total = commentCount ?? null

  return (
    <section className="comments" ref={sectionRef}>
      <header className="comments__header">
        <h2>{total !== null ? `${total.toLocaleString('en')} Comments` : 'Comments'}</h2>
        <div className="comments__sort">
          <SortIcon className="yt-icon" />
          <select
            value={order}
            aria-label="Sort comments"
            onChange={(event) => setOrder(event.target.value as Order)}
          >
            <option value="relevance">Top comments</option>
            <option value="time">Newest first</option>
          </select>
        </div>
      </header>

      {current.disabled ? (
        <p className="comments__notice">Comments are turned off.</p>
      ) : null}
      {current.error ? <p className="comments__notice">{current.error}</p> : null}

      <ul className="comments__list">
        {current.items.map((comment) => {
          const authorHref = comment.author_channel_id
            ? paths.channel(comment.author_channel_id)
            : null
          return (
            <li key={comment.id} className="comment">
              <ChannelAvatar
                name={comment.author.replace(/^@/, '')}
                url={comment.author_thumbnail_url}
                size={40}
                href={authorHref}
              />
              <div className="comment__body">
                <p className="comment__meta">
                  {comment.is_pinned ? <span className="comment__pinned">Pinned</span> : null}
                  <a
                    className={comment.is_uploader ? 'comment__author--uploader' : undefined}
                    href={authorHref ?? undefined}
                  >
                    {comment.author}
                  </a>
                  <span>{formatRelativeTime(comment.published_at)}</span>
                </p>
                <p className="comment__text">
                  <RichText text={comment.text} onSeek={onSeek} />
                </p>
                <p className="comment__actions">
                  <ThumbUpIcon className="yt-icon" />
                  {comment.like_count > 0 ? formatCompact(comment.like_count) : ''}
                  {comment.reply_count > 0 ? (
                    <a href={`${videoUrl}&lc=${comment.id}`} target="_blank" rel="noreferrer">
                      {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
                    </a>
                  ) : null}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <LoadMoreSentinel
        hasMore={isVisible && (current.isLoading || Boolean(current.nextPageToken))}
        isLoading={isVisible && current.isLoading}
        onLoadMore={() => {
          if (!current.nextPageToken) return
          setState((previous) => ({ ...previous, isLoading: true }))
          setPageToken(current.nextPageToken)
        }}
      />
    </section>
  )
}
