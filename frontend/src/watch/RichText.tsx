import type { ReactNode } from 'react'
import { parseTimecode } from '../downloadSections'
import { paths } from '../router'

type RichTextProps = {
  text: string
  onSeek: (seconds: number) => void
}

const TOKEN_PATTERN =
  /(https?:\/\/[^\s<>()]+[^\s<>().,!?])|(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)|((?:^|(?<=\s))#[\p{L}\p{N}_]+)/gu

/** Descriptions and comments with clickable timestamps, links and hashtags. */
export function RichText({ text, onSeek }: RichTextProps) {
  const parts: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push(text.slice(lastIndex, index))
    const [token, url, timestamp, hashtag] = match

    if (url) {
      parts.push(
        <a key={index} href={url} target="_blank" rel="noreferrer">
          {url.replace(/^https?:\/\/(www\.)?/, '')}
        </a>,
      )
    } else if (timestamp) {
      const seconds = parseTimecode(timestamp)
      parts.push(
        seconds === null ? (
          timestamp
        ) : (
          <button
            key={index}
            type="button"
            className="rich-text__timestamp"
            onClick={() => onSeek(seconds)}
          >
            {timestamp}
          </button>
        ),
      )
    } else if (hashtag) {
      parts.push(
        <a key={index} href={paths.results(hashtag)}>
          {hashtag}
        </a>,
      )
    } else {
      parts.push(token)
    }
    lastIndex = index + token.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <>{parts}</>
}
