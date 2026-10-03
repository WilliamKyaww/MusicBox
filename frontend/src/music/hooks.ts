import { useEffect, useState } from 'react'
import { useMusic, type PlaySource, type StickyHeader } from './MusicContext'
import { usePlayback } from './playback'

export function useIsPlaying(videoId: string | undefined) {
  return usePlayback((state) =>
    Boolean(videoId && state.videoId === videoId && state.isPlaying),
  )
}

/** Whether a context (playlist, artist...) is the one playing, so its play button can pause it. */
export function useContextPlayback(kind: PlaySource['kind'], id: string) {
  const { session } = useMusic()
  const isPlaying = usePlayback((state) => state.isPlaying)
  const current = Boolean(
    id && session?.context?.kind === kind && session.context.id === id,
  )
  return {
    current,
    playing: current && isPlaying,
    shuffled: current && Boolean(session?.shuffle),
  }
}

/** Becomes true once the element nears the viewport, so costly searches wait until needed. */
export function useInView<T extends Element>(rootMargin = '300px') {
  const [node, setNode] = useState<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!node || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, inView, rootMargin])
  return [setNode, inView] as const
}

/** Shows the title and play button in the top bar once the page header scrolls away. */
export function useStickyHeader(header: StickyHeader) {
  const { setStickyHeader } = useMusic()
  useEffect(() => {
    setStickyHeader(header)
  })
  useEffect(() => () => setStickyHeader(null), [setStickyHeader])
}
