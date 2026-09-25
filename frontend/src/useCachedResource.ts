import { useEffect, useState } from 'react'

/**
 * Tiny request cache for page data.
 *
 * Going back to a page (a channel, search results, the watch page) renders the
 * cached data synchronously, which lets the router restore the scroll position,
 * while a fresh copy is fetched in the background once the entry is stale.
 */

const FRESH_FOR_MS = 5 * 60 * 1000
const MAX_ENTRIES = 80

type Entry = { value: unknown; fetchedAt: number }

const cache = new Map<string, Entry>()

/** Shared keys, so pages that show the same data reuse one request. */
export const cacheKeys = {
  video: (videoId: string) => `video:${videoId}`,
  channel: (channelRef: string, tab: string) => `channel:${channelRef}:${tab}`,
  playlist: (listId: string) => `playlist:${listId}`,
  search: (query: string, filters: object) => `search:${query}:${JSON.stringify(filters)}`,
  trending: () => 'feed:trending',
  subscriptions: (channelIds: string[]) => `feed:subscriptions:${channelIds.join(',')}`,
}

export function readCache<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined
}

export function writeCache<T>(key: string, value: T) {
  cache.delete(key)
  cache.set(key, { value, fetchedAt: Date.now() })
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

export type ResourceState<T> = {
  data: T | undefined
  error: string | null
  isLoading: boolean
}

type StoredState<T> = ResourceState<T> & { key: string | null }

export function useCachedResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ResourceState<T> {
  const [state, setState] = useState<StoredState<T>>(() => ({
    key,
    data: key ? readCache<T>(key) : undefined,
    error: null,
    isLoading: Boolean(key && !cache.has(key)),
  }))

  // A new key starts from whatever the cache already holds for it.
  let current = state
  if (state.key !== key) {
    current = {
      key,
      data: key ? readCache<T>(key) : undefined,
      error: null,
      isLoading: Boolean(key && !cache.has(key)),
    }
    setState(current)
  }

  useEffect(() => {
    if (!key) return
    const entry = cache.get(key)
    if (entry && Date.now() - entry.fetchedAt < FRESH_FOR_MS) return

    const controller = new AbortController()
    fetcher(controller.signal)
      .then((value) => {
        writeCache(key, value)
        setState((previous) =>
          previous.key === key ? { key, data: value, error: null, isLoading: false } : previous,
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Something went wrong.'
        setState((previous) =>
          previous.key === key ? { ...previous, error: message, isLoading: false } : previous,
        )
      })

    return () => controller.abort()
    // The fetcher is recreated on every render; the key alone identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data: current.data, error: current.error, isLoading: current.isLoading }
}

type MorePagesState<TPage> = {
  key: string
  pages: TPage[]
  isLoading: boolean
  error: string | null
}

/** Pages loaded after the first one; they reset whenever `key` changes. */
export function useMorePages<TPage>(key: string) {
  const [state, setState] = useState<MorePagesState<TPage>>(() => ({
    key,
    pages: [],
    isLoading: false,
    error: null,
  }))

  let current = state
  if (state.key !== key) {
    current = { key, pages: [], isLoading: false, error: null }
    setState(current)
  }

  function load(fetchPage: () => Promise<TPage>) {
    if (current.isLoading) return
    setState((previous) => ({ ...previous, isLoading: true, error: null }))
    fetchPage()
      .then((page) =>
        setState((previous) =>
          previous.key === key
            ? { ...previous, pages: [...previous.pages, page], isLoading: false }
            : previous,
        ),
      )
      .catch((error: unknown) =>
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Could not load more.',
              }
            : previous,
        ),
      )
  }

  return { pages: current.pages, isLoading: current.isLoading, error: current.error, load }
}

export function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
