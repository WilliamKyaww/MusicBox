import { useState } from 'react'
import { fetchChannelPage, fetchVideoDetails } from '../api/browse'
import { artistPath, musicPath } from '../experience'
import { toggleSubscription, useLibrary } from '../library'
import { navigate, paths } from '../router'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { contextPath, startTrackDrag, trackToVideo } from './helpers'
import { LyricsLines } from './LyricsLines'
import { MusicIcon } from './MusicIcon'
import { useMusic } from './MusicContext'
import { getPlaybackControls, usePlayback } from './playback'
import { queueSections, type QueueEntry } from './queue'
import { formatCount } from './recommend'
import { updateMusicState, useMusicStore } from './store'
import { ArtistLink } from './TrackList'
import { Artwork, Equalizer, LikeButton } from './ui'

const CONTEXT_LABELS: Record<string, string> = {
  playlist: 'Playing from playlist',
  liked: 'Playing from your library',
  recent: 'Playing from your history',
  repeat: 'Playing from your mixes',
  artist: 'Playing from artist',
  album: 'Playing from playlist',
  mix: 'Playing from mix',
  search: 'Playing from search',
  downloads: 'Playing from your downloads',
}

function PanelHeader({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="music-panel__header">
      <h2>{title}</h2>
      <div>
        {children}
        <button
          type="button"
          className="music-icon-button"
          aria-label="Close side panel"
          onClick={onClose}
        >
          <MusicIcon name="close" />
        </button>
      </div>
    </div>
  )
}

export function NowPlayingPanel({ onClose }: { onClose: () => void }) {
  const music = useMusic()
  const video = music.currentVideo
  const context = music.session?.context
  const details = useCachedResource(video ? cacheKeys.video(video.id) : null, (signal) =>
    fetchVideoDetails(video!.id, signal),
  )
  const channelId = video?.channel_id || details.data?.channel_id || ''
  const channel = useCachedResource(
    channelId ? cacheKeys.channel(channelId, 'videos') : null,
    (signal) => fetchChannelPage(channelId, 'videos', 1, signal),
  )
  const following = useLibrary((state) =>
    Boolean(channelId && state.subscriptions.some((s) => s.id === channelId)),
  )
  const next = queueSections(music.session)
  const upNext = [...next.queued, ...next.context, ...next.autoplay][0]

  if (!video)
    return (
      <aside className="music-panel" aria-label="Now Playing">
        <PanelHeader title="Now Playing" onClose={onClose} />
        <div className="music-empty">
          <MusicIcon name="music" />
          <p>Choose a song to start listening.</p>
        </div>
      </aside>
    )

  const info = channel.data?.channel
  const artistName = info?.name ?? details.data?.channel_title ?? video.channel_title
  const followers = info?.subscriber_count ?? details.data?.channel_subscriber_count ?? null
  const avatar = info?.avatar_url ?? details.data?.channel_thumbnail_url ?? null
  return (
    <aside className="music-panel" aria-label="Now Playing">
      <PanelHeader
        title={
          context ? (
            <a href={contextPath(context.kind, context.id)} title={CONTEXT_LABELS[context.kind]}>
              {context.title}
            </a>
          ) : (
            'Now Playing'
          )
        }
        onClose={onClose}
      >
        <button
          type="button"
          className="music-icon-button"
          aria-label={`More options for ${video.title}`}
          aria-haspopup="menu"
          onClick={(event) =>
            music.openTrackMenu(video, event.currentTarget.getBoundingClientRect())
          }
        >
          <MusicIcon name="more" />
        </button>
      </PanelHeader>
      <button
        type="button"
        className="music-panel__art"
        aria-label="Open full screen player"
        onClick={music.showFullScreen}
      >
        <Artwork src={video.thumbnail_url} name={video.title} />
      </button>
      <div className="music-panel__title">
        <div>
          <h2 title={video.title}>{video.title}</h2>
          <ArtistLink video={{ ...video, channel_id: channelId }} />
        </div>
        <LikeButton video={video} label="Like current song" onToast={music.toast} />
      </div>

      <section className="music-panel__card music-panel__about">
        {info?.banner_url || avatar ? (
          <div
            className="music-panel__about-image"
            style={{ backgroundImage: `url("${info?.banner_url ?? avatar}")` }}
          >
            <span>About the artist</span>
          </div>
        ) : (
          <h3>About the artist</h3>
        )}
        <div className="music-panel__about-body">
          <button
            type="button"
            className="music-link music-panel__artist-name"
            onClick={() => navigate(artistPath(channelId, video.id))}
          >
            {artistName}
            {info?.is_verified || details.data?.channel_is_verified ? (
              <MusicIcon name="verified" />
            ) : null}
          </button>
          <div className="music-panel__about-row">
            <span>{followers !== null ? `${formatCount(followers)} followers` : 'Artist'}</span>
            {channelId ? (
              <button
                type="button"
                className="music-button music-button--small"
                aria-pressed={following}
                onClick={() => {
                  const followed = toggleSubscription({
                    id: channelId,
                    name: artistName,
                    handle: info?.handle ?? details.data?.channel_handle ?? null,
                    avatarUrl: avatar,
                  })
                  music.toast(followed ? `Following ${artistName}.` : `Unfollowed ${artistName}.`)
                }}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            ) : null}
          </div>
          {info?.description ? <p className="music-panel__bio">{info.description}</p> : null}
        </div>
      </section>

      <section className="music-panel__card">
        <div className="music-panel__card-heading">
          <h3>Credits</h3>
        </div>
        <dl className="music-credits">
          <div>
            <dt>{artistName}</dt>
            <dd>Main artist</dd>
          </div>
          {details.data?.published_at ? (
            <div>
              <dt>Released</dt>
              <dd>
                {new Date(details.data.published_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          ) : null}
          {details.data?.view_count ? (
            <div>
              <dt>Plays on YouTube</dt>
              <dd>{formatCount(details.data.view_count)}</dd>
            </div>
          ) : null}
          {details.data?.category ? (
            <div>
              <dt>Category</dt>
              <dd>{details.data.category}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="music-panel__card music-panel__lyrics">
        <div className="music-panel__card-heading">
          <h3>Lyrics</h3>
          <a href={musicPath('lyrics')}>Show lyrics</a>
        </div>
        <LyricsLines key={video.id} videoId={video.id} variant="card" />
      </section>

      {upNext ? (
        <section className="music-panel__card">
          <div className="music-panel__card-heading">
            <h3>Next in queue</h3>
            <button
              type="button"
              className="music-text-button"
              onClick={() => updateMusicState({ sidebar: 'queue' })}
            >
              Open queue
            </button>
          </div>
          <QueueRow entry={upNext} />
        </section>
      ) : null}

      <button
        type="button"
        className="music-button"
        onClick={() => navigate(paths.watch(video.id))}
      >
        <MusicIcon name="video" />
        Watch the music video
      </button>
    </aside>
  )
}

function QueueRow({
  entry,
  first = false,
  last = false,
  editable = false,
  onDragStart,
  onDropAt,
}: {
  entry: QueueEntry
  first?: boolean
  last?: boolean
  editable?: boolean
  onDragStart?: () => void
  onDropAt?: (before: boolean) => void
}) {
  const music = useMusic()
  const { track, index } = entry
  const video = trackToVideo(track)
  const [over, setOver] = useState<'before' | 'after' | null>(null)
  return (
    <div
      className={`music-queue-track ${over ? `drop-${over}` : ''}`}
      draggable={editable}
      onDragStart={(event) => {
        startTrackDrag(event, video)
        onDragStart?.()
      }}
      onDragOver={(event) => {
        if (!onDropAt) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        setOver(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(event) => {
        if (!onDropAt || !over) return
        event.preventDefault()
        onDropAt(over === 'before')
        setOver(null)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        music.openTrackMenu(video, { x: event.clientX, y: event.clientY }, { queueIndex: index })
      }}
      onDoubleClick={() => music.queue.jump(index)}
    >
      <button type="button" onClick={() => music.queue.jump(index)} aria-label={`Play ${track.title} now`}>
        <Artwork src={track.thumbnailUrl} name={track.title} />
        <span>
          <strong>{track.title}</strong>
          <small>{track.channelTitle}</small>
        </span>
      </button>
      {editable ? (
        <div>
          <button
            type="button"
            className="music-icon-button"
            disabled={first}
            aria-label={`Move queued ${track.title} up`}
            onClick={() => music.queue.move(index, -1)}
          >
            <MusicIcon name="up" />
          </button>
          <button
            type="button"
            className="music-icon-button"
            disabled={last}
            aria-label={`Move queued ${track.title} down`}
            onClick={() => music.queue.move(index, 1)}
          >
            <MusicIcon name="down" />
          </button>
          <button
            type="button"
            className="music-icon-button"
            aria-label={`Remove queued ${track.title}`}
            onClick={() => music.queue.remove(index)}
          >
            <MusicIcon name="close" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const music = useMusic()
  const store = useMusicStore()
  const history = useLibrary((state) => state.history)
  const [tab, setTab] = useState<'queue' | 'recent'>('queue')
  const [dragging, setDragging] = useState<number | null>(null)
  const shuffle = usePlayback((state) => state.shuffle)
  const loopMode = usePlayback((state) => state.loopMode)
  const isPlaying = usePlayback((state) => state.isPlaying)
  const session = music.session
  const current = session?.tracks[session.index]
  const sections = queueSections(session)
  const upcoming = [...sections.queued, ...sections.context, ...sections.autoplay]
  const firstIndex = upcoming[0]?.index
  const lastIndex = upcoming.at(-1)?.index

  function rows(entries: QueueEntry[]) {
    return entries.map((entry) => (
      <QueueRow
        key={`${entry.track.videoId}-${entry.index}`}
        entry={entry}
        editable
        first={entry.index === firstIndex}
        last={entry.index === lastIndex}
        onDragStart={() => setDragging(entry.index)}
        onDropAt={(before) => {
          if (dragging === null) return
          const target = before ? entry.index : entry.index + 1
          music.queue.moveTo(dragging, target > dragging ? target - 1 : target)
          setDragging(null)
        }}
      />
    ))
  }

  const sleepLabel =
    store.sleepAt === 'end'
      ? 'End of track'
      : typeof store.sleepAt === 'number'
        ? new Date(store.sleepAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null

  return (
    <aside className="music-panel" aria-label="Play queue">
      <PanelHeader
        title={
          <span className="music-panel__tabs" role="tablist" aria-label="Queue views">
            <button type="button" role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
              Queue
            </button>
            <button type="button" role="tab" aria-selected={tab === 'recent'} onClick={() => setTab('recent')}>
              Recently played
            </button>
          </span>
        }
        onClose={onClose}
      />
      {tab === 'queue' ? (
        <>
          <div className="music-panel__controls">
            <button
              type="button"
              className={`music-icon-button ${shuffle ? 'is-green' : ''}`}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              disabled={!session}
              onClick={() => getPlaybackControls()?.toggleShuffle()}
            >
              <MusicIcon name="shuffle" />
            </button>
            <button
              type="button"
              className={`music-icon-button ${loopMode !== 'off' ? 'is-green' : ''}`}
              aria-label={`Repeat: ${loopMode === 'one' ? 'song' : loopMode === 'all' ? 'queue' : 'off'}`}
              disabled={!session}
              onClick={() => getPlaybackControls()?.toggleLoop()}
            >
              <MusicIcon name="repeat" />
            </button>
            <button
              type="button"
              className={`music-icon-button ${sleepLabel ? 'is-green' : ''}`}
              aria-label={sleepLabel ? `Sleep timer: ${sleepLabel}` : 'Sleep timer'}
              aria-haspopup="menu"
              onClick={(event) =>
                music.openMenu(
                  [
                    { kind: 'heading', label: 'Stop audio in' },
                    ...[5, 15, 30, 45, 60].map((minutes) => ({
                      label: `${minutes} minutes`,
                      onSelect: () => updateMusicState({ sleepAt: Date.now() + minutes * 60000 }),
                    })),
                    { label: 'End of track', checked: store.sleepAt === 'end', onSelect: () => updateMusicState({ sleepAt: 'end' }) },
                    ...(store.sleepAt ? [{ kind: 'separator' as const }, { label: 'Turn off timer', onSelect: () => updateMusicState({ sleepAt: null }) }] : []),
                  ],
                  event.currentTarget.getBoundingClientRect(),
                  'Sleep timer',
                )
              }
            >
              <MusicIcon name="moon" />
            </button>
            {sleepLabel ? <small>Sleep: {sleepLabel}</small> : null}
          </div>
          {current ? (
            <section className="music-panel__section">
              <h3>Now playing</h3>
              <div className="music-queue-current">
                <Artwork src={current.thumbnailUrl} name={current.title} />
                <span>
                  <strong>{current.title}</strong>
                  <ArtistLink video={trackToVideo(current)} />
                </span>
                <Equalizer playing={isPlaying} />
              </div>
            </section>
          ) : null}
          {sections.queued.length ? (
            <section className="music-panel__section">
              <div className="music-panel__card-heading">
                <h3>Next in queue</h3>
                <button type="button" className="music-text-button" onClick={music.queue.clear}>
                  Clear queue
                </button>
              </div>
              {rows(sections.queued)}
            </section>
          ) : null}
          {sections.context.length ? (
            <section className="music-panel__section">
              <h3>
                Next from:{' '}
                {session?.context ? (
                  <a href={contextPath(session.context.kind, session.context.id)}>
                    {session.context.title}
                  </a>
                ) : (
                  'your queue'
                )}
              </h3>
              {rows(sections.context)}
            </section>
          ) : null}
          {sections.autoplay.length ? (
            <section className="music-panel__section">
              <h3>Autoplay</h3>
              <p className="music-muted">Similar songs play when your music ends.</p>
              {rows(sections.autoplay)}
            </section>
          ) : null}
          {!upcoming.length ? (
            <div className="music-empty">
              <MusicIcon name="queue" />
              <h3>Add to your queue</h3>
              <p>Tap "Add to queue" in a song's menu to see it here.</p>
            </div>
          ) : null}
        </>
      ) : (
        <section className="music-panel__section">
          {history.slice(0, 50).map((entry, index) => (
            <div
              key={entry.video.id}
              className="music-queue-history"
              onContextMenu={(event) => {
                event.preventDefault()
                music.openTrackMenu(entry.video, { x: event.clientX, y: event.clientY })
              }}
            >
              <button
                type="button"
                onClick={() =>
                  music.play(history.map((h) => h.video), index, {
                    kind: 'recent',
                    id: 'recent',
                    title: 'Recently played',
                  })
                }
              >
                <Artwork src={entry.video.thumbnail_url} name={entry.video.title} />
                <span>
                  <strong>{entry.video.title}</strong>
                  <small>{entry.video.channel_title}</small>
                </span>
              </button>
            </div>
          ))}
          {!history.length ? <p className="music-muted">Songs you play will show up here.</p> : null}
        </section>
      )}
    </aside>
  )
}
