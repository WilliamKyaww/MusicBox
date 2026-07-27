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
