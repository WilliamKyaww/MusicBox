import { useState } from 'react'
import { fetchChannelPage } from '../api/browse'
import { formatViews, joinMeta, formatSubscribers } from '../format'
import { paths } from '../router'
import {
  cacheKeys,
  readCache,
  uniqueById,
  useCachedResource,
  useMorePages,
} from '../useCachedResource'
import { useVideoActions } from '../videoActions'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { ExternalLinkIcon, PlaylistPlayIcon, VerifiedIcon } from '../components/Icons'
import { LoadMoreSentinel } from '../components/LoadMoreSentinel'
import { StatusPanel } from '../components/StatusPanel'
import { SubscribeButton } from '../components/SubscribeButton'
import { VideoActionsMenu } from '../components/VideoActionsMenu'
import { VideoGrid, VideoGridSkeleton } from '../components/VideoGrid'
import type {
  ChannelInfo,
  ChannelPage as ChannelPageData,
  ChannelTab,
  PlaylistSummary,
  VideoSearchResult,
} from '../types'

type ChannelPageProps = {
  channelRef: string
  tab: ChannelTab
}

const TABS: { id: ChannelTab; label: string; empty: string }[] = [
  { id: 'videos', label: 'Videos', empty: 'This channel has no videos.' },
  { id: 'shorts', label: 'Shorts', empty: 'This channel has no Shorts.' },
  { id: 'live', label: 'Live', empty: 'This channel has no live streams.' },
  { id: 'playlists', label: 'Playlists', empty: 'This channel has no public playlists.' },
]

function ChannelHeader({ channel, channelRef }: { channel: ChannelInfo; channelRef: string }) {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <header className="channel-header">
      {channel.banner_url ? (
        <div
          className="channel-header__banner"
          style={{ backgroundImage: `url("${channel.banner_url.replace(/"/g, '%22')}")` }}
        />
      ) : null}
      <div className="channel-header__main">
        <ChannelAvatar name={channel.name} url={channel.avatar_url} size={160} />
        <div className="channel-header__text">
          <h1>
            {channel.name}
            {channel.is_verified ? <VerifiedIcon className="yt-icon yt-verified" /> : null}
          </h1>
          <p className="channel-header__meta">
            {joinMeta(channel.handle ?? channelRef, formatSubscribers(channel.subscriber_count))}
          </p>
          {channel.description ? (
            <button
              type="button"
              className={`channel-header__about ${showAbout ? 'channel-header__about--open' : ''}`}
              onClick={() => setShowAbout((open) => !open)}
              aria-expanded={showAbout}
            >
              <span>{channel.description}</span>
              {!showAbout ? <strong>…more</strong> : null}
            </button>
          ) : null}
          <div className="channel-header__actions">
            <SubscribeButton
              channelId={channel.id}
              name={channel.name}
              handle={channel.handle}
              avatarUrl={channel.avatar_url}
            />
            <a className="yt-pill" href={channel.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="yt-icon" />
              Open on YouTube
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}

function ShortsGrid({ videos }: { videos: VideoSearchResult[] }) {
  const { setWatchQueue } = useVideoActions()
  return (
    <div className="shorts-grid">
      {videos.map((video) => (
        <article key={video.id} className="short-card">
          <a
            className="short-card__thumb"
            href={paths.watch(video.id)}
            onClick={() => setWatchQueue({ label: 'Shorts', items: videos })}
          >
            <img src={video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </a>
          <div className="short-card__details">
            <div>
              <h3>
                <a
                  href={paths.watch(video.id)}
                  onClick={() => setWatchQueue({ label: 'Shorts', items: videos })}
                >
                  {video.title}
                </a>
              </h3>
              <p>{formatViews(video.view_count)}</p>
            </div>
            <VideoActionsMenu video={video} />
          </div>
        </article>
      ))}
    </div>
  )
}

function PlaylistGrid({ playlists }: { playlists: PlaylistSummary[] }) {
  return (
    <div className="yt-grid">
      {playlists.map((playlist) => (
        <article key={playlist.id} className="yt-card playlist-tile">
          <a className="yt-thumb playlist-tile__thumb" href={paths.playlist(playlist.id)}>
            {playlist.thumbnail_url ? (
              <img src={playlist.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : null}
            <span className="yt-thumb__badge">
              <PlaylistPlayIcon className="yt-icon" />
              {playlist.video_count !== null ? `${playlist.video_count} videos` : 'Playlist'}
            </span>
          </a>
          <div className="yt-card__text">
            <h3 className="yt-card__title">
              <a href={paths.playlist(playlist.id)}>{playlist.title}</a>
            </h3>
            <a className="yt-card__channel" href={paths.playlist(playlist.id)}>
              View full playlist
            </a>
          </div>
        </article>
      ))}
    </div>
  )
}

export function ChannelPage({ channelRef, tab }: ChannelPageProps) {
  const key = cacheKeys.channel(channelRef, tab)
  const first = useCachedResource(key, (signal) => fetchChannelPage(channelRef, tab, 1, signal))
  const more = useMorePages<ChannelPageData>(key)

  // Keep the header up while another tab loads.
  const channel =
    first.data?.channel ??
    TABS.map((entry) => readCache<ChannelPageData>(cacheKeys.channel(channelRef, entry.id)))
      .find(Boolean)?.channel

  const pages = first.data ? [first.data, ...more.pages] : []
  const videos = uniqueById(pages.flatMap((page) => page.videos))
  const playlists = uniqueById(pages.flatMap((page) => page.playlists))
  const lastPage = pages.at(-1)
  const tabInfo = TABS.find((entry) => entry.id === tab) ?? TABS[0]
  const isEmpty = first.data && videos.length === 0 && playlists.length === 0

  if (first.error && !first.data && !channel) {
    return <StatusPanel tone="error" title="This Channel Couldn't Be Loaded" body={first.error} />
  }

  return (
    <div className="channel-page">
      {channel ? (
        <ChannelHeader channel={channel} channelRef={channelRef} />
      ) : (
        <div className="channel-header channel-header--skeleton">
          <span className="yt-avatar shimmer" style={{ width: 160, height: 160 }} />
          <div className="channel-header__text">
            <div className="line shimmer line--medium" />
            <div className="line shimmer line--short" />
          </div>
        </div>
      )}

      <nav className="channel-tabs" aria-label="Channel sections">
        {TABS.map((entry) => (
          <a
            key={entry.id}
            href={paths.channel(channelRef, entry.id)}
            className={entry.id === tab ? 'channel-tabs__tab--active' : undefined}
            aria-current={entry.id === tab ? 'page' : undefined}
          >
            {entry.label}
          </a>
        ))}
      </nav>

      {first.error && !first.data ? (
        <StatusPanel tone="error" title={`Couldn't Load ${tabInfo.label}`} body={first.error} />
      ) : null}
      {first.isLoading && !first.data ? <VideoGridSkeleton /> : null}
      {isEmpty ? <StatusPanel title={tabInfo.label} body={tabInfo.empty} /> : null}

      {tab === 'playlists' ? (
        <PlaylistGrid playlists={playlists} />
      ) : tab === 'shorts' ? (
        <ShortsGrid videos={videos} />
      ) : (
        <VideoGrid
          videos={videos}
          showChannel={false}
          queueLabel={`${channel?.name ?? 'Channel'} · ${tabInfo.label}`}
        />
      )}

      {more.error ? <p className="yt-inline-error">{more.error}</p> : null}
      {lastPage ? (
        <LoadMoreSentinel
          hasMore={lastPage.has_more}
          isLoading={more.isLoading}
          onLoadMore={() =>
            more.load(() => fetchChannelPage(channelRef, tab, lastPage.page + 1))
          }
        />
      ) : null}
    </div>
  )
}
