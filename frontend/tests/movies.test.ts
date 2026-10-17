import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moviesPath, parseMoviesRoute } from '../src/movies/routes.ts'
import {
  actionFor, artFor, artInset, formatDate, formatRuntime, genreRows, inProgress, isWatchable, matchesQuery, metaParts,
  pickFeatured, progressFraction, qualityBadge, ratingLabel, releaseYear, sourceOf,
} from '../src/movies/format.ts'
import type { Movie } from '../src/movies/api.ts'

const title = (overrides: Partial<Movie> = {}): Movie => ({
  id: 'local:movie:a', kind: 'movie', title: 'Alpha', description: '', date: '', runtime: 0, poster: null, backdrop: null,
  genres: [], rating: 0, cast: [], crew: [], certification: '', available_providers: [], seasons: [], trailer_url: null,
  provider_url: null, assets: [], playable: true, ...overrides,
})

test('free-streaming routes preserve provider-scoped identifiers', () => {
  assert.equal(parseMoviesRoute(moviesPath('free'))?.view, 'free')
  assert.equal(parseMoviesRoute(moviesPath('watch', 'open:movie:big-buck-bunny'))?.id, 'open:movie:big-buck-bunny')
  assert.equal(parseMoviesRoute('#/movies/watch?id=https://example.com')?.view, 'not-found')
})

test('Movies has its own route namespace and does not consume existing routes', () => {
  for (const route of ['#/', '#/music/home', '#/watch?v=123', '#/movies-other']) {
    assert.equal(parseMoviesRoute(route), null)
  }
  for (const route of ['#/movies', '#/movies/', moviesPath()]) {
    assert.deepEqual(parseMoviesRoute(route), { name: 'movies', view: 'home', id: '', query: '' })
  }
  assert.deepEqual(parseMoviesRoute(moviesPath('settings')), { name: 'movies', view: 'settings', id: '', query: '' })
})

test('Unknown Movies links stay inside Movies, including malformed input', () => {
  for (const route of ['#/movies/watch?v=123', '#/movies/%ZZ', '#/movies/home/extra']) {
    assert.deepEqual(parseMoviesRoute(route), { name: 'movies', view: 'not-found', id: '', query: '' })
  }
})

test('runtimes read as hours and minutes, and unknown lengths are left out', () => {
  assert.equal(formatRuntime(10), '10m')
  assert.equal(formatRuntime(60), '1h')
  assert.equal(formatRuntime(96), '1h 36m')
  assert.equal(formatRuntime(10.9), '11m')
  for (const missing of [0, -5, 0.2, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(formatRuntime(missing), '')
})

test('dates show the year or a full en-GB date, and anything else is left out', () => {
  assert.equal(releaseYear('2008'), '2008')
  assert.equal(releaseYear('2008-05-30'), '2008')
  assert.equal(releaseYear(''), '')
  assert.equal(releaseYear('soon'), '')
  assert.equal(formatDate('2024-03-12'), '12 March 2024')
  assert.equal(formatDate('2010'), '2010')
  assert.equal(formatDate('2024-13-45'), '2024')
  assert.equal(formatDate(''), '')
})

test('ratings and meta lines skip unknown values instead of printing zeros', () => {
  assert.equal(ratingLabel(7.54), '7.5')
  assert.equal(ratingLabel(0), '')
  assert.deepEqual(metaParts(title({ date: '2008', certification: 'Not rated', runtime: 10 })), ['2008', 'Not rated', '10m'])
  assert.deepEqual(metaParts(title()), [])
  assert.deepEqual(metaParts(title({ kind: 'show', date: '2020', seasons: [{ number: 0, name: 'Specials', count: 2 }, { number: 1, name: 'Season 1', count: 8 }] })), ['2020', '1 season'])
})

test('quality badges only claim what a playable file shows', () => {
  const asset = (height: number, available = true) => ({ id: String(height), label: '', available, duration: 1, height, video_codec: '', audio_codec: '' })
  assert.equal(qualityBadge(title({ assets: [asset(1080), asset(480)] })), 'HD')
  assert.equal(qualityBadge(title({ assets: [asset(2160)] })), '4K')
  assert.equal(qualityBadge(title({ assets: [asset(1080, false), asset(480)] })), '')
  assert.equal(qualityBadge(title({ assets: [asset(0)] })), '')
})

test('free films and registered files are told apart, and only playable titles count as watchable', () => {
  assert.equal(sourceOf(title({ id: 'open:movie:sintel' })), 'free')
  assert.equal(sourceOf(title({ id: 'tmdb:movie:1' })), 'collection')
  assert.equal(isWatchable(title({ playable: false })), false)
  assert.equal(isWatchable(title({ kind: 'show', playable: false, watchable: true })), true)
  assert.equal(isWatchable(title({ playable: true, watchable: false })), false)
})

test('the main action plays films, resumes progress and opens a series', () => {
  assert.deepEqual(actionFor(title()), { view: 'watch', label: 'Play', plays: true })
  const resumed = title({ progress: { position: 30, duration: 100, completed: false, updated_at: 1 } })
  assert.equal(actionFor(resumed).label, 'Resume')
  assert.equal(inProgress(resumed), true)
  assert.equal(progressFraction(resumed), 0.3)
  assert.equal(inProgress(title({ progress: { position: 99, duration: 100, completed: true, updated_at: 1 } })), false)
  assert.equal(progressFraction(title({ progress: { position: 5, duration: 0, completed: false, updated_at: 1 } })), 0)
  assert.deepEqual(actionFor(title({ kind: 'show' })), { view: 'details', label: 'Episodes', plays: false })
})

test('search needs every word, in any order, across title, people and genre', () => {
  const film = title({ title: 'Sintel', description: 'A traveller searches for a dragon.', genres: ['Animation'], cast: ['Halina Reijn'], crew: ['Colin Levy'] })
  assert.equal(matchesQuery(film, 'sintel'), true)
  assert.equal(matchesQuery(film, 'levy sintel'), true)
  assert.equal(matchesQuery(film, 'animation dragon'), true)
  assert.equal(matchesQuery(film, 'sintel comedy'), false)
  assert.equal(matchesQuery(film, '   '), true)
})

test('genre rows need at least two titles, biggest first, and each title joins every one of its genres', () => {
  const a = title({ id: 'a', genres: ['Animation', 'Comedy'] })
  const b = title({ id: 'b', genres: ['Animation', 'Science Fiction'] })
  const c = title({ id: 'c', genres: ['Science Fiction', 'Animation'] })
  const rows = genreRows([a, b, c])
  assert.deepEqual(rows.map(row => [row.genre, row.items.map(item => item.id)]), [['Animation', ['a', 'b', 'c']], ['Science Fiction', ['b', 'c']]])
  assert.deepEqual(genreRows([a]), [])
})

test('the featured title has artwork when any does, and wide art is preferred for banners', () => {
  const plain = title({ id: 'plain' })
  const pictured = title({ id: 'pictured', poster: '/poster.jpg', backdrop: '/backdrop.jpg' })
  assert.equal(pickFeatured([plain, pictured]), pictured)
  assert.equal(pickFeatured([plain]), plain)
  assert.equal(pickFeatured([]), undefined)
  assert.equal(artFor(pictured, 'wide'), '/backdrop.jpg')
  assert.equal(artFor(pictured, 'tall'), '/poster.jpg')
  assert.equal(artFor(title({ poster: '/poster.jpg' }), 'wide'), '/poster.jpg')
  assert.equal(artFor(plain, 'wide'), null)
})

test('a recorded art inset crops baked-in bars, and anything that is not a plain inset is ignored', () => {
  assert.equal(artInset(title({ art_inset: '21.7% 0' })), 'inset(21.7% 0)')
  assert.equal(artInset(title({ art_inset: '10%' })), 'inset(10%)')
  assert.equal(artInset(title()), undefined)
  for (const unsafe of ['red; background: url(x)', '10% 0) , url(x', '', 'inset(1%)']) assert.equal(artInset(title({ art_inset: unsafe })), undefined)
})
