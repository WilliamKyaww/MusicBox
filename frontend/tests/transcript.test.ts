import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeLineIndex, buildTranscript } from '../src/watch/transcript.ts'

test('transcript collapses whitespace and drops empty or repeated cues', () => {
  const lines = buildTranscript([
    { start: 0, end: 2, text: 'Hello\n  there' },
    { start: 2, end: 4, text: 'Hello there' },
    { start: 4, end: 6, text: '   ' },
    { start: 6, end: 8, text: 'General Kenobi' },
  ])
  assert.deepEqual(lines, [
    { start: 0, text: 'Hello there' },
    { start: 6, text: 'General Kenobi' },
  ])
})

test('rolling captions keep only the words that are new', () => {
  const lines = buildTranscript([
    { start: 0, end: 3, text: 'one two' },
    { start: 2, end: 5, text: 'one two three four' },
  ])
  assert.deepEqual(lines, [
    { start: 0, text: 'one two' },
    { start: 2, text: 'three four' },
  ])
})

test('active line is the last one that has started', () => {
  const lines = [
    { start: 1, text: 'a' },
    { start: 5, text: 'b' },
    { start: 9, text: 'c' },
  ]
  assert.equal(activeLineIndex(lines, 0), -1)
  assert.equal(activeLineIndex(lines, 1), 0)
  assert.equal(activeLineIndex(lines, 8.9), 1)
  assert.equal(activeLineIndex(lines, 100), 2)
  assert.equal(activeLineIndex([], 5), -1)
})

test('searching ignores case, trims the query and matches nothing when empty', async () => {
  const { findMatches } = await import('../src/watch/transcript.ts')
  const lines = [
    { start: 0, text: 'Hello World' },
    { start: 2, text: 'nothing here' },
    { start: 4, text: 'say hello again' },
  ]
  assert.deepEqual(findMatches(lines, 'HELLO'), [0, 2])
  assert.deepEqual(findMatches(lines, '  world '), [0])
  assert.deepEqual(findMatches(lines, 'zzz'), [])
  assert.deepEqual(findMatches(lines, '   '), [])
})

test('search text with regular expression characters is matched literally', async () => {
  const { findMatches, splitMatches } = await import('../src/watch/transcript.ts')
  const lines = [{ start: 0, text: 'what is (1+1)? two.' }, { start: 1, text: 'plain words' }]
  assert.deepEqual(findMatches(lines, '(1+1)?'), [0])
  assert.deepEqual(findMatches(lines, '.*'), [])
  assert.deepEqual(splitMatches('what is (1+1)? two.', '(1+1)?'), [
    { text: 'what is ', match: false },
    { text: '(1+1)?', match: true },
    { text: ' two.', match: false },
  ])
})

test('highlight parts keep every character and mark each occurrence', async () => {
  const { splitMatches } = await import('../src/watch/transcript.ts')
  const parts = splitMatches('The dog and the DOG', 'dog')
  assert.equal(parts.map((part) => part.text).join(''), 'The dog and the DOG')
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['dog', 'DOG'])
  assert.deepEqual(splitMatches('abc', ''), [{ text: 'abc', match: false }])
})
