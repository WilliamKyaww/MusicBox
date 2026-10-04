import { fetchSubscriptionFeed } from '../api/browse'
import { useLibrary } from '../library'
import { paths } from '../router'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { SubscriptionsIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { StatusPanel } from '../components/StatusPanel'
import { VideoGrid, VideoGridSkeleton } from '../components/VideoGrid'

export function SubscriptionsPage() {
  const subscriptions = useLibrary((state) => state.subscriptions)
  const channelIds = subscriptions.map((entry) => entry.id)
  const feed = useCachedResource(
    channelIds.length > 0 ? cacheKeys.subscriptions(channelIds) : null,
    (signal) => fetchSubscriptionFeed(channelIds, signal),
  )

  return (
    <div className="library-view">
      <PageHeader
        title="Subscriptions"
        subtitle={
          subscriptions.length
            ? `${subscriptions.length} channel${subscriptions.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        {subscriptions.length ? (
          <div className="subscriptions-page__channels">
            {subscriptions.map((channel) => (
              <a key={channel.id} className="subscriptions-page__channel" href={paths.channel(channel.id)}>
                <ChannelAvatar name={channel.name} url={channel.avatarUrl} size={48} />
                <span>{channel.name}</span>
              </a>
            ))}
          </div>
        ) : null}
      </PageHeader>

      {subscriptions.length === 0 ? (
        <div className="empty-state">
          <SubscriptionsIcon className="yt-icon" />
          <h2>Don't Miss New Videos</h2>
          <p>Subscribe to channels from a video or channel page and their latest uploads show up here.</p>
        </div>
      ) : (
        <section className="home-section">
          <header className="home-section__header">
            <h2>Latest</h2>
          </header>
          {feed.isLoading && !feed.data ? <VideoGridSkeleton /> : null}
          {feed.error ? (
            <StatusPanel tone="error" title="Couldn't Load Subscriptions" body={feed.error} />
          ) : null}
          {feed.data ? <VideoGrid videos={feed.data.items} queueLabel="Subscriptions" /> : null}
        </section>
      )}
    </div>
  )
}
