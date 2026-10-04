import { fetchYouTubePlaylist } from '../../api/browse'
import { artistPath, type MusicRoute } from '../../experience'
import { navigate, paths } from '../../router'
import type { YouTubePlaylistPage } from '../../types'
import { cacheKeys, uniqueById, useCachedResource, useMorePages } from '../../useCachedResource'
import { MusicIcon } from '../MusicIcon'
import { useContextPlayback, useStickyHeader } from '../hooks'
import { useMusic, type PlaySource } from '../MusicContext'
import { getPlaybackControls } from '../playback'
import { formatTotalDuration, hueFor, parseDuration } from '../recommend'
import { isAlbumSaved, toggleSavedAlbum, useMusicStore } from '../store'
import { TrackList } from '../TrackList'
import { Artwork, PlayButton } from '../ui'
import { CollectionHeader } from './CollectionHeader'

/** A YouTube playlist shown the way Spotify shows an album. */
export function AlbumView({ route }: { route: MusicRoute }) {
  const music = useMusic()
  useMusicStore()
  const key = cacheKeys.playlist(route.id)
  const first = useCachedResource(route.id ? key : null, (signal) =>
    fetchYouTubePlaylist(route.id, 1, signal),
  )
  const more = useMorePages<YouTubePlaylistPage>(key)
  const pages = [first.data, ...more.pages].filter(Boolean) as YouTubePlaylistPage[]
  const album = first.data
  const tracks = uniqueById(pages.flatMap((page) => page.items))
  const hasMore = pages.at(-1)?.has_more ?? false
  const hue = hueFor(route.id)
  const context = useContextPlayback('album', route.id)
  const source: PlaySource = {
    kind: 'album',
    id: route.id,
    title: album?.title ?? 'Album',
    imageUrl: album?.thumbnail_url ?? null,
    subtitle: album?.channel_title ?? 'Playlist',
  }
  function playAll(shuffle = false) {
    if (context.current && !shuffle) getPlaybackControls()?.toggle()
    else if (shuffle)
      music.play(tracks, -1, source, { shuffle })
    else music.play(tracks, 0, source)
  }
  useStickyHeader({
    title: album?.title ?? '',
    hue,
    playing: context.playing,
    onPlay: tracks.length ? () => playAll() : undefined,
  })

  if (first.error)
    return (
      <div className="music-empty">
        <MusicIcon name="album" />
        <h3>Couldn't Load This Playlist</h3>
        <p>{first.error}</p>
      </div>
    )
  if (!album)
    return (
      <p className="music-muted" role="status">
        Loading...
      </p>
    )

  const saved = isAlbumSaved(album.id)
  const total = tracks.reduce((sum, video) => sum + parseDuration(video.duration_label), 0)
  return (
    <div className="music-page">
      <CollectionHeader
        art={<Artwork src={album.thumbnail_url} name={album.title} icon="album" />}
        type="Playlist from YouTube"
        title={album.title}
        description={album.description ? album.description.slice(0, 220) : undefined}
        hue={hue}
        meta={
          <>
            {album.channel_title ? (
              <button
                type="button"
                className="music-link"
                onClick={() => navigate(artistPath(album.channel_id ?? '', tracks[0]?.id ?? ''))}
              >
                {album.channel_title}
              </button>
            ) : null}
            {album.video_count ? <> &middot; {album.video_count} songs</> : null}
            {total ? <span>, {formatTotalDuration(total)}</span> : null}
          </>
        }
      />
      <div className="music-actionbar">
        <PlayButton
          className="music-round-play--large"
          label={`Play ${album.title}`}
          playing={context.playing}
          disabled={!tracks.length}
          onClick={() => playAll()}
        />
        <button
          type="button"
          className={`music-icon-button music-icon-button--large ${context.shuffled ? 'is-green' : ''}`}
          aria-label={`Shuffle play ${album.title}`}
          aria-pressed={context.shuffled}
          disabled={!tracks.length}
          onClick={() =>
            context.current ? getPlaybackControls()?.toggleShuffle() : playAll(true)
          }
        >
          <MusicIcon name="shuffle" />
        </button>
        <button
          type="button"
          className={`music-icon-button music-icon-button--large music-like ${saved ? 'is-liked' : ''}`}
          aria-label={saved ? 'Remove from Your Library' : 'Save to Your Library'}
          aria-pressed={saved}
          onClick={() => {
            const added = toggleSavedAlbum({
              id: album.id,
              title: album.title,
              channelTitle: album.channel_title ?? '',
              channelId: album.channel_id ?? '',
              thumbnailUrl: album.thumbnail_url,
            })
            music.toast(added ? 'Saved to Your Library.' : 'Removed from Your Library.')
          }}
        >
          <MusicIcon name={saved ? 'check-circle' : 'plus-circle'} />
        </button>
        <button
          type="button"
          className="music-icon-button music-icon-button--large"
          aria-label={`More options for ${album.title}`}
          aria-haspopup="menu"
          onClick={(event) =>
            music.openMenu(
              [
                { label: 'Add to queue', icon: 'queue', onSelect: () => music.enqueueMany(tracks) },
                { kind: 'separator' },
                {
                  label: 'Open in Video view',
                  icon: 'video',
                  onSelect: () => navigate(paths.playlist(album.id)),
                },
              ],
              event.currentTarget.getBoundingClientRect(),
              `${album.title} options`,
            )
          }
        >
          <MusicIcon name="more" />
        </button>
      </div>
      <TrackList
        tracks={tracks}
        source={source}
        columns={['plays']}
        plays={(video) => video.view_count}
        empty={<p className="music-muted">This playlist is empty.</p>}
      />
      {hasMore ? (
        <button
          type="button"
          className="music-button"
          disabled={more.isLoading}
          onClick={() =>
            more.load(() => fetchYouTubePlaylist(route.id, pages.length + 1))
          }
        >
          {more.isLoading ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
      {more.error ? <p className="music-notice">{more.error}</p> : null}
    </div>
  )
}
