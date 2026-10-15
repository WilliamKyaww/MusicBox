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
