import { useState } from 'react'
import { searchVideos } from '../api/search'
import { formatSubscribers, joinMeta } from '../format'
import { paths } from '../router'
import { cacheKeys, uniqueById, useCachedResource, useMorePages } from '../useCachedResource'
import { useVideoActions } from '../videoActions'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { FilterIcon } from '../components/Icons'
import { LoadMoreSentinel } from '../components/LoadMoreSentinel'
import { StatusPanel } from '../components/StatusPanel'
import { SubscribeButton } from '../components/SubscribeButton'
import { VideoListItem } from '../components/VideoListItem'
import type { ChannelSearchResult, SearchFilters, SearchResponse } from '../types'

type SearchPageProps = {
  query: string
  filters: SearchFilters
}

const FILTER_GROUPS: {
  title: string
  field: keyof SearchFilters
  options: { value: string; label: string }[]
}[] = [
  {
    title: 'Upload date',
    field: 'uploadDate',
    options: [
      { value: 'any', label: 'Any time' },
      { value: 'hour', label: 'Last hour' },
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'month', label: 'This month' },
      { value: 'year', label: 'This year' },
    ],
  },
  {
    title: 'Duration',
    field: 'duration',
    options: [
      { value: 'any', label: 'Any length' },
      { value: 'short', label: 'Under 4 minutes' },
      { value: 'medium', label: '4 - 20 minutes' },
      { value: 'long', label: 'Over 20 minutes' },
    ],
  },
  {
    title: 'Sort by',
    field: 'order',
    options: [
      { value: 'relevance', label: 'Relevance' },
      { value: 'date', label: 'Upload date' },
      { value: 'viewCount', label: 'View count' },
      { value: 'rating', label: 'Rating' },
    ],
  },
]

function ChannelResult({ channel }: { channel: ChannelSearchResult }) {
  const href = paths.channel(channel.id)
  return (
    <article className="channel-result">
      <div className="channel-result__avatar">
        <ChannelAvatar name={channel.title} url={channel.thumbnail_url} size={136} href={href} />
      </div>
      <div className="channel-result__text">
        <h3>
          <a href={href}>{channel.title}</a>
        </h3>
        <p className="channel-result__meta">
          {joinMeta(
            channel.handle,
            formatSubscribers(channel.subscriber_count),
            channel.video_count !== null ? `${channel.video_count.toLocaleString('en')} videos` : null,
          )}
        </p>
        {channel.description ? (
          <p className="channel-result__description">{channel.description}</p>
        ) : null}
      </div>
      <SubscribeButton
        channelId={channel.id}
        name={channel.title}
        handle={channel.handle}
        avatarUrl={channel.thumbnail_url}
      />
    </article>
  )
}

export function SearchPage({ query, filters }: SearchPageProps) {
  const { setWatchQueue } = useVideoActions()
  const key = cacheKeys.search(query, filters)
  const first = useCachedResource(key, (signal) => searchVideos(query, signal, { filters }))
  const more = useMorePages<SearchResponse>(key)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const pages = first.data ? [first.data, ...more.pages] : []
  const videos = uniqueById(pages.flatMap((page) => page.items))
  const channels = first.data?.channels ?? []
  const nextPageToken = pages.at(-1)?.next_page_token ?? null
  const activeFilterCount = [
    filters.order !== 'relevance',
    filters.duration !== 'any',
    filters.uploadDate !== 'any',
  ].filter(Boolean).length

  return (
    <div className="search-page">
      <div className="search-page__toolbar">
        <button
          type="button"
          className={`yt-chip ${filtersOpen ? 'yt-chip--active' : ''}`}
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
        >
          <FilterIcon className="yt-icon" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {filtersOpen ? (
        <div className="search-filters">
          {FILTER_GROUPS.map((group) => (
            <div key={group.field} className="search-filters__group">
              <h3>{group.title}</h3>
              {group.options.map((option) => {
                const active = filters[group.field] === option.value
                return (
                  <a
                    key={option.value}
                    className={active ? 'search-filters__option--active' : undefined}
                    href={paths.results(query, { ...filters, [group.field]: option.value })}
                    aria-current={active ? 'true' : undefined}
                  >
                    {option.label}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}

      {first.error && !first.data ? (
        <StatusPanel tone="error" title="Search could not complete" body={first.error} />
      ) : null}

      {first.isLoading && !first.data ? (
        <div className="search-page__results" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="yt-row yt-row--large yt-row--skeleton">
              <div className="yt-thumb shimmer" />
              <div className="yt-row__text">
                <div className="line shimmer line--wide" />
                <div className="line shimmer line--medium" />
                <div className="line shimmer line--short" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {first.data && videos.length === 0 && channels.length === 0 ? (
        <StatusPanel title="No results found" body="Try different keywords or remove search filters." />
      ) : null}

      <div className="search-page__results">
        {channels.map((channel) => (
          <ChannelResult key={channel.id} channel={channel} />
        ))}
        {videos.map((video) => (
          <VideoListItem
            key={video.id}
            video={video}
            onOpen={() => setWatchQueue({ label: `Results for "${query}"`, items: videos })}
          />
        ))}
      </div>

      {more.error ? <p className="yt-inline-error">{more.error}</p> : null}
      {first.data ? (
        <LoadMoreSentinel
          hasMore={Boolean(nextPageToken)}
          isLoading={more.isLoading}
          onLoadMore={() => {
            if (nextPageToken) {
              more.load(() => searchVideos(query, undefined, { filters, pageToken: nextPageToken }))
            }
          }}
        />
      ) : null}
    </div>
  )
}
