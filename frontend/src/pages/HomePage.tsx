import { fetchSubscriptionFeed, fetchTrending } from '../api/browse'
import { getResumePosition, useLibrary } from '../library'
import { paths } from '../router'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { StatusPanel } from '../components/StatusPanel'
import { VideoGrid, VideoGridSkeleton } from '../components/VideoGrid'

const CONTINUE_WATCHING_LIMIT = 4
const SUBSCRIPTION_PREVIEW_LIMIT = 8

export function HomePage() {
  const subscriptions = useLibrary((state) => state.subscriptions)
  const history = useLibrary((state) => state.history)
  // Re-render when resume positions change so finished videos drop out.
  useLibrary((state) => state.progress)

  const channelIds = subscriptions.map((entry) => entry.id)
  const trending = useCachedResource(cacheKeys.trending(), (signal) => fetchTrending(signal))
  const subscriptionFeed = useCachedResource(
    channelIds.length > 0 ? cacheKeys.subscriptions(channelIds) : null,
    (signal) => fetchSubscriptionFeed(channelIds, signal),
  )

  const continueWatching = history
    .filter((entry) => getResumePosition(entry.video.id) !== null)
    .slice(0, CONTINUE_WATCHING_LIMIT)
    .map((entry) => entry.video)
  const latest = (subscriptionFeed.data?.items ?? []).slice(0, SUBSCRIPTION_PREVIEW_LIMIT)

  return (
    <div className="home-page">
      {continueWatching.length > 0 ? (
        <section className="home-section">
          <header className="home-section__header">
            <h2>Continue Watching</h2>
            <a href={paths.history()}>History</a>
          </header>
          <VideoGrid videos={continueWatching} queueLabel="Continue Watching" />
        </section>
      ) : null}

      {channelIds.length > 0 ? (
        <section className="home-section">
          <header className="home-section__header">
            <h2>Latest from Your Subscriptions</h2>
            <a href={paths.subscriptions()}>View all</a>
          </header>
          {subscriptionFeed.isLoading && !subscriptionFeed.data ? (
            <VideoGridSkeleton count={SUBSCRIPTION_PREVIEW_LIMIT} />
          ) : (
            <VideoGrid videos={latest} queueLabel="Subscriptions" />
          )}
        </section>
      ) : null}

      <section className="home-section">
        <header className="home-section__header">
          <h2>Trending</h2>
        </header>
        {trending.isLoading && !trending.data ? <VideoGridSkeleton /> : null}
        {trending.error ? (
          <StatusPanel tone="error" title="Trending Couldn't Load" body={trending.error} />
        ) : null}
        {trending.data && !trending.data.available ? (
          <StatusPanel
            title="Search to Get Started"
            body={
              trending.data.message ??
              'Trending videos need a YouTube API key. Channels and videos still work.'
            }
          />
        ) : null}
        {trending.data?.available ? (
          <VideoGrid videos={trending.data.items} queueLabel="Trending" />
        ) : null}
      </section>
    </div>
  )
}
