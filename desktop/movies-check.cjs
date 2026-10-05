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
    if (!after.enabled || after.playback_available || after.catalogue_available) throw new Error('Movies settings did not take effect');
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
    ['#/movies/home', '.movies-hero'],
    ['#/music/home', '.music-app'],
    ['#/', '.yt-topbar'],
    ['#/movies/settings', '.settings-page--movies'],
    ['#/movies/home', '.movies-hero'],
  ]) {
    await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(route)}`)
    await waitFor(selector)
  }
  await waitFor('.experience-switch button[title="Movies experience preview"]')
  await waitFor('html[data-experience="movies"] .movies-hero')
  // DOM navigation can complete before Chromium presents the final frame.
  await new Promise((resolve) => setTimeout(resolve, 600))
  const ready = await window.webContents.executeJavaScript(`location.hash === '#/movies/home' && document.querySelector('.movies-setup')?.textContent.includes('Ready for the Next Chapter')`)
  if (!ready) throw new Error('Movies preview did not settle in its enabled state')
  report('MUSICBOX_MOVIES_CHECK_OK ' + JSON.stringify(result))
}

module.exports = { checkMovies }
