async function waitFor(window, script, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(script)) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('The dual-experience desktop check timed out waiting for: ' + script)
}

async function checkExperiences(window, videoId, report) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId ?? '')) throw new Error('A video ID is required for the music playback check.')
  // All smoke launches use a disposable profile/library; never seed the user's library.
  const playlistId = await window.webContents.executeJavaScript(`(async () => {
    const json = async (url, options) => {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Smoke fixture API failed: ' + response.status);
      return response.json();
    };
    const video = await json('/api/videos/${videoId}');
    const playlist = await json('/api/playlists', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Desktop playback check'})});
    await json('/api/playlists/' + playlist.id + '/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({video_id:video.id, title:video.title, channel_title:video.channel_title, thumbnail_url:video.thumbnail_url, source_url:video.video_url || 'https://www.youtube.com/watch?v=${videoId}', duration_label:video.duration_label})});
    return playlist.id;
  })()`)
  // A changed query forces a document load; a hash-only navigation keeps stale API state.
  await window.loadURL('musicbox://app/?smokeMusic=1#/music/playlist?id=' + encodeURIComponent(playlistId))
  await waitFor(window, `!!document.querySelector('.music-round-play:not(:disabled)')`)
  await window.webContents.executeJavaScript(`document.querySelector('.music-round-play').click()`, true)
  await waitFor(window, `document.querySelector('.audio-player audio')?.currentTime > 1`, 60000)
  const initial = await window.webContents.executeJavaScript(`document.querySelector('.audio-player audio').currentTime`)
  await window.webContents.executeJavaScript(`document.querySelector('.experience-switch button[title="YouTube-style video experience"]').click()`, true)
  await waitFor(window, `!!document.querySelector('.yt-topbar')`)
  await window.webContents.executeJavaScript(`document.querySelector('.experience-switch button[title="Spotify-style music experience"]').click()`, true)
  await waitFor(window, `!!document.querySelector('.music-app')`)
  await new Promise(resolve => setTimeout(resolve, 10000))
  const final = await window.webContents.executeJavaScript(`(() => {
    const audio = document.querySelector('.audio-player audio');
    return {time:audio?.currentTime, paused:audio?.paused, error:audio?.error?.code ?? null, players:document.querySelectorAll('.audio-player audio').length, music:!!document.querySelector('.music-app')};
  })()`)
  if (!final.music || final.players !== 1 || final.error || final.paused || final.time < initial + 8) throw new Error('Music playback did not survive switching views: ' + JSON.stringify(final))
  report('MUSICBOX_EXPERIENCES_CHECK_OK ' + JSON.stringify({initial, ...final}))
}

module.exports = { checkExperiences }
