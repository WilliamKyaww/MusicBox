import { useMemo } from 'react'
import { fetchVideoDetails, getCaptionTrackUrl } from '../api/browse'
import type { CaptionTrack } from '../types'
import { cacheKeys, useCachedResource } from '../useCachedResource'
import { parseVtt, pickCaptionTrack, type LyricLine } from './lyrics'

async function fetchCaptionText(videoId: string, track: CaptionTrack, signal: AbortSignal) {
  const response = await fetch(getCaptionTrackUrl(videoId, track.lang, track.auto_generated), {
    signal,
  })
  if (!response.ok) throw new Error('Lyrics could not be loaded for this song.')
  return response.text()
}

export type LyricsState = {
  lines: LyricLine[]
  track: CaptionTrack | null
  isLoading: boolean
  error: string | null
  /** The video has no captions at all. */
  unavailable: boolean
}

/** Synced lyrics from the song's YouTube captions, preferring uploaded ones over auto-generated. */
export function useLyrics(videoId: string | undefined): LyricsState {
  const details = useCachedResource(videoId ? cacheKeys.video(videoId) : null, (signal) =>
    fetchVideoDetails(videoId!, signal),
  )
  const track = details.data ? pickCaptionTrack(details.data.captions) : null
  const vtt = useCachedResource(
    videoId && track ? `lyrics:${videoId}:${track.lang}:${track.auto_generated}` : null,
    (signal) => fetchCaptionText(videoId!, track!, signal),
  )
  const lines = useMemo(() => (vtt.data ? parseVtt(vtt.data) : []), [vtt.data])
  return {
    lines,
    track,
    isLoading: details.isLoading || vtt.isLoading,
    error: details.error ?? vtt.error,
    unavailable: Boolean(details.data && (!track || (vtt.data !== undefined && !lines.length))),
  }
}
