import { fetchYouTubePlaylist } from '../api/browse'
import { formatViews, joinMeta } from '../format'
import { paths } from '../router'
import { cacheKeys, uniqueById, useCachedResource, useMorePages } from '../useCachedResource'
import { useVideoActions } from '../videoActions'
import { DownloadIcon, ExternalLinkIcon, PlayIcon } from '../components/Icons'
import { LoadMoreSentinel } from '../components/LoadMoreSentinel'
import { StatusPanel } from '../components/StatusPanel'
import { VideoListItem } from '../components/VideoListItem'
import type { YouTubePlaylistPage } from '../types'

export function PlaylistPage({ listId }: { listId: string }) {
  const actions = useVideoActions()
  const key = cacheKeys.playlist(listId)
  const first = useCachedResource(key, (signal) => fetchYouTubePlaylist(listId, 1, signal))
  const more = useMorePages<YouTubePlaylistPage>(key)

  if (first.error && !first.data) {
    return <StatusPanel tone="error" title="This Playlist Couldn't Be Loaded" body={first.error} />
  }

  const playlist = first.data
  const pages = playlist ? [playlist, ...more.pages] : []
  const items = uniqueById(pages.flatMap((page) => page.items))
  const lastPage = pages.at(-1)
  const playlistUrl = `https://www.youtube.com/playlist?list=${listId}`

  return (
    <div className="playlist-page">
      <aside className="playlist-hero">
        {playlist ? (
          <>
            <div className="playlist-hero__backdrop">
              {playlist.thumbnail_url ? (
                <img src={playlist.thumbnail_url} alt="" referrerPolicy="no-referrer" />
              ) : null}
            </div>
            <div className="playlist-hero__content">
              {playlist.thumbnail_url ? (
                <img
                  className="playlist-hero__thumb"
                  src={playlist.thumbnail_url}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <h1>{playlist.title}</h1>
              {playlist.channel_title ? (
                playlist.channel_id ? (
                  <a className="playlist-hero__channel" href={paths.channel(playlist.channel_id)}>
                    {playlist.channel_title}
                  </a>
                ) : (
                  <p className="playlist-hero__channel">{playlist.channel_title}</p>
                )
              ) : null}
              <p className="playlist-hero__meta">
                {joinMeta(
                  playlist.video_count !== null ? `${playlist.video_count} videos` : null,
                  formatViews(playlist.view_count),
                )}
              </p>
              {playlist.description ? (
                <p className="playlist-hero__description">{playlist.description}</p>
              ) : null}
              <div className="playlist-hero__actions">
                {items[0] ? (
                  <a
                    className="yt-pill yt-pill--light"
                    href={paths.watch(items[0].id, { listId })}
                  >
                    <PlayIcon className="yt-icon" />
                    Play all
                  </a>
                ) : null}
                <button
                  type="button"
                  className="yt-pill yt-pill--glass"
                  disabled={actions.isExportingYouTubePlaylist}
                  onClick={() => actions.exportYouTubePlaylist(playlistUrl, 'zip')}
                  title="Download every video as MP3 files in a ZIP"
                >
                  <DownloadIcon className="yt-icon" />
                  ZIP of MP3s
                </button>
                <button
                  type="button"
                  className="yt-pill yt-pill--glass"
                  disabled={actions.isExportingYouTubePlaylist}
                  onClick={() => actions.exportYouTubePlaylist(playlistUrl, 'combined_mp3')}
                  title="Join the whole playlist into one MP3"
                >
                  <DownloadIcon className="yt-icon" />
                  One combined MP3
                </button>
                <a className="yt-pill yt-pill--glass" href={playlistUrl} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="yt-icon" />
                  YouTube
                </a>
              </div>
            </div>
          </>
        ) : (
          <div className="playlist-hero__content">
            <div className="yt-thumb shimmer" />
            <div className="line shimmer line--medium" />
          </div>
        )}
      </aside>

      <div className="playlist-page__items">
        {items.map((video, index) => (
          <VideoListItem
            key={video.id}
            video={video}
            variant="compact"
            listId={listId}
            index={index + 1}
          />
        ))}
        {more.error ? <p className="yt-inline-error">{more.error}</p> : null}
        {lastPage ? (
          <LoadMoreSentinel
            hasMore={lastPage.has_more}
            isLoading={more.isLoading}
            onLoadMore={() => more.load(() => fetchYouTubePlaylist(listId, lastPage.page + 1))}
          />
        ) : null}
      </div>
    </div>
  )
}
