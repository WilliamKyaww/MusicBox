import { hueStyle } from '../helpers'
import { useStickyHeader } from '../hooks'
import { LyricsLines } from '../LyricsLines'
import { MusicIcon } from '../MusicIcon'
import { useMusic } from '../MusicContext'
import { hueFor } from '../recommend'
import { ArtistLink } from '../TrackList'

export function LyricsView() {
  const { currentVideo } = useMusic()
  const hue = currentVideo ? hueFor(currentVideo.channel_title || currentVideo.id) : 200
  useStickyHeader({ title: currentVideo ? `Lyrics: ${currentVideo.title}` : 'Lyrics', hue })
  return (
    <div className="music-lyrics" style={hueStyle(hue)}>
      {currentVideo ? (
        <>
          <header className="music-lyrics__header">
            <span className="music-collection__type">Lyrics</span>
            <h1>{currentVideo.title}</h1>
            <ArtistLink video={currentVideo} />
          </header>
          <LyricsLines key={currentVideo.id} videoId={currentVideo.id} />
          <p className="music-lyrics__source">Lyrics come from this video's YouTube captions.</p>
        </>
      ) : (
        <div className="music-lyrics__status">
          <MusicIcon name="mic" />
          <p>Play a song to see its lyrics here.</p>
        </div>
      )}
    </div>
  )
}
