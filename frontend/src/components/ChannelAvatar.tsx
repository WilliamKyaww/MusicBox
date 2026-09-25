type ChannelAvatarProps = {
  name: string
  url: string | null | undefined
  size?: number
  href?: string | null
}

export function ChannelAvatar({ name, url, size = 36, href }: ChannelAvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  const content = url ? (
    <img
      className="yt-avatar"
      src={url}
      alt=""
      style={style}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="yt-avatar yt-avatar--fallback" style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )

  if (!href) return content

  return (
    <a className="yt-avatar-link" href={href} aria-label={`Go to ${name}`}>
      {content}
    </a>
  )
}
