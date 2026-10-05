import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moviesPath, parseMoviesRoute } from '../src/movies/routes.ts'

test('Movies has its own route namespace and does not consume existing routes', () => {
  for (const route of ['#/', '#/music/home', '#/watch?v=123', '#/movies-other']) {
    assert.equal(parseMoviesRoute(route), null)
  }
  for (const route of ['#/movies', '#/movies/', moviesPath()]) {
    assert.deepEqual(parseMoviesRoute(route), { name: 'movies', view: 'home' })
  }
  assert.deepEqual(parseMoviesRoute(moviesPath('settings')), { name: 'movies', view: 'settings' })
})

test('Unknown Movies links stay inside Movies, including malformed input', () => {
  for (const route of ['#/movies/watch?v=123', '#/movies/%ZZ', '#/movies/home/extra']) {
    assert.deepEqual(parseMoviesRoute(route), { name: 'movies', view: 'not-found' })
  }
})
