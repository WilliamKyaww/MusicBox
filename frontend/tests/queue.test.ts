import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  enqueueTrack,
  moveQueuedTrack,
  parseSavedSession,
  removeQueuedTrack,
  shuffleTracks,
  toggleQueueShuffle,
  type PlayerSession,
  type PlayerTrack,
} from '../src/music/queue.ts'
import {
  experiencePath,
  musicPath,
  parseMusicRoute,
  rememberExperience,
} from '../src/experience.ts'

const track = (n: number): PlayerTrack => ({
  videoId: `track00000${n}`,
  title: `Song ${n}`,
  thumbnailUrl: null,
  channelTitle: 'Artist',
  sourceUrl: `https://www.youtube.com/watch?v=track00000${n}`,
  durationLabel: '3:00',
})
const session = (): PlayerSession => ({
  source: 'queue',
  playlistId: null,
  tracks: [track(0), track(1), track(2), track(3)],
  index: 1,
  shuffle: false,
})

test('play next inserts after the current song without dropping later songs', () => {
  const result = enqueueTrack(session(), track(4), true)
  assert.deepEqual(
    result.tracks.map((t) => t.title),
    ['Song 0', 'Song 1', 'Song 4', 'Song 2', 'Song 3'],
  )
  assert.equal(result.index, 1)
})
test('add to queue appends and creates an empty queue safely', () => {
  assert.equal(
    enqueueTrack(session(), track(4), false).tracks.at(-1)?.title,
    'Song 4',
  )
  assert.equal(enqueueTrack(null, track(4), false).tracks.length, 1)
})
test('queue edits cannot remove or reorder the current song or history', () => {
  const value = session()
  assert.equal(removeQueuedTrack(value, 1), value)
  assert.equal(moveQueuedTrack(value, 2, -1), value)
  assert.deepEqual(
    moveQueuedTrack(value, 2, 1).tracks.map((t) => t.title),
    ['Song 0', 'Song 1', 'Song 3', 'Song 2'],
  )
  assert.equal(removeQueuedTrack(value, 3).tracks.length, 3)
})
test('shuffle preserves current song and played prefix; disabling restores pending order', () => {
  const value = session()
  const shuffled = toggleQueueShuffle(value, () => 0)
  assert.deepEqual(shuffled.tracks.slice(0, 2), value.tracks.slice(0, 2))
  assert.deepEqual(toggleQueueShuffle(shuffled).tracks, value.tracks)
  assert.deepEqual(
    shuffleTracks([], () => 0),
    [],
  )
})
test('turning off shuffle after advancing does not replay consumed entries', () => {
  const value = toggleQueueShuffle(session(), () => 0)
  const advanced = { ...value, index: 2 }
  const restored = toggleQueueShuffle(advanced)
  assert.deepEqual(restored.tracks.slice(0, 3), advanced.tracks.slice(0, 3))
  assert.equal(restored.tracks.length, 4)
})
test('restoring queue validates shape and clamps out-of-range indices', () => {
  assert.equal(parseSavedSession({ tracks: [{}] }), null)
  assert.equal(parseSavedSession('invalid'), null)
  assert.equal(parseSavedSession({ ...session(), index: 99 })?.index, 3)
  assert.equal(parseSavedSession({ ...session(), tracks: [] }), null)
})
test('music routes round-trip escaped queries and playlist ids', () => {
  assert.equal(
    parseMusicRoute(musicPath('search', 'A & B? #live'))?.query,
    'A & B? #live',
  )
  assert.equal(parseMusicRoute(musicPath('playlist', 'a/b'))?.playlistId, 'a/b')
  assert.equal(parseMusicRoute('#/watch?v=abc'), null)
  assert.equal(parseMusicRoute('#/music/unknown')?.view, 'home')
})
test('experience preferences preserve independent routes and do not auto-open videos', () => {
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
    },
  })
  rememberExperience(musicPath('liked'))
  rememberExperience('#/songs')
  assert.equal(experiencePath('music'), musicPath('liked'))
  assert.equal(experiencePath('video'), '#/songs')
  rememberExperience('#/watch?v=abc')
  assert.equal(experiencePath('video'), '#/')
  map.set('musicbox-experience-video-route', 'https://evil.example')
  assert.equal(experiencePath('video'), '#/')
  delete (globalThis as { localStorage?: unknown }).localStorage
})
