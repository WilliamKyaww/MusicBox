import { useEffect, useState } from 'react'
import { fetchChannelPage, fetchVideoDetails } from '../../api/browse'
import { musicPath, type MusicRoute } from '../../experience'
import { toggleSubscription, useLibrary } from '../../library'
import { navigate, paths } from '../../router'
import { cacheKeys, useCachedResource } from '../../useCachedResource'
import { MusicIcon } from '../MusicIcon'
import { useContextPlayback, useStickyHeader } from '../hooks'
import { useMusic, type PlaySource } from '../MusicContext'
import { getPlaybackControls } from '../playback'
import { formatCount, hueFor, radioCandidates } from '../recommend'
import { togglePinned, useMusicStore } from '../store'
import { TrackList } from '../TrackList'
import { hueStyle } from '../helpers'
import { Artwork, Card, PlayButton, Shelf, Skeleton } from '../ui'
import { CollectionHeader } from './CollectionHeader'

export function ArtistView({ route }: { route: MusicRoute }) {
  const music = useMusic()
  const store = useMusicStore()
  const [expanded, setExpanded] = useState(false)
  const lookup = useCachedResource(
    !route.id && route.video ? cacheKeys.video(route.video) : null,
    (signal) => fetchVideoDetails(route.video, signal),
  )
  useEffect(() => {
    const channelId = lookup.data?.channel_id
    if (!route.id && channelId)
      navigate(musicPath('artist', channelId), { replace: true })
  }, [lookup.data?.channel_id, route.id])

  const ref = route.id
  const page = useCachedResource(ref ? cacheKeys.channel(ref, 'videos') : null, (signal) =>
    fetchChannelPage(ref, 'videos', 1, signal),
  )
  const lists = useCachedResource(
    ref ? cacheKeys.channel(ref, 'playlists') : null,
    (signal) => fetchChannelPage(ref, 'playlists', 1, signal),
  )
  const channel = page.data?.channel
  const following = useLibrary((state) =>
    Boolean(channel && state.subscriptions.some((s) => s.id === channel.id)),
  )
  const uploads = page.data?.videos ?? []
  const popular = radioCandidates(
    [...uploads].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)),
    new Set(),
    10,
  )
  const latest = radioCandidates(uploads, new Set(), 12)
  const name = channel?.name ?? lookup.data?.channel_title ?? 'Artist'
  const hue = hueFor(name)
  const context = useContextPlayback('artist', channel?.id ?? '')
  const source: PlaySource = {
    kind: 'artist',
    id: channel?.id ?? ref,
    title: name,
    imageUrl: channel?.avatar_url ?? null,
    subtitle: 'Artist',
  }
  function playPopular(shuffle = false) {
    if (context.current && !shuffle) getPlaybackControls()?.toggle()
    else if (shuffle)
      music.play(popular, -1, source, { shuffle })
    else music.play(popular, 0, source)
  }
  useStickyHeader({
    title: name,
    hue,
    playing: context.playing,
    onPlay: popular.length ? () => playPopular() : undefined,
  })

  const error = page.error ?? lookup.error
  if (error)
    return (
      <div className="music-empty">
        <MusicIcon name="artist" />
        <h3>Couldn't load this artist</h3>
        <p>{error}</p>
      </div>
    )
  if (!channel)
    return (
      <div className="music-page" aria-busy="true">
        <div className="music-artist-hero music-artist-hero--loading" style={hueStyle(hue)} />
        <p className="music-muted" role="status">
          Loading artist...
        </p>
        <Skeleton />
      </div>
    )

  const pinKey = `artist:${channel.id}`
  return (
    <div className="music-page">
      {channel.banner_url ? (
        <header
          className="music-artist-hero"
          style={{ ...hueStyle(hue), backgroundImage: `url("${channel.banner_url}")` }}
        >
          <div>
            {channel.is_verified ? (
              <span className="music-verified">
                <MusicIcon name="verified" /> Verified Artist
              </span>
            ) : null}
            <h1>{channel.name}</h1>
            {channel.subscriber_count !== null ? (
              <p>{formatCount(channel.subscriber_count)} followers</p>
            ) : null}
          </div>
        </header>
      ) : (
        <CollectionHeader
          round
          art={<Artwork round src={channel.avatar_url} name={channel.name} icon="artist" />}
          type={channel.is_verified ? 'Verified Artist' : 'Artist'}
          title={channel.name}
          hue={hue}
          meta={
            channel.subscriber_count !== null
              ? `${formatCount(channel.subscriber_count)} followers`
              : undefined
          }
        />
      )}
      <div className="music-actionbar">
        <PlayButton
          className="music-round-play--large"
          label={`Play ${channel.name}`}
          playing={context.playing}
          disabled={!popular.length}
          onClick={() => playPopular()}
        />
        <button
          type="button"
          className={`music-icon-button music-icon-button--large ${context.shuffled ? 'is-green' : ''}`}
          aria-label={`Shuffle play ${channel.name}`}
          aria-pressed={context.shuffled}
          disabled={!popular.length}
          onClick={() =>
            context.current ? getPlaybackControls()?.toggleShuffle() : playPopular(true)
          }
        >
          <MusicIcon name="shuffle" />
        </button>
        <button
          type="button"
          className="music-button"
          aria-pressed={following}
          onClick={() => {
            const followed = toggleSubscription({
              id: channel.id,
              name: channel.name,
              handle: channel.handle,
              avatarUrl: channel.avatar_url,
            })
            music.toast(followed ? `Following ${channel.name}.` : `Unfollowed ${channel.name}.`)
          }}
        >
          {following ? 'Following' : 'Follow'}
        </button>
        <button
          type="button"
          className="music-icon-button music-icon-button--large"
          aria-label={`More options for ${channel.name}`}
          aria-haspopup="menu"
          onClick={(event) =>
            music.openMenu(
              [
                {
                  label: 'Go to artist radio',
                  icon: 'radio',
                  onSelect: () =>
                    navigate(musicPath('mix', channel.name, { title: `${channel.name} Radio` })),
                },
                ...(following
                  ? [
                      {
                        label: store.pinned.includes(pinKey) ? 'Unpin artist' : 'Pin artist',
                        icon: 'pin' as const,
                        onSelect: () => togglePinned(pinKey),
                      },
                    ]
                  : []),
                { kind: 'separator' },
                {
                  label: 'Copy link to artist',
                  icon: 'link',
                  onSelect: () =>
                    void navigator.clipboard
                      .writeText(channel.url)
                      .then(() => music.toast('Link copied to clipboard.'))
                      .catch(() => music.toast('Could not copy the link.')),
                },
                {
                  label: 'Open channel in Video view',
                  icon: 'video',
                  onSelect: () => navigate(paths.channel(channel.id)),
                },
              ],
              event.currentTarget.getBoundingClientRect(),
              `${channel.name} options`,
            )
          }
        >
          <MusicIcon name="more" />
        </button>
      </div>

      <section className="music-section">
        <h2>Popular</h2>
        <TrackList
          tracks={popular.slice(0, expanded ? 10 : 5)}
          source={source}
          columns={['plays']}
          plays={(video) => video.view_count}
          label="Popular songs"
          empty={<p className="music-muted">No songs on this channel yet.</p>}
        />
        {popular.length > 5 ? (
          <button type="button" className="music-text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'See more'}
          </button>
        ) : null}
      </section>

      {lists.data?.playlists.length ? (
        <Shelf title="Discography" subtitle="Albums and playlists">
          {lists.data.playlists.map((list) => (
            <Card
              key={list.id}
              title={list.title}
              subtitle={list.video_count ? `${list.video_count} songs` : 'Playlist'}
              art={<Artwork src={list.thumbnail_url} name={list.title} icon="album" />}
              onOpen={() => navigate(musicPath('album', list.id))}
            />
          ))}
        </Shelf>
      ) : lists.isLoading ? (
        <Skeleton />
      ) : null}

      {latest.length ? (
        <Shelf title="Latest uploads">
          {latest.map((video, index) => (
            <Card
              key={video.id}
              title={video.title}
              subtitle={video.published_at ? new Date(video.published_at).getFullYear() : 'Single'}
              art={<Artwork src={video.thumbnail_url} name={video.title} />}
              onOpen={() => music.play(latest, index, source)}
              onPlay={() => music.play(latest, index, source)}
              onContextMenu={(event) =>
                music.openTrackMenu(video, { x: event.clientX, y: event.clientY })
              }
            />
          ))}
        </Shelf>
      ) : null}

      <section className="music-section">
        <h2>About</h2>
        <div
          className="music-about"
          style={channel.banner_url ? { backgroundImage: `url("${channel.banner_url}")` } : hueStyle(hue)}
        >
          <Artwork round src={channel.avatar_url} name={channel.name} icon="artist" />
          <div>
            {channel.subscriber_count !== null ? (
              <strong>{formatCount(channel.subscriber_count)} followers</strong>
            ) : null}
            <p>{channel.description || `${channel.name} on YouTube.`}</p>
            {channel.handle ? <small>{channel.handle}</small> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
