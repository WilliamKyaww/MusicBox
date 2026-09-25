import { useCallback, useEffect, useRef, useState } from 'react'
import { getVideoThumbnailHref } from '../api/downloads'
import { fetchChannelPage, fetchVideoDetails, fetchYouTubePlaylist } from '../api/browse'
import { formatCompact, formatSubscribers } from '../format'
import {
  getResumePosition,
  recordHistory,
  saveWatchProgress,
  updatePlayerPrefs,
  useLibrary,
} from '../library'
import { navigate, paths } from '../router'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { detailsToVideo, useVideoActions, type WatchQueue } from '../videoActions'
import { ChannelAvatar } from '../components/ChannelAvatar'
import {
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  ListIcon,
  MusicNoteIcon,
  ScissorsIcon,
  ShareIcon,
  ThumbUpIcon,
  VerifiedIcon,
} from '../components/Icons'
import { StatusPanel } from '../components/StatusPanel'
import { SubscribeButton } from '../components/SubscribeButton'
import { VideoPlayer, type VideoPlayerHandle } from '../player/VideoPlayer'
import { ClipPanel } from '../watch/ClipPanel'
import { CommentsSection } from '../watch/CommentsSection'
import { DescriptionBox } from '../watch/DescriptionBox'
import { UpNext, WatchPlaylistPanel } from '../watch/UpNext'
import type { ClipRange, VideoDetails, VideoSearchResult } from '../types'

type WatchPageProps = {
  videoId: string
  startSeconds: number | null
  listId: string | null
  watchQueue: WatchQueue | null
}

const DEFAULT_CLIP_SECONDS = 30
const UP_NEXT_LIMIT = 20

function buildUpNext(
  videoId: string,
  queue: WatchQueue | null,
  channelVideos: VideoSearchResult[],
): { label: string; videos: VideoSearchResult[] } {
  const seen = new Set([videoId])
  const videos: VideoSearchResult[] = []
  let label = 'Up next'

  const queueIndex = queue?.items.findIndex((video) => video.id === videoId) ?? -1
  if (queue && queueIndex >= 0) {
    label = queue.label
    for (const video of queue.items.slice(queueIndex + 1)) {
      if (!seen.has(video.id)) {
        seen.add(video.id)
        videos.push(video)
      }
    }
  }

  for (const video of channelVideos) {
    if (videos.length >= UP_NEXT_LIMIT) break
    if (!seen.has(video.id) && !video.is_short) {
      seen.add(video.id)
      videos.push(video)
    }
  }

  return { label, videos: videos.slice(0, UP_NEXT_LIMIT) }
}

function WatchSkeleton() {
  return (
    <div className="watch">
      <div className="watch__player">
        <div className="yt-player yt-player--placeholder shimmer" />
      </div>
      <div className="watch__info">
        <div className="line shimmer line--wide" />
        <div className="line shimmer line--medium" />
      </div>
    </div>
  )
}

export function WatchPage({ videoId, startSeconds, listId, watchQueue }: WatchPageProps) {
  const { data: details, error } = useCachedResource(cacheKeys.video(videoId), (signal) =>
    fetchVideoDetails(videoId, signal),
  )

  if (error && !details) {
    return (
      <StatusPanel
        tone="error"
        title="This video could not be loaded"
        body={
          <>
            {error}{' '}
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
              Open it on YouTube instead.
            </a>
          </>
        }
      />
    )
  }

  if (!details) return <WatchSkeleton />

  return (
    <WatchView
      details={details}
      startSeconds={startSeconds}
      listId={listId}
      watchQueue={watchQueue}
    />
  )
}

type WatchViewProps = Omit<WatchPageProps, 'videoId'> & { details: VideoDetails }

function WatchView({ details, startSeconds, listId, watchQueue }: WatchViewProps) {
  const actions = useVideoActions()
  const playerRef = useRef<VideoPlayerHandle>(null)
  const clipPreviewEndRef = useRef<number | null>(null)
  const { autoplay, theater } = useLibrary((state) => state.prefs)
  const [initialStart] = useState(() => startSeconds ?? getResumePosition(details.id) ?? 0)
  const [clip, setClip] = useState<ClipRange | null>(null)
  const duration = details.duration_seconds ?? 0
  const video = detailsToVideo(details)

  const playlist = useCachedResource(listId ? cacheKeys.playlist(listId) : null, (signal) =>
    fetchYouTubePlaylist(listId ?? '', 1, signal),
  )
  const channelVideos = useCachedResource(
    details.channel_id ? cacheKeys.channel(details.channel_id, 'videos') : null,
    (signal) => fetchChannelPage(details.channel_id, 'videos', 1, signal),
  )

  const upNext = buildUpNext(details.id, watchQueue, channelVideos.data?.videos ?? [])
  const playlistItems = playlist.data?.items ?? []
  const playlistIndex = playlistItems.findIndex((item) => item.id === details.id)
  const nextVideo =
    playlistIndex >= 0 && playlistIndex < playlistItems.length - 1
      ? playlistItems[playlistIndex + 1]
      : upNext.videos[0] ?? null
  const nextListId = playlistIndex >= 0 && playlistIndex < playlistItems.length - 1 ? listId : null

  useEffect(() => {
    recordHistory(detailsToVideo(details))
    document.title = `${details.title} - MusicBox`
    return () => {
      document.title = 'MusicBox'
    }
  }, [details])

  const handlePlayNext = useCallback(() => {
    if (nextVideo) navigate(paths.watch(nextVideo.id, { listId: nextListId }))
  }, [nextVideo, nextListId])

  function seekTo(seconds: number) {
    playerRef.current?.seekTo(seconds)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openClip() {
    if (clip) {
      setClip(null)
      return
    }
    const start = Math.floor(playerRef.current?.getCurrentTime() ?? 0)
    setClip({ start, end: Math.min(duration || start + DEFAULT_CLIP_SECONDS, start + DEFAULT_CLIP_SECONDS) })
  }

  function previewClip() {
    if (!clip) return
    clipPreviewEndRef.current = clip.end
    playerRef.current?.seekTo(clip.start)
  }

  function downloadClip() {
    if (!clip) return
    // Downloads cut on whole seconds; widen outwards so nothing picked is lost.
    actions.openDownload(video, {
      startSeconds: Math.floor(clip.start),
      endSeconds: Math.min(Math.ceil(clip.end), duration || Math.ceil(clip.end)),
    })
  }

  async function shareAtCurrentTime() {
    const seconds = Math.floor(playerRef.current?.getCurrentTime() ?? 0)
    const url = `https://youtu.be/${details.id}${seconds > 0 ? `?t=${seconds}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
      actions.pushToast(seconds > 0 ? 'Link to the current time copied.' : 'Link copied.')
    } catch {
      actions.pushToast(url)
    }
  }

  // [ and ] mark the section boundaries at the playback position.
  useEffect(() => {
    if (!clip) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '[' && event.key !== ']') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const now = playerRef.current?.getCurrentTime() ?? 0
      setClip((current) => {
        if (!current) return current
        if (event.key === '[') {
          return { start: now, end: now < current.end ? current.end : Math.min(duration, now + 10) }
        }
        return { start: now > current.start ? current.start : Math.max(0, now - 10), end: now }
      })
      actions.pushToast(`Section ${event.key === '[' ? 'start' : 'end'} set.`)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clip, duration, actions])

  const latestDownload = actions.getLatestDownload(details.id)
  const downloadIsActive =
    latestDownload !== null &&
    ['queued', 'downloading', 'converting'].includes(latestDownload.status)
  const channelLink = details.channel_id ? paths.channel(details.channel_id) : undefined

  return (
    <div className={`watch ${theater ? 'watch--theater' : ''}`}>
      <div className="watch__player">
        <VideoPlayer
          ref={playerRef}
          details={details}
          startSeconds={initialStart}
          theater={theater}
          onToggleTheater={() => updatePlayerPrefs({ theater: !theater })}
          autoplay={autoplay}
          onToggleAutoplay={() => updatePlayerPrefs({ autoplay: !autoplay })}
          nextVideo={nextVideo}
          onPlayNext={handlePlayNext}
          clip={clip}
          onClipChange={setClip}
          onProgress={(seconds, total) => saveWatchProgress(details.id, seconds, total)}
          onTimeUpdate={(seconds) => {
            const previewEnd = clipPreviewEndRef.current
            if (previewEnd !== null && seconds >= previewEnd) {
              clipPreviewEndRef.current = null
              playerRef.current?.pause()
            }
          }}
        />
      </div>

      <div className="watch__info">
        <h1 className="watch__title">{details.title}</h1>

        <div className="watch__owner-row">
          <div className="watch__owner">
            <ChannelAvatar
              name={details.channel_title}
              url={details.channel_thumbnail_url}
              size={40}
              href={channelLink}
            />
            <div className="watch__owner-text">
              <a className="watch__channel-name" href={channelLink}>
                {details.channel_title}
                {details.channel_is_verified ? (
                  <VerifiedIcon className="yt-icon yt-verified" />
                ) : null}
              </a>
              <span className="watch__subscribers">
                {formatSubscribers(details.channel_subscriber_count)}
              </span>
            </div>
            <SubscribeButton
              channelId={details.channel_id}
              name={details.channel_title}
              handle={details.channel_handle}
              avatarUrl={details.channel_thumbnail_url}
            />
          </div>

          <div className="watch__actions">
            {details.like_count !== null ? (
              <span className="yt-pill yt-pill--static" title="Likes on YouTube">
                <ThumbUpIcon className="yt-icon" />
                {formatCompact(details.like_count)}
              </span>
            ) : null}
            <button type="button" className="yt-pill" onClick={() => void shareAtCurrentTime()}>
              <ShareIcon className="yt-icon" />
              Share
            </button>
            <button
              type="button"
              className="yt-pill"
              onClick={() => actions.openDownload(video)}
              disabled={downloadIsActive}
            >
              <DownloadIcon className="yt-icon" />
              {downloadIsActive
                ? `Downloading ${Math.round(latestDownload?.progress_percent ?? 0)}%`
                : 'Download'}
            </button>
            {duration > 0 && details.live_status !== 'is_live' ? (
              <button
                type="button"
                className={`yt-pill ${clip ? 'yt-pill--active' : ''}`}
                onClick={openClip}
                aria-pressed={Boolean(clip)}
              >
                <ScissorsIcon className="yt-icon" />
                Clip
              </button>
            ) : null}
            <button
              type="button"
              className="yt-pill"
              onClick={() => actions.openSaveToPlaylist(video)}
            >
              <ListIcon className="yt-icon" />
              Save
            </button>
            <button
              type="button"
              className="yt-pill"
              onClick={() => {
                playerRef.current?.pause()
                actions.playAudio(video)
              }}
            >
              <MusicNoteIcon className="yt-icon" />
              Listen
            </button>
            <a
              className="yt-pill"
              href={getVideoThumbnailHref(details.id, details.title, details.thumbnail_url)}
              download
            >
              <ImageIcon className="yt-icon" />
              Thumbnail
            </a>
            <a className="yt-pill" href={details.video_url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="yt-icon" />
              YouTube
            </a>
          </div>
        </div>

        {clip ? (
          <ClipPanel
            clip={clip}
            duration={duration}
            onChange={setClip}
            getCurrentTime={() => playerRef.current?.getCurrentTime() ?? 0}
            onPreview={previewClip}
            onDownload={downloadClip}
            onClose={() => setClip(null)}
          />
        ) : null}

        <DescriptionBox details={details} onSeek={seekTo} />

        <CommentsSection
          videoId={details.id}
          channelId={details.channel_id}
          commentCount={details.comment_count}
          videoUrl={details.video_url}
          onSeek={seekTo}
        />
      </div>

      <aside className="watch__secondary">
        {playlist.data ? (
          <WatchPlaylistPanel playlist={playlist.data} currentVideoId={details.id} />
        ) : null}
        <UpNext
          label={upNext.label}
          videos={upNext.videos}
          autoplay={autoplay}
          onToggleAutoplay={() => updatePlayerPrefs({ autoplay: !autoplay })}
          isLoading={channelVideos.isLoading}
        />
      </aside>
    </div>
  )
}
