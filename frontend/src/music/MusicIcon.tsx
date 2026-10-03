const shapes = {
  home: 'M3 10 12 3l9 7v10H15v-7H9v7H3Z',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  library: 'M4 4v16M9 4v16M14 5l5-1 3 15-5 1Z',
  heart: 'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z',
  play: 'm8 4 13 8-13 8Z',
  plus: 'M12 4v16M4 12h16',
  close: 'm6 6 12 12M6 18 18 6',
  queue: 'M3 5h18M3 11h11M3 17h8m6-3 5 3-5 3Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  clock: 'M12 7v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  pin: 'm8 3 8 0-1 7 4 4H5l4-4ZM12 14v8',
  folder: 'M3 6h7l2 2h9v12H3ZM3 6V3h7l2 3',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  more: 'M4 12h1m6 0h1m6 0h1',
  music:
    'M9 17V5l11-2v12M9 8l11-2M9 17c0 3-6 4-6 1s6-4 6-1Zm11-2c0 3-6 4-6 1s6-4 6-1Z',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  artist: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  check: 'm4 12 5 5L20 6',
  video: 'M3 5h18v14H3Zm6 4 6 3-6 3Z',
} as const
export function MusicIcon({
  name,
  filled = false,
}: {
  name: keyof typeof shapes
  filled?: boolean
}) {
  return (
    <svg className="music-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={shapes[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
