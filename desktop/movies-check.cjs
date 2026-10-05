async function checkMovies(window, report) {
  // Called only in --smoke-test with a disposable config, profile and data directory.
  const result = await window.webContents.executeJavaScript(`(async () => {
    const json = async (path, options) => {
      const response = await fetch(path, options);
      if (!response.ok) throw new Error('Movies smoke API failed: ' + response.status);
      return response.json();
    };
    const before = await json('/api/movies/status');
    if (before.enabled || before.playback_available || before.catalogue_available) throw new Error('Unexpected default Movies capabilities');
    const response = await fetch('/api/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({values:{MOVIES_ENABLED:true}}) });
    if (response.status !== 403) throw new Error('Settings write guard was not enforced');
    await json('/api/settings', {method:'PUT', headers:{'Content-Type':'application/json','X-MusicBox-Settings':'1'}, body:JSON.stringify({values:{MOVIES_ENABLED:true}})});
    const after = await json('/api/movies/status');
    if (!after.enabled || after.playback_available || !after.catalogue_available) throw new Error('Movies settings did not take effect');
    window.dispatchEvent(new Event('musicbox-movies-settings-changed'));
    return after;
  })()`)
  const waitFor = async (selector) => {
    for (let i = 0; i < 100; i++) {
      if (await window.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Movies smoke interface timeout: ' + selector)
  }
  for (const [route, selector] of [
    ['#/movies/home', '.movies-feature'],
    ['#/music/home', '.music-app'],
    ['#/', '.yt-topbar'],
    ['#/movies/settings', '.settings-page--movies'],
    ['#/movies/home', '.movies-feature'],
  ]) {
    await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(route)}`)
    await waitFor(selector)
  }
  await waitFor('.experience-switch button[title="Movies and TV experience"]')
  await waitFor('html[data-experience="movies"] .movies-feature')
  // DOM navigation can complete before Chromium presents the final frame.
  await new Promise((resolve) => setTimeout(resolve, 600))
  const ready = await window.webContents.executeJavaScript(`location.hash === '#/movies/home' && !!document.querySelector('.movies-feature') && !!document.querySelector('.movies-secondary')`)
  if (!ready) throw new Error('Movies preview did not settle in its enabled state')
  if (process.env.MUSICBOX_SMOKE_MOVIE_FILE) {
    const path = require('node:path')
    const fs = require('node:fs')
    const fixture = path.resolve(process.env.MUSICBOX_SMOKE_MOVIE_FILE)
    if (!fs.statSync(fixture).isFile()) throw new Error('Movie smoke fixture does not exist')
    const registered = await window.webContents.executeJavaScript(`(async () => {
      const json = async (url, options) => { const response = await fetch(url, options); if (!response.ok) throw new Error('Movie playback smoke API failed: ' + response.status); return response.json(); };
      await json('/api/settings', {method:'PUT',headers:{'Content-Type':'application/json','X-MusicBox-Settings':'1'},body:JSON.stringify({values:{MOVIES_MEDIA_DIR:${JSON.stringify(path.dirname(fixture))}}})});
      const title = await json('/api/movies/library', {method:'POST',headers:{'Content-Type':'application/json','X-MusicBox-Movies':'1'},body:JSON.stringify({title:'Original smoke-test film',relative_path:${JSON.stringify(path.basename(fixture))},rights_confirmed:true,intro_start:1,intro_end:3})});
      const profiles = await json('/api/movies/profiles');
      return {id:title.id,profile:profiles[0].id};
    })()`)
    await window.webContents.executeJavaScript(`location.hash = '#/movies/watch?id=' + encodeURIComponent(${JSON.stringify(registered.id)})`)
    await waitFor('.movies-player-frame video')
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await window.webContents.executeJavaScript(`document.querySelector('.movies-player-frame video')?.currentTime > 0.2`)) break
      if (attempt === 99) throw new Error('Registered movie did not play in Electron')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await window.webContents.executeJavaScript(`(() => {const video=document.querySelector('.movies-player-frame video');video.currentTime=10;video.pause();})()`)
    let saved = false
    for (let attempt = 0; attempt < 50; attempt++) {
      saved = await window.webContents.executeJavaScript(`fetch('/api/movies/profiles/${registered.profile}/history').then(r=>r.json()).then(items=>items.some(i=>i.progress?.position>=9))`)
      if (saved) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!saved) throw new Error('Movie progress did not persist in packaged backend')
    report('MUSICBOX_MOVIE_PLAYBACK_OK')
    await window.webContents.executeJavaScript(`location.hash = '#/movies/home'`)
    await waitFor('.movies-feature')
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  report('MUSICBOX_MOVIES_CHECK_OK ' + JSON.stringify(result))
}

module.exports = { checkMovies }
