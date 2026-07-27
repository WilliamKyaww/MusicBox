import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getVideoStreamUrl } from '../api/streaming'
import { YouTubeIcon } from './Icons'

type VideoPlayerModalProps = {
  videoId: string
  title: string
  channelTitle: string | null
  sourceUrl: string | null
  onClose: () => void
}

export function VideoPlayerModal({
  videoId,
  title,
  channelTitle,
  sourceUrl,
  onClose,
}: VideoPlayerModalProps) {
  // App keys this component by video id, so a new video remounts it with a
  // fresh attempt at the direct stream.
  const [useEmbedFallback, setUseEmbedFallback] = useState(false)
  const [hasStreamError, setHasStreamError] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const watchUrl = sourceUrl || `https://www.youtube.com/watch?v=${videoId}`

  return createPortal(
    <div className="video-modal" role="presentation" onClick={onClose}>
      <div
        className="video-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Watching ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="video-modal__header">
          <div className="video-modal__heading">
            <h3>{title}</h3>
            {channelTitle ? <p>{channelTitle}</p> : null}
          </div>
          <button
            type="button"
            className="video-modal__close"
            onClick={onClose}
            aria-label="Close video player"
          >
            x
          </button>
        </div>

        <div className="video-modal__stage">
          {useEmbedFallback ? (
            <iframe
              className="video-modal__frame"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
              title={title}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              className="video-modal__video"
              src={getVideoStreamUrl(videoId)}
              controls
              autoPlay
              playsInline
              onError={() => setHasStreamError(true)}
            />
          )}
        </div>

        {hasStreamError && !useEmbedFallback ? (
          <p className="video-modal__error" role="alert">
            The direct stream could not be played. Try the YouTube player instead.
          </p>
        ) : null}

        <div className="video-modal__footer">
          <button
            type="button"
            className="video-modal__button"
            onClick={() => setUseEmbedFallback((current) => !current)}
          >
            {useEmbedFallback ? 'Use direct stream' : 'Use YouTube player'}
          </button>
          <a
            className="video-modal__button video-modal__button--link"
            href={watchUrl}
            target="_blank"
            rel="noreferrer"
          >
            <YouTubeIcon className="action-icon" />
            Open on YouTube
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}
