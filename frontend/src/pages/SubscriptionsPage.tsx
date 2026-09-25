import { fetchSubscriptionFeed } from '../api/browse'
import { useLibrary } from '../library'
import { paths } from '../router'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { StatusPanel } from '../components/StatusPanel'
import { VideoGrid, VideoGridSkeleton } from '../components/VideoGrid'

export function SubscriptionsPage() {
  const subscriptions = useLibrary((state) => state.subscriptions)
  const channelIds = subscriptions.map((entry) => entry.id)
  const feed = useCachedResource(
    channelIds.length > 0 ? cacheKeys.subscriptions(channelIds) : null,
    (signal) => fetchSubscriptionFeed(channelIds, signal),
  )

  if (subscriptions.length === 0) {
    return (
      <StatusPanel
        title="Don't miss new videos"
        body="Subscribe to channels from a video or a channel page and their latest uploads show up here."
      />
    )
  }

  return (
    <div className="subscriptions-page">
      <div className="subscriptions-page__channels">
        {subscriptions.map((channel) => (
          <a key={channel.id} className="subscriptions-page__channel" href={paths.channel(channel.id)}>
            <ChannelAvatar name={channel.name} url={channel.avatarUrl} size={64} />
            <span>{channel.name}</span>
          </a>
        ))}
      </div>

      <h1 className="page-title">Latest</h1>
      {feed.isLoading && !feed.data ? <VideoGridSkeleton /> : null}
      {feed.error ? (
        <StatusPanel tone="error" title="Could not load subscriptions" body={feed.error} />
      ) : null}
      {feed.data ? <VideoGrid videos={feed.data.items} queueLabel="Subscriptions" /> : null}
    </div>
  )
}
