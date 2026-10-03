import type { CaptionTrack } from '../types'

/** One synced line, in seconds. */
export type LyricLine = { start: number; end: number; text: string }

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

function decodeEntities(text: string) {
  return text.replace(/&(#?\w+);/g, (match, name: string) => {
    if (name in ENTITIES) return ENTITIES[name]
    if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)))
    if (/^#x[\da-f]+$/i.test(name))
      return String.fromCodePoint(parseInt(name.slice(2), 16))
    return match
  })
}

function parseTimestamp(value: string) {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(value.trim())
  if (!match) return null
  const [, hours = '0', minutes, seconds, fraction] = match
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction.padEnd(3, '0')) / 1000
  )
}

/** Caption text without music notes, tags or "[Music]"-style sound cues; empty when nothing is sung. */
export function cleanLyric(text: string) {
  const plain = decodeEntities(text.replace(/<[^>]*>/g, ''))
    .replace(/[♪♫♬♩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^[[(][^\])]*[\])]$/.test(plain)) return ''
  return plain
}

export function parseVtt(vtt: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const rows = block.split('\n')
    const timing = rows.findIndex((row) => row.includes('-->'))
    if (timing < 0) continue
    const [rawStart, rawEnd = ''] = rows[timing].split('-->')
    const start = parseTimestamp(rawStart)
    const end = parseTimestamp(rawEnd.trim().split(/\s+/)[0] ?? '')
    if (start === null) continue
    const text = cleanLyric(rows.slice(timing + 1).join(' '))
    if (!text) continue
    if (lines.at(-1)?.text === text) continue
    lines.push({ start, end: end ?? start + 4, text })
  }
  return lines.sort((a, b) => a.start - b.start)
}

/** The line being sung, or -1 before the first one. */
export function activeLineIndex(lines: LyricLine[], seconds: number) {
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= seconds + 0.15) active = i
    else break
  }
  return active
}

/**
 * Prefers uploaded captions in the song's own language (yt-dlp marks the
 * original auto-generated track `<lang>-orig`), then English, then any
 * uploaded track, then the auto-generated one.
 */
export function pickCaptionTrack(tracks: CaptionTrack[]) {
  const manual = tracks.filter((track) => !track.auto_generated)
  const auto = tracks.find((track) => track.auto_generated)
  const original = auto?.lang.replace(/-orig$/, '').split('-')[0]
  const language = (track: CaptionTrack) => track.lang.split('-')[0]
  return (
    (original && manual.find((track) => language(track) === original)) ||
    manual.find((track) => language(track) === 'en') ||
    manual[0] ||
    auto ||
    null
  )
}
