import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendAutoplay,
  clearQueued,
  enqueueTrack,
  moveQueuedTrackTo,
  parseSavedSession,
  queueSections,
  startContext,
  toggleQueueShuffle,
  type PlayerSession,
  type PlayerTrack,
} from '../src/music/queue.ts'
import {
  activeLineIndex,
  cleanLyric,
  parseVtt,
  pickCaptionTrack,
} from '../src/music/lyrics.ts'
import {
  dailyMixes,
  dominantArtist,
  formatAdded,
  formatTotalDuration,
  greeting,
  onRepeat,
  parseDuration,
  radioCandidates,
  topArtists,
} from '../src/music/recommend.ts'
import { artistPath, musicPath, parseMusicRoute } from '../src/experience.ts'
import type { VideoSearchResult } from '../src/types.ts'

const track = (n: number): PlayerTrack => ({
  videoId: `track00000${n}`,
  title: `Song ${n}`,
  thumbnailUrl: null,
  channelTitle: 'Artist',
  sourceUrl: `https://www.youtube.com/watch?v=track00000${n}`,
  durationLabel: '3:00',
})
const video = (
  n: number,
  artist = 'Artist',
  extra: Partial<VideoSearchResult> = {},
): VideoSearchResult => ({
  id: `video00000${n}`,
  title: `Song ${n}`,
  channel_title: artist,
  channel_id: `channel-${artist}`,
  description: '',
  thumbnail_url: '',
  duration_iso: '',
  duration_label: '3:00',
  published_at: '',
  video_url: '',
  ...extra,
})
const titles = (session: PlayerSession) => session.tracks.map((t) => t.title)

test('starting a new context keeps songs the listener queued, right after the chosen song', () => {
  const playing: PlayerSession = enqueueTrack(
    startContext(null, [track(0), track(1)], 0, undefined),
    track(9),
    false,
  )
  const next = startContext(
    playing,
    [track(4), track(5), track(6)],
    1,
    { kind: 'playlist', id: 'p1', title: 'Road trip' },
  )
  assert.deepEqual(titles(next), ['Song 4', 'Song 5', 'Song 9', 'Song 6'])
  assert.equal(next.index, 1)
  assert.equal(next.playlistId, 'p1')
  assert.equal(next.source, 'playlist')
  assert.equal(next.context?.title, 'Road trip')
})

test('shuffle play starts with the chosen song and keeps the listener queue in order', () => {
  const queued = enqueueTrack(startContext(null, [track(0)], 0, undefined), track(8), false)
  const shuffled = startContext(
    queued,
    [track(1), track(2), track(3), track(4)],
    2,
    undefined,
    true,
    () => 0,
  )
  assert.equal(shuffled.tracks[0].title, 'Song 3')
  assert.equal(shuffled.tracks[1].title, 'Song 8')
  assert.equal(shuffled.shuffle, true)
  assert.equal(shuffled.tracks.length, 5)
  const unshuffled = toggleQueueShuffle(shuffled)
  assert.deepEqual(titles(unshuffled), ['Song 3', 'Song 8', 'Song 1', 'Song 2', 'Song 4'])
})

test('shuffle play with no chosen song starts on a random one', () => {
  const tracks = [track(1), track(2), track(3), track(4)]
  const value = startContext(null, tracks, -1, undefined, true, () => 0.6)
  assert.equal(value.tracks[0].title, 'Song 3')
  assert.equal(value.index, 0)
  assert.equal(startContext(null, tracks, -1, undefined, false).index, 0)
})

test('queue sections, clear queue, autoplay and drag reordering', () => {
  let value = startContext(null, [track(0), track(1), track(2)], 0, undefined)
  value = enqueueTrack(value, track(7), false)
  value = appendAutoplay(value, [track(2), track(5)])
  const sections = queueSections(value)
  assert.deepEqual(sections.queued.map((e) => e.track.title), ['Song 7'])
  assert.deepEqual(sections.context.map((e) => e.track.title), ['Song 1', 'Song 2'])
  // Song 2 is already upcoming, so autoplay only adds Song 5.
  assert.deepEqual(sections.autoplay.map((e) => e.track.title), ['Song 5'])
  assert.deepEqual(titles(clearQueued(value)), ['Song 0', 'Song 1', 'Song 2', 'Song 5'])
  assert.deepEqual(titles(moveQueuedTrackTo(value, 3, 1)), [
    'Song 0',
    'Song 2',
    'Song 7',
    'Song 1',
    'Song 5',
  ])
  assert.equal(moveQueuedTrackTo(value, 0, 2), value)
})

test('saved sessions keep queue origins and a valid playing context only', () => {
  const saved = parseSavedSession({
    tracks: [{ ...track(1), origin: 'queue', channelId: 'UC123' }, { ...track(2), origin: 'bogus' }],
    index: 0,
    context: { kind: 'album', id: 'PL1', title: 'Discovery' },
  })
  assert.equal(saved?.tracks[0].origin, 'queue')
  assert.equal(saved?.tracks[0].channelId, 'UC123')
  assert.equal(saved?.tracks[1].origin, undefined)
  assert.equal(saved?.context?.kind, 'album')
  assert.equal(
    parseSavedSession({ tracks: [track(1)], context: { kind: 'hack', id: 1 } })?.context,
    undefined,
  )
})

test('captions become clean synced lyric lines', () => {
  const lines = parseVtt(`WEBVTT

00:00:01.360 --> 00:00:03.040
[♪♪♪]

00:00:18.640 --> 00:00:21.880
♪ We&#39;re no strangers to love ♪

00:00:22.640 --> 00:00:26.960
♪ You know the rules
and so do I ♪

00:00:27.000 --> 00:00:28.000
♪ You know the rules and so do I ♪

01:02.500 --> 01:04.000 align:start
<c>Never</c> gonna give &amp; take`)
  assert.deepEqual(
    lines.map((line) => line.text),
    ["We're no strangers to love", 'You know the rules and so do I', 'Never gonna give & take'],
  )
  assert.equal(lines[0].start, 18.64)
  assert.equal(lines[2].start, 62.5)
  assert.equal(activeLineIndex(lines, 5), -1)
  assert.equal(activeLineIndex(lines, 23), 1)
  assert.equal(activeLineIndex(lines, 500), 2)
  assert.equal(cleanLyric('[Music]'), '')
  assert.equal(cleanLyric('(Applause)'), '')
})

test('lyrics prefer uploaded captions in the original language', () => {
  const track = (lang: string, auto = false) => ({ lang, name: lang, auto_generated: auto })
  assert.equal(pickCaptionTrack([track('en'), track('es'), track('es-orig', true)])?.lang, 'es')
  assert.equal(pickCaptionTrack([track('de'), track('en-GB')])?.lang, 'en-GB')
  assert.equal(pickCaptionTrack([track('fr-orig', true)])?.auto_generated, true)
  assert.equal(pickCaptionTrack([]), null)
})

test('local recommendations rank artists, build daily mixes and on-repeat lists', () => {
  const history = [video(1, 'M83'), video(2, 'Tycho'), video(3, 'M83'), video(4, 'Daft Punk')].map(
    (v) => ({ video: v }),
  )
  const counts = { video000001: 5, video000002: 2 }
  const artists = topArtists(history, [video(5, 'Daft Punk')], counts)
  assert.deepEqual(artists.map((a) => a.name), ['M83', 'Daft Punk', 'Tycho'])
  assert.equal(artists[0].channelId, 'channel-M83')
  const mixes = dailyMixes(artists)
  assert.equal(mixes[0].title, 'Daily Mix 1')
  assert.equal(mixes[0].query, 'M83')
  assert.match(mixes[0].subtitle, /^M83, Daft Punk, Tycho and more$/)
  assert.deepEqual(onRepeat(history, counts).map((v) => v.id), ['video000001', 'video000002'])
  assert.equal(dominantArtist([video(1, 'A'), video(2, 'B'), video(3, 'B')]), 'B')
})

test('radio skips repeats, Shorts, live streams and long mixes', () => {
  const picked = radioCandidates(
    [
      video(1),
      video(2, 'A', { is_short: true }),
      video(3, 'A', { live_status: 'is_live' }),
      video(4, 'A', { duration_label: '1:02:00' }),
      video(5),
      video(5),
      video(6),
    ],
    new Set(['video000001']),
    2,
  )
  assert.deepEqual(picked.map((v) => v.id), ['video000005', 'video000006'])
})

test('date added reads like Spotify', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  assert.equal(formatAdded('2026-10-03T08:00:00Z', now), 'Today')
  assert.equal(formatAdded('2026-10-01T08:00:00Z', now), '2 days ago')
  assert.equal(formatAdded('2026-09-18T08:00:00Z', now), '2 weeks ago')
  assert.equal(formatAdded('2026-03-05T08:00:00Z', now), '5 Mar 2026')
  assert.equal(formatAdded('not a date', now), '')
})

test('durations and greetings', () => {
  assert.equal(parseDuration('3:45'), 225)
  assert.equal(parseDuration('1:02:03'), 3723)
  assert.equal(parseDuration('LIVE'), 0)
  assert.equal(formatTotalDuration(1513), '25 min 13 sec')
  assert.equal(formatTotalDuration(7500), 'about 2 hr 5 min')
  assert.equal(formatTotalDuration(0), '')
  assert.equal(greeting(new Date(2026, 9, 3, 8)), 'Good morning')
  assert.equal(greeting(new Date(2026, 9, 3, 14)), 'Good afternoon')
  assert.equal(greeting(new Date(2026, 9, 3, 23)), 'Good evening')
})

test('artist, album and mix routes round-trip', () => {
  const artist = parseMusicRoute(musicPath('artist', 'UC123'))
  assert.equal(artist?.view, 'artist')
  assert.equal(artist?.id, 'UC123')
  assert.equal(parseMusicRoute(artistPath('', 'dQw4w9WgXcQ'))?.video, 'dQw4w9WgXcQ')
  const mix = parseMusicRoute(musicPath('mix', 'M83', { title: 'Daily Mix 1' }))
  assert.equal(mix?.query, 'M83')
  assert.equal(mix?.title, 'Daily Mix 1')
  assert.equal(parseMusicRoute(musicPath('album', 'PL&x'))?.id, 'PL&x')
  assert.equal(parseMusicRoute(musicPath('lyrics'))?.view, 'lyrics')
})
