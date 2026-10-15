import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPublicationDate } from '../src/format.ts'

test('publication dates use British day ordinals and full month names', () => {
  for (const [source, expected] of [
    ['2026-09-01', '1st September 2026'],
    ['2026-09-02', '2nd September 2026'],
    ['2026-09-03', '3rd September 2026'],
    ['2026-09-11', '11th September 2026'],
    ['2026-09-12', '12th September 2026'],
    ['2026-09-13', '13th September 2026'],
    ['2026-09-21', '21st September 2026'],
    ['2026-09-22', '22nd September 2026'],
    ['2026-09-23', '23rd September 2026'],
    ['2026-10-31', '31st October 2026'],
  ]) assert.equal(formatPublicationDate(source), expected)
})

test('publication dates use the UK calendar date and omit unknown dates', () => {
  assert.equal(formatPublicationDate('2026-09-13T23:30:00Z'), '14th September 2026')
  assert.equal(formatPublicationDate('2026-01-13T23:30:00Z'), '13th January 2026')
  assert.equal(formatPublicationDate('invalid'), null)
  assert.equal(formatPublicationDate(null), null)
})
