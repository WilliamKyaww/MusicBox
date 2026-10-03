const shapes = {
  home: 'M3 10 12 3l9 7v10H15v-7H9v7H3Z',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  browse: 'M4 4h16v16H4ZM9 4v16M4 9h5',
  library: 'M4 4v16M9 4v16M14 5l5-1 3 15-5 1Z',
  heart: 'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z',
  play: 'm8 4 13 8-13 8Z',
  pause: 'M7 4h3v16H7ZM14 4h3v16h-3Z',
  next: 'M5 4l11 8-11 8ZM19 4v16',
  previous: 'M19 4 8 12l11 8ZM5 4v16',
  shuffle: 'M3 7h3c5 0 7 10 12 10h3m-3-3 3 3-3 3M3 17h3c2 0 3-1.5 4.2-3.5M21 7h-3c-2 0-3 1.5-4.2 3.5M18 4l3 3-3 3',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 13v2a3 3 0 0 1-3 3H4m3 3-3-3 3-3',
  plus: 'M12 4v16M4 12h16',
  'plus-circle': 'M12 8v8M8 12h8M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  'check-circle': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM7.5 12l3 3 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  queue: 'M3 5h18M3 11h11M3 17h8m6-3 5 3-5 3Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  clock: 'M12 7v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  pin: 'm8 3 8 0-1 7 4 4H5l4-4ZM12 14v8',
  folder: 'M3 6h7l2 2h9v12H3ZM3 6V3h7l2 3',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  back: 'm15 5-7 7 7 7',
  forward: 'm9 5 7 7-7 7',
  more: 'M4 12h1m6 0h1m6 0h1',
  music:
    'M9 17V5l11-2v12M9 8l11-2M9 17c0 3-6 4-6 1s6-4 6-1Zm11-2c0 3-6 4-6 1s6-4 6-1Z',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  artist: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  album: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  check: 'm4 12 5 5L20 6',
  video: 'M3 5h18v14H3Zm6 4 6 3-6 3Z',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  'now-playing': 'M4 3h16v18H4ZM8 7h8v7H8ZM8 17h5',
  fullscreen: 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6',
  minimize: 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6',
  volume: 'M4 9h4l5-5v16l-5-5H4ZM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14',
  'volume-low': 'M4 9h4l5-5v16l-5-5H4ZM16 8a5 5 0 0 1 0 8',
  'volume-off': 'M4 9h4l5-5v16l-5-5H4ZM16 9l6 6M22 9l-6 6',
  radio: 'M4 9h16v12H4ZM8 9l10-6M14 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  edit: 'M4 20h4L19 9l-4-4L4 16ZM13 7l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V3h6v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  compact: 'M3 5h18M3 10h18M3 15h18M3 20h18',
  grid: 'M3 3h8v8H3ZM13 3h8v8h-8ZM3 13h8v8H3ZM13 13h8v8h-8Z',
  moon: 'M20 15A9 9 0 1 1 9 4a7 7 0 0 0 11 11Z',
  verified: 'm12 2 2.6 2.2 3.4-.3.8 3.3 2.9 1.8-1.4 3.1 1.4 3.1-2.9 1.8-.8 3.3-3.4-.3L12 22l-2.6-2.2-3.4.3-.8-3.3-2.9-1.8L3.7 12 2.3 8.9l2.9-1.8.8-3.3 3.4.3ZM8 12l3 3 5-6',
  sparkle: 'M12 3c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8Z',
  keyboard: 'M2 6h20v12H2ZM6 10h1M10 10h1M14 10h1M18 10h1M7 14h10',
  sort: 'M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4',
  speaker: 'M4 9h4l5-5v16l-5-5H4ZM16 8a5 5 0 0 1 0 8',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const
export type MusicIconName = keyof typeof shapes
/** Icons drawn as filled shapes rather than outlines when `filled` is set. */
const FILLABLE: MusicIconName[] = ['heart', 'play', 'pause', 'next', 'previous', 'home', 'library', 'search', 'pin']
export function MusicIcon({
  name,
  filled = false,
}: {
  name: MusicIconName
  filled?: boolean
}) {
  const fill = filled && FILLABLE.includes(name)
  const solid = name === 'check-circle' || name === 'verified'
  return (
    <svg className="music-icon" viewBox="0 0 24 24" aria-hidden="true">
      {solid ? (
        <>
          <path
            d={shapes[name].split('Z')[0] + 'Z'}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d={shapes[name].split('Z').slice(1).join('Z')}
            fill="none"
            stroke="var(--music-icon-contrast, #000)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path
          d={shapes[name]}
          fill={fill ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
