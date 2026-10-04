type IconProps = {
  className?: string
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2m-7 3v8m4-8v8m4-8v8M7 7l1 12h8l1-12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 19V5m0 0-5 5m5-5 5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ArrowDownIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14m0 0-5-5m5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 11 5-5 4 4 3-3 5 5M9.5 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m5 13 4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m4 20 4.5-1 9-9a2.12 2.12 0 0 0-3-3l-9 9L4 20Zm10-12 3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  )
}

export function PreviousIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h2v14H6zM9 12l10 7V5z" fill="currentColor" />
    </svg>
  )
}

export function NextIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 5h2v14h-2zM5 5v14l10-7z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor" />
    </svg>
  )
}

export function RepeatIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 2.8 21.2 7 17 11.2V8H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5h10V2.8ZM7 21.2 2.8 17 7 12.8V16h10a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5H7v3.2Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ShuffleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 3h4v4h-2V6.4l-4.9 4.9-1.4-1.4L17.6 5H17V3ZM3 7h3.6c1.8 0 3.4.9 4.4 2.4l1.6 2.4A3.4 3.4 0 0 0 15.4 13H17v-1.6l4 3.6-4 3.6V17h-1.6a7.4 7.4 0 0 1-6.1-3.3L7.7 11.3A3.4 3.4 0 0 0 4.8 10H3V7Zm0 7h1.8c.9 0 1.8-.4 2.4-1l1.3 1.6A5.3 5.3 0 0 1 4.8 17H3v-3Zm12-7h2.6L15.9 8.7a5.3 5.3 0 0 1-2.7 1.5L12 8.4A3.4 3.4 0 0 0 15 7Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.41 1.41M7.05 16.95l-1.41 1.41m12.72 0-1.41-1.41M7.05 7.05 5.64 5.64M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function MusicNoteIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function YouTubeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.4 7.2a3 3 0 0 0-2.1-2.1C17.4 4.6 12 4.6 12 4.6s-5.4 0-7.3.5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 2.1 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 7.3.5 7.3.5s5.4 0 7.3-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 21.9 12a31 31 0 0 0-.5-4.8ZM10 15.4V8.6l5.8 3.4L10 15.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ListIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function VolumeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11 5 6 9H2v6h4l5 4V5zm8.07.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function FilledIcon({ className, d }: IconProps & { d: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

export function MenuIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
}

export function HomeIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M12 3 3 10.5V21h6.5v-6h5v6H21V10.5L12 3Zm7 16h-2.5v-6h-9v6H5v-7.6l7-5.9 7 5.9V19Z" />
}

export function SubscriptionsIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M4 2h16v2H4V2Zm-1 5h18v14H3V7Zm2 2v10h14V9H5Zm5 1.5 5 3.5-5 3.5v-7Z" />
}

export function HistoryIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M13 3a9 9 0 0 0-9 9H1l3.9 3.9L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12Z" />
}

export function SearchIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M10.5 4a6.5 6.5 0 1 0 4.05 11.59l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
}

export function CloseIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="m12.7 12 6.15-6.15-.7-.7L12 11.29 5.85 5.15l-.7.7L11.29 12l-6.14 6.15.7.7L12 12.71l6.15 6.14.7-.7L12.71 12Z" />
}

export function MoreVertIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M12 16.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0-6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0-6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
}

export function SettingsIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
}

export function FullscreenIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z" />
}

export function ExitFullscreenIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z" />
}

export function TheaterIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M19 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 10H5V8h14v8Z" />
}

export function PictureInPictureIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M19 11h-8v6h8v-6Zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2Zm-2 .02H3V4.97h18v14.05Z" />
}

export function CaptionsIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1Zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1Z" />
}

export function VolumeHighIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02ZM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z" />
}

export function VolumeLowIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02Z" />
}

export function VolumeMuteIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63Zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71ZM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3ZM12 4 9.91 6.09 12 8.18V4Z" />
}

export function ReplayIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8Z" />
}

export function ScissorsIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M9.64 7.64c.23-.5.36-1.05.36-1.64a4 4 0 1 0-4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14a4 4 0 1 0 4 4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64ZM6 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6-7.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1ZM19 3l-6 6 2 2 7-7V3h-3Z" />
}

export function ThumbUpIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M1 21h4V9H1v12Zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2Z" />
}

export function ShareIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M15 5.63 20.66 12 15 18.37V14h-1c-3.96 0-7.14 1-9.75 3.09 1.84-4.07 5.11-6.4 9.89-7.1l.86-.13V5.63M14 3v6C6.22 10.13 3.11 15.33 2 21c2.78-3.97 6.44-6 12-6v6l8-9-8-9Z" />
}

export function VerifiedIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.9 14.7-4.2-4.2 1.4-1.4 2.8 2.8 6.3-6.3 1.4 1.4-7.7 7.7Z" />
}

export function ChevronRightIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="m9.4 18.4-1.4-1.4 5-5-5-5 1.4-1.4 6.4 6.4-6.4 6.4Z" />
}

export function ChevronLeftIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="m14.6 18.4-6.4-6.4 6.4-6.4 1.4 1.4-5 5 5 5-1.4 1.4Z" />
}

export function ArrowLeftIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21v-2Z" />
}

export function FilterIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 6h18v2H3V6Zm3 5h12v2H6v-2Zm4 5h4v2h-4v-2Z" />
}

export function PlaylistPlayIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 10h11v2H3v-2Zm0-4h11v2H3V6Zm0 8h7v2H3v-2Zm13-1v8l6-4-6-4Z" />
}

export function LibraryIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6Zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm0 14H8V4h12v12ZM12 5.5v9l6-4.5-6-4.5Z" />
}

export function ExternalLinkIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7ZM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z" />
}

export function SortIcon({ className }: IconProps) {
  return <FilledIcon className={className} d="M3 18h6v-2H3v2ZM3 6v2h18V6H3Zm0 7h12v-2H3v2Z" />
}
