async function checkPlayback(window, videoId, report = console.log) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid playback check video ID.')
  await window.webContents.executeJavaScript(`location.hash = '#/watch?v=${videoId}'`, true)
  const deadline = Date.now() + 60000
  let status
  while (Date.now() < deadline) {
    status = await window.webContents.executeJavaScript(`(() => {
      const video = document.querySelector('.yt-player__video');
      const audio = document.querySelector('.yt-player audio');
      const read = media => media && ({time: media.currentTime, ready: media.readyState, error: media.error?.code ?? null});
      return {video: read(video), audio: read(audio), embed: !!document.querySelector('.yt-player__embed')};
    })()`)
    if (status.video?.ready >= 2 && status.video.time > 1 && (!status.audio || status.audio.time > 1)) {
      report('MUSICBOX_PLAYBACK_CHECK_OK ' + JSON.stringify(status))
      await checkContinuousPlayback(window, report)
      await checkPlaybackControls(window, report)
      if (process.env.MUSICBOX_SMOKE_EMBED === '1') await checkEmbed(window, report)
      return
    }
    if (status.embed) throw new Error('Playback fell back to the embed: ' + JSON.stringify(status))
    await window.webContents.executeJavaScript("document.querySelector('.yt-player__big-play[aria-label=\"Play\"]')?.click()", true)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Playback check timed out: ' + JSON.stringify(status))
}

async function checkContinuousPlayback(window, report, seconds = Number(process.env.MUSICBOX_SMOKE_DURATION || 30), phase = 'foreground') {
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 120) throw new Error('Invalid playback check duration.')
  const read = () => window.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('.yt-player__video');
    const audio = document.querySelector('.yt-player audio');
    const state = media => media && ({
      time: media.currentTime, ready: media.readyState, paused: media.paused,
      error: media.error?.code ?? null,
      buffered: Array.from({length: media.buffered.length}, (_, i) => [media.buffered.start(i), media.buffered.end(i)]),
    });
    return {video: state(video), audio: state(audio), height: video?.videoHeight};
  })()`)
  const first = await read()
  const started = Date.now()
  let last = first
  let stalledSamples = 0
  while (Date.now() - started < seconds * 1000) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const current = await read()
    if (!current.video || current.video.error || current.audio?.error) {
      throw new Error('Playback failed during sustained check: ' + JSON.stringify(current))
    }
    if (current.video.time - last.video.time < 0.1) stalledSamples += 1
    last = current
  }
  const elapsed = (Date.now() - started) / 1000
  const advanced = last.video.time - first.video.time
  report('MUSICBOX_SUSTAINED_PLAYBACK ' + JSON.stringify({phase, elapsed, advanced, stalledSamples, first, last}))
  if (advanced < elapsed * 0.85) throw new Error('Playback spent too much time buffering.')
  if (last.audio && Math.abs(last.audio.time - last.video.time) > 0.5) throw new Error('Audio and video drifted out of sync.')
}

async function checkPlaybackControls(window, report) {
  const read = () => window.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('.yt-player__video');
    const audio = document.querySelector('.yt-player audio');
    return {time: video?.currentTime, duration: video?.duration, paused: video?.paused,
      ready: video?.readyState, audioTime: audio?.currentTime, audioPaused: audio?.paused};
  })()`)
  await window.webContents.executeJavaScript(`document.querySelector('.yt-player [aria-label="Pause (k)"]').click()`, true)
  const paused = await read()
  await new Promise(resolve => setTimeout(resolve, 1500))
  const stillPaused = await read()
  if (!stillPaused.paused || stillPaused.audioPaused === false || Math.abs(stillPaused.time - paused.time) > 0.1) {
    throw new Error('Pause did not hold both streams.')
  }
  // Use the actual player keyboard handler, not direct media-element seeks.
  await window.webContents.executeJavaScript(`(() => {
    document.querySelector('.yt-player [aria-label="Play (k)"]').click();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: '7', bubbles: true}));
  })()`, true)
  const target = paused.duration * 0.7
  const deadline = Date.now() + 30000
  let resumed = false
  while (Date.now() < deadline) {
    const state = await read()
    if (state.time > target + 1 && !state.paused && (state.audioTime === undefined || Math.abs(state.audioTime - state.time) < 0.5)) {
      resumed = true
      break
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!resumed) throw new Error('Playback did not resume after seeking beyond the initial buffer.')
  await checkContinuousPlayback(window, report, 10, 'after-seek')
  window.minimize()
  try {
    await checkContinuousPlayback(window, report, 15, 'minimized')
  } finally {
    window.restore()
  }
  report('MUSICBOX_PLAYBACK_CONTROLS_OK')
}

async function checkEmbed(window, report) {
  await window.webContents.executeJavaScript(`(() => {
    document.querySelector('.yt-player [aria-label="Pause (k)"]')?.click();
    document.querySelector('.yt-player [aria-label="Settings"]')?.click();
  })()`, true)
  await new Promise((resolve) => setTimeout(resolve, 300))
  await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.yt-player button')].find(b => b.textContent.includes('Use YouTube player'));
    if (!button) throw new Error('YouTube player switch is unavailable.');
    button.click();
  })()`, true)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const frame = window.webContents.mainFrame.frames.find(f => f.url.startsWith('https://www.youtube-nocookie.com/embed/'))
    if (frame) {
      const state = await frame.executeJavaScript(`(() => {
        const video = document.querySelector('video');
        return { ready: video?.readyState ?? 0, error153: document.body.innerText.includes('Error 153') };
      })()`).catch(() => null)
      if (state?.error153) throw new Error('YouTube embed still reports error 153.')
      if (state?.ready >= 2) {
        report('MUSICBOX_EMBED_CHECK_OK')
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('YouTube embed did not load playable media during the check.')
}

module.exports = { checkPlayback }
