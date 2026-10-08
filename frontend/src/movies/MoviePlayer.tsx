import { useEffect, useRef, useState } from 'react'
import { getApiHref } from '../api/client'
import { type Movie, type MovieSession, errorText, idPath, movieApi } from './api'
import { moviesPath } from './routes'
import { MovieFailure, MovieLoading } from './ui'

export function MoviePlayer({ id, profile, onPlay }: { id: string; profile: string; onPlay: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const current = useRef<MovieSession | null>(null)
  const sequence = useRef(0)
  const position = useRef(0)
  const [session, setSession] = useState<MovieSession | null>(null)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [next, setNext] = useState<Movie | null>(null)
  const [autoplay, setAutoplay] = useState(false)
  const [autoStart, setAutoStart] = useState(true)
  const [time, setTime] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [asset, setAsset] = useState('')
  const qualityPosition = useRef<number | null>(null)
  const checkpoint = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { checkpoint.current = async () => {
    const active = current.current
    if (!active || !Number.isFinite(position.current)) return
    try {
      await movieApi.put(`/profiles/${profile}/progress/${idPath(id)}`, { session_id: active.session_id, sequence: ++sequence.current,
        position: position.current, duration: active.duration }, true)
      setSaveError('')
    } catch { setSaveError('Progress could not be saved. Keep this page open and try again.') }
  } })
  useEffect(() => {
    let disposed = false
    movieApi.post<MovieSession>(`/profiles/${profile}/playback/${idPath(id)}${asset ? `?asset_id=${asset}` : ''}`)
      .then(data => { if (!disposed) { current.current = data; sequence.current = 0; setSession(data); setError('') } })
      .catch(e => { if (!disposed) setError(errorText(e)) })
    const save = () => { void checkpoint.current() }
    const timer = window.setInterval(save, 5000)
    window.addEventListener('pagehide', save)
    const background = () => { if (document.visibilityState === 'hidden') save() }
    document.addEventListener('visibilitychange', background)
    const competing = (event: Event) => { if (event.target !== video.current && event.target instanceof HTMLMediaElement) video.current?.pause() }
    document.addEventListener('play', competing, true)
    document.documentElement.dataset.moviePlayer = 'active'
    return () => { disposed = true; save(); window.clearInterval(timer); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', background); document.removeEventListener('play', competing, true); delete document.documentElement.dataset.moviePlayer }
  }, [id, profile, asset, attempt])
  useEffect(() => {
    if (!session?.title.show_id) return
    let active = true
    const title = session.title
    movieApi.get<Movie[]>(`/titles/${idPath(title.show_id!)}/seasons/${title.season}`).then(async items => {
      let candidate = items.find(i => (i.episode ?? 0) > (title.episode ?? 0))
      if (!candidate) {
        const show = await movieApi.get<Movie>(`/titles/${idPath(title.show_id!)}`)
        const season = show.seasons.find(s => s.number > (title.season ?? 0))
        if (season) candidate = (await movieApi.get<Movie[]>(`/titles/${idPath(title.show_id!)}/seasons/${season.number}`))[0]
      }
      if (active) setNext(candidate?.playable ? candidate : null)
    }).catch(() => {})
    return () => { active = false }
  }, [session])
  useEffect(() => {
    if (!ended || !autoplay || !next) return
    const timer = window.setTimeout(() => { window.location.hash = moviesPath('watch', next.id) }, 5000)
    return () => window.clearTimeout(timer)
  }, [ended, autoplay, next])
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.current?.requestFullscreen() } catch { setError('Fullscreen is unavailable in this window.') } }
  const activeAsset = session?.title.assets.find(a => a.id === session.asset_id)
  return <div className="movies-player-page"><a className="movies-back" href={moviesPath('details', id)}>Back to title</a>
    {!session && !error && <MovieLoading />}{error && <MovieFailure text={error} retry={() => { setError(''); setAttempt(a => a + 1) }} />}
    {session && <><h2>{session.title.title}</h2><div className="movies-player-frame" ref={frame} tabIndex={0} aria-label="Movie player. Space to play or pause, arrows to seek, F for fullscreen." onKeyDown={e => {
      if (e.target !== frame.current && e.target !== video.current) return
      const element = video.current; if (!element) return
      if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); if (element.paused) void element.play().catch(() => {}); else element.pause() }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); element.currentTime = Math.max(0, Math.min(element.duration || 0, element.currentTime + (e.key === 'ArrowRight' ? 10 : -10))) }
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); void fullscreen() }
      if (e.key.toLowerCase() === 'm') element.muted = !element.muted
    }}>
      <video key={`${session.session_id}:${session.asset_id}`} ref={video} controls playsInline autoPlay={autoStart} preload="metadata" src={session.source_type === 'remote' ? session.url : getApiHref(session.url)}
        onLoadedMetadata={() => { const element = video.current!; element.currentTime = Math.min(qualityPosition.current ?? session.resume, Math.max(0, (element.duration || session.duration) - 1)); qualityPosition.current = null; position.current = element.currentTime; setWaiting(false) }}
        onTimeUpdate={() => { position.current = video.current?.currentTime ?? position.current; setTime(position.current) }}
        onPlay={() => { onPlay(); setEnded(false); setWaiting(false) }} onPlaying={() => setWaiting(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)}
        onPause={() => void checkpoint.current()} onSeeked={() => { position.current = video.current?.currentTime ?? 0; void checkpoint.current() }}
        onEnded={() => { position.current = session.duration; setEnded(true); void checkpoint.current() }}
        onError={() => setError(session.source_type === 'remote' ? 'The creator-hosted stream could not play. Check your connection or try another available quality. No unverified fallback provider will be used.' : 'Playback failed. Check the registered file and use a browser-compatible MP4 or WebM. No alternative streams will be fetched.')}>
        {session.subtitles.map((track, index) => <track key={track.name} kind="subtitles" src={getApiHref(track.url)} label={track.label} srcLang={/^[a-z]{2}$/.test(track.label) ? track.label : 'und'} default={index === 0} />)}
      </video>{waiting && <span className="movies-buffering" role="status">Buffering...</span>}
    </div><div className="movies-player-options"><button onClick={() => void fullscreen()}>Fullscreen</button>
      <button onClick={() => { if (video.current) video.current.currentTime = 0 }}>Start over</button>
      <label>Playback quality<select value={session.asset_id} onChange={async e => { const selected = e.target.value; setAutoStart(!video.current?.paused); video.current?.pause(); qualityPosition.current = video.current?.currentTime ?? 0; await checkpoint.current(); setAsset(selected) }}>{session.title.assets.filter(a => a.available).map(a => <option key={a.id} value={a.id}>{a.label} / {a.video_codec}</option>)}</select></label>
      {!!activeAsset?.intro_end && time >= (activeAsset.intro_start ?? 0) && time < activeAsset.intro_end && <button onClick={() => { if (video.current) video.current.currentTime = activeAsset.intro_end! }}>Skip intro</button>}
      <label>Speed<select defaultValue="1" onChange={e => { if (video.current) video.current.playbackRate = Number(e.target.value) }}>{[0.75, 1, 1.25, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}x</option>)}</select></label>
      {next && <><a className="movies-action" href={moviesPath('watch', next.id)}>Next episode</a><label className="movies-check"><input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} />Autoplay next episode</label></>}
    </div>{ended && <p role="status">{autoplay && next ? 'Next episode starts in five seconds. Turn off autoplay to cancel.' : 'Finished watching.'}</p>}
    {saveError && <div role="alert">{saveError} <button onClick={() => void checkpoint.current()}>Retry saving progress</button></div>}
    {session.title.online_source && <p className="movies-notice">{session.title.online_source.attribution} / <a href={session.title.online_source.licence_url} target="_blank" rel="noreferrer">{session.title.online_source.licence}</a>. Complete film credits retained.</p>}
    <p className="movies-notice">Native video controls include volume, seeking and available subtitles. Quality choices are registered files or creator-provided variants, not automatic adaptive streaming. Space/K: play/pause; arrows: seek; F: fullscreen; M: mute.</p></>}
  </div>
}
