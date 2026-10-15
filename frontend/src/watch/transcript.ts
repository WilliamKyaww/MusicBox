import type { CaptionCue } from '../player/captions'

export type TranscriptLine = {
  start: number
  text: string
}

/**
 * Turns caption cues into one readable line per cue. Auto-generated captions
 * roll, so a cue often repeats the end of the previous one; only the new words
 * are kept, and exact repeats are dropped.
 */
export function buildTranscript(cues: CaptionCue[]): TranscriptLine[] {
  const lines: TranscriptLine[] = []
  let previous = ''

  for (const cue of cues) {
    let text = cue.text.replace(/\s+/g, ' ').trim()
    if (!text || text === previous) continue

    const overlap = previous && text.startsWith(previous) ? text.slice(previous.length).trim() : text
    previous = text
    text = overlap
    if (!text) continue

    lines.push({ start: cue.start, text })
  }

  return lines
}

/** Index of the line being spoken at `time`, or -1 before the first line. */
export function activeLineIndex(lines: TranscriptLine[], time: number) {
  let low = 0
  let high = lines.length - 1
  let found = -1

  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].start <= time) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return found
}

function searchPattern(query: string) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(${escaped})`, 'gi')
}

/** Indices of the lines that contain `query`, ignoring case. An empty query matches nothing. */
export function findMatches(lines: TranscriptLine[], query: string) {
  const needle = query.trim()
  if (!needle) return []
  const pattern = searchPattern(needle)
  const found: number[] = []
  lines.forEach((line, index) => {
    pattern.lastIndex = 0
    if (pattern.test(line.text)) found.push(index)
  })
  return found
}

export type TextPart = { text: string; match: boolean }

/** Splits a line so the parts that match `query` can be highlighted. */
export function splitMatches(text: string, query: string): TextPart[] {
  const needle = query.trim()
  if (!needle) return [{ text, match: false }]
  // With one capture group, split() puts the matches at the odd positions.
  return text
    .split(searchPattern(needle))
    .map((part, index) => ({ text: part, match: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}
