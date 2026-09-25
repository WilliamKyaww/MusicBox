import { useEffect, useRef } from 'react'

type LoadMoreSentinelProps = {
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
}

/** Loads the next page when scrolled into view, with a button as a fallback. */
export function LoadMoreSentinel({ hasMore, isLoading, onLoadMore }: LoadMoreSentinelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  useEffect(() => {
    const element = ref.current
    if (!element || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, isLoading])

  if (!hasMore && !isLoading) return null

  return (
    <div ref={ref} className="yt-load-more">
      {isLoading ? (
        <span className="yt-spinner" aria-label="Loading more" />
      ) : (
        <button type="button" className="yt-chip" onClick={onLoadMore}>
          Show more
        </button>
      )}
    </div>
  )
}
