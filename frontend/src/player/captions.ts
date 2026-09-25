import { useEffect, useState } from 'react'

/**
 * Captions are fetched and drawn by the player itself instead of a <track>
 * element: that keeps them styled like YouTube's, lifts them above the controls,
 * and works when the API lives on another origin (a <track> would need CORS on
 * the video element, which googlevideo.com does not allow).
 */

export type CaptionCue = {
  start: number
  end: number
  text: string
}

function parseTimestamp(value: string) {
  const parts = value.trim().split(':')
  let seconds = 0
  for (const part of parts) {
    seconds = seconds * 60 + Number(part.replace(',', '.'))
  }
  return seconds
}

export function parseVtt(source: string): CaptionCue[] {
  const cues: CaptionCue[] = []
  const blocks = source.replace(/\r/g, '').split(/\n{2,}/)

  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue

    const [startText, rest] = lines[timingIndex].split('-->')
    const endText = rest.trim().split(/\s+/)[0]
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text) continue

    cues.push({ start: parseTimestamp(startText), end: parseTimestamp(endText), text })
  }

  return cues.sort((left, right) => left.start - right.start)
}

export function activeCueText(cues: CaptionCue[], time: number) {
  const lines: string[] = []
  for (const cue of cues) {
    if (cue.start > time) break
    if (cue.end > time) lines.push(cue.text)
  }
  // Auto-generated captions roll, so keep the two newest lines like YouTube does.
  return lines.slice(-2).join('\n')
}

type CaptionState = { url: string | null; cues: CaptionCue[] }

export function useCaptionCues(url: string | null) {
  const [state, setState] = useState<CaptionState>({ url: null, cues: [] })

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => setState({ url, cues: parseVtt(text) }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ url, cues: [] })
      })
    return () => controller.abort()
  }, [url])

  return state.url === url ? state.cues : []
}
