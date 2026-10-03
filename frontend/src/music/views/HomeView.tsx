import { useState, type ReactNode } from 'react'
import { fetchTrending } from '../../api/browse'
import { artistPath, musicPath } from '../../experience'
import { useLibrary } from '../../library'
import { navigate } from '../../router'
import type { VideoSearchResult } from '../../types'
import { cacheKeys, useCachedResource } from '../../useCachedResource'
import { contextPath, playlistVideo, sortedItems } from '../helpers'
import { useMusic, type PlaySource } from '../MusicContext'
import { getPlaybackControls, usePlayback } from '../playback'
import {
  dailyMixes,
  greeting,
  hueFor,
  onRepeat,
  topArtists,
} from '../recommend'
import { useMusicStore, type RecentContext } from '../store'
import { Artwork, Card, Mosaic, PlayButton, Shelf, Skeleton } from '../ui'
import { MixCover } from './CollectionView'

type Chip = 'all' | 'playlists' | 'artists' | 'downloaded'

type Tile = {
  key: string
  title: string
  art: ReactNode
  href: string
  kind: PlaySource['kind']
  id: string
  /** Songs to play straight from the tile; remote contexts open their page instead. */
  tracks?: VideoSearchResult[]
}

export function HomeView() {
  const music = useMusic()
  const store = useMusicStore()
  const history = useLibrary((state) => state.history)
  const subscriptions = useLibrary((state) => state.subscriptions)
  const [chip, setChip] = useState<Chip>('all')
  const trending = useCachedResource(cacheKeys.trending(), fetchTrending)
  const isPlaying = usePlayback((state) => state.isPlaying)
  const playingContext = music.session?.context

  const artists = topArtists(history, store.liked, store.playCounts, 12)
  const mixes = dailyMixes(artists)
  const repeat = onRepeat(history, store.playCounts)
  const downloaded = music.downloads
    .filter((d) => d.status === 'completed' && d.media_kind === 'audio')
    .map(
      (d): VideoSearchResult => ({
        id: d.video_id,
        title: d.title,
        channel_title: d.channel_title,
        thumbnail_url: d.thumbnail_url ?? '',
        video_url: d.source_url,
        duration_label: '',
        channel_id: '',
        description: '',
        duration_iso: '',
        published_at: d.created_at,
      }),
    )

  function contextArt(context: RecentContext): ReactNode {
    if (context.kind === 'liked') return <Artwork liked name={context.title} />
    if (context.kind === 'artist')
      return <Artwork round src={context.imageUrl} name={context.title} icon="artist" />
    if (context.kind === 'playlist') {
      const playlist = music.playlists.find((p) => p.id === context.id)
      if (playlist)
        return (
          <Mosaic
            images={sortedItems(playlist).map((item) => item.thumbnail_url)}
            name={playlist.name}
          />
        )
    }
    if (context.kind === 'mix' || context.kind === 'repeat')
      return <MixCover title={context.title} hue={hueFor(context.id)} image={context.imageUrl} />
    return <Artwork src={context.imageUrl} name={context.title} />
  }

  function localTracks(kind: PlaySource['kind'], id: string) {
    if (kind === 'liked') return store.liked
    if (kind === 'repeat') return repeat
    if (kind === 'downloads') return downloaded
    if (kind === 'playlist') {
      const playlist = music.playlists.find((p) => p.id === id)
      return playlist ? sortedItems(playlist).map(playlistVideo) : undefined
    }
    return undefined
  }

  const contexts = store.recentContexts.filter(
    (c) => c.kind !== 'playlist' || music.playlists.some((p) => p.id === c.id),
  )
  const tiles: Tile[] = []
  const addTile = (tile: Tile) => {
    if (tiles.length < 8 && !tiles.some((t) => t.key === tile.key)) tiles.push(tile)
  }
  addTile({
    key: 'liked:liked',
    title: 'Liked Songs',
    art: <Artwork liked name="Liked Songs" />,
    href: musicPath('liked'),
    kind: 'liked',
    id: 'liked',
    tracks: store.liked,
  })
  for (const context of contexts)
    addTile({
      key: `${context.kind}:${context.id}`,
      title: context.title,
      art: contextArt(context),
      href: contextPath(context.kind, context.id),
      kind: context.kind,
      id: context.id,
      tracks: localTracks(context.kind, context.id),
    })
  for (const playlist of music.playlists)
    addTile({
      key: `playlist:${playlist.id}`,
      title: playlist.name,
      art: (
        <Mosaic
          images={sortedItems(playlist).map((item) => item.thumbnail_url)}
          name={playlist.name}
        />
      ),
      href: musicPath('playlist', playlist.id),
      kind: 'playlist',
      id: playlist.id,
      tracks: sortedItems(playlist).map(playlistVideo),
    })

  function isCurrent(kind: PlaySource['kind'], id: string) {
    return playingContext?.kind === kind && playingContext.id === id
  }
  function playTile(tile: { kind: PlaySource['kind']; id: string; title: string; tracks?: VideoSearchResult[]; href: string }) {
    if (isCurrent(tile.kind, tile.id)) {
      getPlaybackControls()?.toggle()
      return
    }
    if (tile.tracks?.length)
      music.play(tile.tracks, 0, { kind: tile.kind, id: tile.id, title: tile.title })
    else navigate(tile.href)
  }

  const show = (section: Chip) => chip === 'all' || chip === section
  const chips: [Chip, string][] = [
    ['all', 'All'],
    ['playlists', 'Playlists'],
    ['artists', 'Artists'],
    ['downloaded', 'Downloaded'],
  ]

  return (
    <div className="music-page music-page--padded music-home">
      <h1 className="music-greeting">{greeting()}</h1>
      <div className="music-chips" role="group" aria-label="Filter home">
        {chips.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={chip === value}
            className={chip === value ? 'is-active' : ''}
            onClick={() => setChip(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {chip === 'all' ? (
        <div className="music-shortcuts">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className={`music-shortcut ${isCurrent(tile.kind, tile.id) ? 'is-current' : ''}`}
            >
              <a href={tile.href}>
                {tile.art}
                <strong>{tile.title}</strong>
              </a>
              {tile.tracks?.length || !['liked', 'playlist', 'repeat', 'downloads'].includes(tile.kind) ? (
                <PlayButton
                  className="music-shortcut__play"
                  label={`Play ${tile.title}`}
                  playing={isCurrent(tile.kind, tile.id) && isPlaying}
                  onClick={() => playTile(tile)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {show('all') && (mixes.length || repeat.length >= 3) ? (
        <Shelf title="Made for you" subtitle="From your listening on this device">
          {repeat.length >= 3 ? (
            <Card
              title="On Repeat"
              subtitle="Songs you can't stop playing"
              art={<MixCover title="On Repeat" hue={330} image={repeat[0]?.thumbnail_url} />}
              onOpen={() => navigate(musicPath('repeat'))}
              onPlay={() => playTile({ kind: 'repeat', id: 'repeat', title: 'On Repeat', tracks: repeat, href: musicPath('repeat') })}
              playing={isCurrent('repeat', 'repeat') && isPlaying}
            />
          ) : null}
          {mixes.map((mix) => (
            <Card
              key={mix.id}
              title={mix.title}
              subtitle={mix.subtitle}
              art={<MixCover title={mix.title} hue={mix.hue} image={mix.imageUrl} />}
              onOpen={() => navigate(musicPath('mix', mix.query, { title: mix.title }))}
            />
          ))}
        </Shelf>
      ) : null}

      {show('all') && contexts.length ? (
        <Shelf title="Jump back in">
          {contexts.slice(0, 12).map((context) => (
            <Card
              key={`${context.kind}:${context.id}`}
              className={context.kind === 'artist' ? 'music-card--round' : ''}
              title={context.title}
              subtitle={context.subtitle}
              art={contextArt(context)}
              onOpen={() => navigate(contextPath(context.kind, context.id))}
              playing={isCurrent(context.kind, context.id) && isPlaying}
              onPlay={() =>
                playTile({
                  kind: context.kind,
                  id: context.id,
                  title: context.title,
                  tracks: localTracks(context.kind, context.id),
                  href: contextPath(context.kind, context.id),
                })
              }
            />
          ))}
        </Shelf>
      ) : null}

      {show('all') && history.length ? (
        <Shelf title="Recently played" href={musicPath('recent')}>
          {history.slice(0, 12).map((entry, index, all) => (
            <SongCard
              key={entry.video.id}
              video={entry.video}
              onPlay={() =>
                music.play(all.map((h) => h.video), index, {
                  kind: 'recent',
                  id: 'recent',
                  title: 'Recently played',
                })
              }
            />
          ))}
        </Shelf>
      ) : null}

      {show('artists') && (artists.length || subscriptions.length) ? (
        <Shelf title={artists.length ? 'Your top artists' : 'Artists you follow'} href={musicPath('artists')}>
          {(artists.length
            ? artists.map((artist) => ({
                key: artist.name,
                name: artist.name,
                image: artist.imageUrl,
                href: artistPath(artist.channelId, artist.videos[0]?.id ?? ''),
              }))
            : subscriptions.map((s) => ({
                key: s.id,
                name: s.name,
                image: s.avatarUrl ?? '',
                href: musicPath('artist', s.id),
              }))
          ).map((artist) => (
            <Card
              key={artist.key}
              className="music-card--round"
              title={artist.name}
              subtitle="Artist"
              art={<Artwork round src={artist.image} name={artist.name} icon="artist" />}
              onOpen={() => navigate(artist.href)}
            />
          ))}
        </Shelf>
      ) : null}

      {show('playlists') && music.playlists.length ? (
        <Shelf title="Your playlists" href={musicPath('playlists')}>
          {music.playlists.map((playlist) => {
            const tracks = sortedItems(playlist).map(playlistVideo)
            return (
              <Card
                key={playlist.id}
                title={playlist.name}
                subtitle={`${playlist.items.length} songs`}
                art={<Mosaic images={tracks.map((t) => t.thumbnail_url)} name={playlist.name} />}
                onOpen={() => navigate(musicPath('playlist', playlist.id))}
                playing={isCurrent('playlist', playlist.id) && isPlaying}
                onPlay={
                  tracks.length
                    ? () =>
                        playTile({
                          kind: 'playlist',
                          id: playlist.id,
                          title: playlist.name,
                          tracks,
                          href: musicPath('playlist', playlist.id),
                        })
                    : undefined
                }
              />
            )
          })}
        </Shelf>
      ) : null}

      {show('downloaded') && downloaded.length ? (
        <Shelf title="Downloaded" subtitle="Plays even when YouTube is unavailable" href={musicPath('downloads')}>
          {downloaded.slice(0, 12).map((video, index) => (
            <SongCard
              key={video.id}
              video={video}
              onPlay={() =>
                music.play(downloaded, index, { kind: 'downloads', id: 'downloads', title: 'Downloaded' })
              }
            />
          ))}
        </Shelf>
      ) : null}

      {show('all') ? (
        trending.isLoading ? (
          <section className="music-shelf">
            <div className="music-section-heading">
              <h2>Popular right now</h2>
            </div>
            <Skeleton />
          </section>
        ) : trending.data?.items.length ? (
          <Shelf title="Popular right now" subtitle="Trending on YouTube">
            {trending.data.items.slice(0, 12).map((video, index, all) => (
              <SongCard
                key={video.id}
                video={video}
                onPlay={() => music.play(all, index)}
              />
            ))}
          </Shelf>
        ) : trending.error ? (
          <p className="music-notice">{trending.error}</p>
        ) : null
      ) : null}

      {show('downloaded') && chip === 'downloaded' && !downloaded.length ? (
        <p className="music-muted">Songs you download appear here.</p>
      ) : null}
      {chip === 'all' && !history.length && !music.playlists.length ? (
        <p className="music-muted music-home__hint">
          Search for a song to get started. Mixes and recommendations appear as you listen.
        </p>
      ) : null}
    </div>
  )
}

function SongCard({ video, onPlay }: { video: VideoSearchResult; onPlay: () => void }) {
  const music = useMusic()
  const playing = usePlayback((state) => state.videoId === video.id && state.isPlaying)
  return (
    <Card
      title={video.title}
      subtitle={video.channel_title}
      art={<Artwork src={video.thumbnail_url} name={video.title} />}
      onOpen={onPlay}
      onPlay={() => (playing ? getPlaybackControls()?.toggle() : onPlay())}
      playing={playing}
      onContextMenu={(event) => music.openTrackMenu(video, { x: event.clientX, y: event.clientY })}
    />
  )
}
