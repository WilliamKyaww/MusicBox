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
