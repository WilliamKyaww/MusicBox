import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileExtension, sanitizeFileName, sectionSuffix } from '../src/downloadNames.ts'

test('section suffixes match the backend naming for clips', () => {
  assert.equal(sectionSuffix({ startSeconds: 0, endSeconds: null }), '')
  assert.equal(sectionSuffix({ startSeconds: 0, endSeconds: 300 }), ' (first 5m00s)')
  assert.equal(sectionSuffix({ startSeconds: 90, endSeconds: null }), ' (from 1m30s)')
  assert.equal(sectionSuffix({ startSeconds: 60, endSeconds: 90 }), ' (1m00s-1m30s)')
  assert.equal(sectionSuffix({ startSeconds: 3725, endSeconds: 3800 }), ' (1h02m05s-1h03m20s)')
  assert.equal(sectionSuffix({ startSeconds: 5, endSeconds: 9 }), ' (5s-9s)')
})

test('file names drop characters Windows rejects and trailing dots', () => {
  assert.equal(sanitizeFileName('  My: "best" clip?  '), 'My best clip')
  assert.equal(sanitizeFileName('a/b\\c|d*e<f>g'), 'abcdefg')
  assert.equal(sanitizeFileName('...'), '')
  assert.equal(sanitizeFileName('Great  song.  '), 'Great song')
  assert.equal(sanitizeFileName('x'.repeat(300)).length, 120)
})

test('extensions follow the chosen format', () => {
  assert.equal(fileExtension('video'), 'mp4')
  assert.equal(fileExtension('audio'), 'mp3')
})
