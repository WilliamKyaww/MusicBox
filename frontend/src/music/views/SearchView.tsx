import { useDeferredValue, useEffect, useState } from 'react'
import { searchVideos } from '../../api/search'
import { musicPath, type MusicRoute } from '../../experience'
import { navigate } from '../../router'
import type { ChannelSearchResult, SearchResponse, VideoSearchResult } from '../../types'
import { uniqueById, useCachedResource, useMorePages } from '../../useCachedResource'
import { MusicIcon } from '../MusicIcon'
import { useMusic, type PlaySource } from '../MusicContext'
import { formatCount, hueFor } from '../recommend'
import {
  addRecentSearch,
  removeRecentSearch,
  updateMusicState,
  useMusicStore,
} from '../store'
import { ArtistLink, TrackList } from '../TrackList'
import { hueStyle } from '../helpers'
import { useIsPlaying } from '../hooks'
import { Artwork, Card, PlayButton } from '../ui'

const CATEGORIES: [string, string, number][] = [
  ['Pop', 'pop hits official audio', 330],
  ['Hip-Hop', 'hip hop official audio', 25],
  ['Rock', 'rock songs official audio', 0],
  ['Dance/Electronic', 'electronic dance music official audio', 275],
  ['Indie', 'indie official audio', 145],
  ['R&B', 'r&b official audio', 300],
  ['Chill', 'chill lofi official audio', 190],
  ['Focus', 'instrumental focus music', 210],
  ['Workout', 'workout music official audio', 15],
  ['Jazz', 'jazz music', 45],
  ['Classical', 'classical music', 60],
  ['Latin', 'latin hits official audio', 350],
  ['K-pop', 'kpop official audio', 320],
  ['Soundtracks', 'film and game soundtrack music', 235],
  ['Sleep', 'sleep music ambient', 250],
  ['Live music', 'live music performance', 160],
]

type Tab = 'all' | 'songs' | 'artists'

function normalize(text: string) {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function SearchView({ route }: { route: MusicRoute }) {
  const store = useMusicStore()
  if (!route.query)
    return (
      <div className="music-page music-page--padded">
        {store.recentSearches.length ? (
          <section className="music-section">
            <div className="music-section-heading">
              <h2>Recent searches</h2>
              <button
                type="button"
                className="music-text-button"
                onClick={() => updateMusicState({ recentSearches: [] })}
              >
                Clear recent searches
              </button>
            </div>
            <div className="music-recent-searches">
              {store.recentSearches.map((query) => (
                <span key={query} className="music-recent-search">
                  <a href={musicPath('search', query)}>
                    <MusicIcon name="clock" />
                    {query}
                  </a>
                  <button
                    type="button"
                    className="music-icon-button"
                    aria-label={`Remove ${query} from recent searches`}
                    onClick={() => removeRecentSearch(query)}
                  >
                    <MusicIcon name="close" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        ) : null}
        <h2 className="music-browse-title">Browse all</h2>
        <div className="music-browse">
          {CATEGORIES.map(([name, query, hue]) => (
            <button
              key={name}
              type="button"
              style={hueStyle(hue)}
              onClick={() => navigate(musicPath('mix', query, { title: name }))}
            >
              <strong>{name}</strong>
              <MusicIcon name="music" />
            </button>
          ))}
        </div>
      </div>
    )
  return <Results query={route.query} />
}

function Results({ query }: { query: string }) {
  const [tab, setTab] = useState<Tab>('all')
  const [filter, setFilter] = useState('')
  const songFilter = useDeferredValue(filter).trim().toLocaleLowerCase()
  const key = `music-search:${query}`
  const search = useCachedResource(key, (signal) => searchVideos(query, signal))
  const more = useMorePages<SearchResponse>(key)
  useEffect(() => {
    if (search.data) addRecentSearch(query)
  }, [search.data, query])

  const songs = uniqueById([search.data, ...more.pages].flatMap((page) => page?.items ?? []))
    .filter((video) => !video.is_short)
  const channels = search.data?.channels ?? []
  const nextToken = (more.pages.at(-1) ?? search.data)?.next_page_token ?? null
  const source: PlaySource = { kind: 'search', id: query, title: `Search: ${query}` }
  const topArtist =
    channels[0] &&
    (normalize(channels[0].title).includes(normalize(query)) ||
      normalize(query).includes(normalize(channels[0].title)))
      ? channels[0]
      : null

  const tabs: [Tab, string][] = [
    ['all', 'All'],
    ['songs', 'Songs'],
    ['artists', 'Artists'],
  ]
  return (
    <div className="music-page music-page--padded">
      <h1 className="music-search-title">Results for "{query}"</h1>
      <div className="music-chips" role="group" aria-label="Result type">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            className={tab === value ? 'is-active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {search.isLoading ? (
        <p className="music-muted" role="status">
          Searching...
        </p>
      ) : null}
      {search.error ? (
        <p className="music-notice" role="alert">
          {search.error}
        </p>
      ) : null}
      {search.data && !songs.length && !channels.length ? (
        <div className="music-empty">
          <h3>No results found for "{query}"</h3>
          <p>Please make sure your words are spelled correctly, or use fewer or different keywords.</p>
        </div>
      ) : null}

      {tab === 'all' && songs.length ? (
        <>
          <div className="music-search-top">
            <section>
              <h2>Top result</h2>
              {topArtist ? (
                <TopArtist channel={topArtist} />
              ) : (
                <TopSong video={songs[0]} songs={songs} source={source} />
              )}
            </section>
            <section>
              <h2>Songs</h2>
              <TrackList tracks={songs.slice(0, 4)} source={source} label="Top songs" />
            </section>
          </div>
          {channels.length ? <ArtistCards channels={channels} title="Artists" /> : null}
        </>
      ) : null}

      {tab === 'songs' ? (
        <>
          <div className="music-actionbar music-actionbar--compact">
            <label className={`music-filter ${filter ? 'has-value' : ''}`}>
              <MusicIcon name="search" />
              <input
                type="search"
                aria-label="Filter songs"
                placeholder="Filter these songs"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          </div>
          <TrackList
            tracks={songs.filter((video) =>
              `${video.title} ${video.channel_title}`.toLocaleLowerCase().includes(songFilter),
            )}
            source={source}
          />
          {nextToken ? (
            <button
              type="button"
              className="music-button"
              disabled={more.isLoading}
              onClick={() =>
                more.load(() => searchVideos(query, undefined, { pageToken: nextToken }))
              }
            >
              {more.isLoading ? 'Loading...' : 'Load more songs'}
            </button>
          ) : null}
          {more.error ? <p role="alert">{more.error}</p> : null}
        </>
      ) : null}

      {tab === 'artists' ? (
        channels.length ? (
          <ArtistCards channels={channels} title="Artists" grid />
        ) : (
          <p className="music-muted">No artists matched "{query}".</p>
        )
      ) : null}
    </div>
  )
}

function TopArtist({ channel }: { channel: ChannelSearchResult }) {
  return (
    <button
      type="button"
      className="music-top-result"
      onClick={() => navigate(musicPath('artist', channel.id))}
    >
      <Artwork round src={channel.thumbnail_url} name={channel.title} icon="artist" />
      <strong>{channel.title}</strong>
      <span>
        <em>Artist</em>
        {channel.subscriber_count ? ` ${formatCount(channel.subscriber_count)} followers` : ''}
      </span>
    </button>
  )
}

function TopSong({
  video,
  songs,
  source,
}: {
  video: VideoSearchResult
  songs: VideoSearchResult[]
  source: PlaySource
}) {
  const music = useMusic()
  const playing = useIsPlaying(video.id)
  return (
    <div className="music-top-result" onDoubleClick={() => music.play(songs, 0, source)}>
      <Artwork src={video.thumbnail_url} name={video.title} />
      <strong>{video.title}</strong>
      <span>
        <em>Song</em> <ArtistLink video={video} />
      </span>
      <PlayButton
        className="music-top-result__play"
        label={`Play ${video.title}`}
        playing={playing}
        onClick={() => music.play(songs, 0, source)}
      />
    </div>
  )
}

function ArtistCards({
  channels,
  title,
  grid = false,
}: {
  channels: ChannelSearchResult[]
  title: string
  grid?: boolean
}) {
  return (
    <section className="music-shelf">
      <div className="music-section-heading">
        <h2>{title}</h2>
      </div>
      <div className={`music-cards ${grid ? '' : 'music-cards--row'}`}>
        {channels.map((channel) => (
          <Card
            key={channel.id}
            className="music-card--round"
            title={channel.title}
            subtitle="Artist"
            art={
              <Artwork
                round
                src={channel.thumbnail_url}
                name={channel.title}
                icon="artist"
                hue={hueFor(channel.title)}
              />
            }
            onOpen={() => navigate(musicPath('artist', channel.id))}
          />
        ))}
      </div>
    </section>
  )
}
