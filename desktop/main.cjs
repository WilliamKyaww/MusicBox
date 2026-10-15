const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, protocol } = require('electron')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { startBackend } = require('./backend.cjs')
const {
  deviceDownloadId, isDeviceVideo, prepareDownloadFolder, reserveDownload, resolveDownloadFolder,
} = require('./downloads.cjs')
const { APP_ID, desktopRequestHeaders, proxyDesktopRequest } = require('./network.cjs')

app.setName('MusicBox')
app.setAppUserModelId(APP_ID)
const smokeTest = process.argv.includes('--smoke-test')
if (smokeTest) app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'musicbox-desktop-smoke-')))
const downloadSmoke = smokeTest && process.env.MUSICBOX_SMOKE_DOWNLOADS === '1'
if (downloadSmoke) {
  const directory = path.join(app.getPath('userData'), 'test-downloads')
  fs.mkdirSync(directory)
  app.setPath('downloads', directory)
}
protocol.registerSchemesAsPrivileged([{ scheme: 'musicbox', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }])
const appUrl = 'musicbox://app'
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; worker-src 'self' blob:"
let mainWindow
let backend
let quitting = false
let configFile
let dataDir
let logFile

function log(message) {
  fs.appendFileSync(logFile, message)
}

function openExternal(url) {
  try {
    const parsed = new URL(url)
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      void shell.openExternal(parsed.href).catch((error) => log(error.message + '\n'))
    }
  } catch { /* Ignore links with an unsupported format. */ }
}

function isInternalUrl(url) {
  const parsed = new URL(url)
  return parsed.protocol === 'musicbox:' && parsed.host === 'app'
}

// Files MusicBox reported as saved; only these may be revealed in the file manager.
const savedFiles = new Set()

/** The folder device downloads go to, created on demand (Downloads\MusicBox unless changed in Settings). */
function downloadFolder() {
  return prepareDownloadFolder(configFile, app.getPath('downloads'), (message) => log(`${message}\n`))
}

function registerDesktopBridge() {
  const fromApp = (event) => {
    try { return isInternalUrl(event.senderFrame?.url ?? '') } catch { return false }
  }
  const describeFolder = () => {
    const { folder, defaultFolder, isDefault } = downloadFolder()
    return { folder, defaultFolder, isDefault }
  }
  ipcMain.handle('musicbox:get-download-folder', (event) => (fromApp(event) ? describeFolder() : null))
  ipcMain.handle('musicbox:choose-download-folder', async (event) => {
    if (!fromApp(event) || !mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a download folder',
      defaultPath: downloadFolder().folder,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })
  ipcMain.handle('musicbox:open-download-folder', async (event) => {
    if (!fromApp(event)) return false
    return (await shell.openPath(downloadFolder().folder)) === ''
  })
  ipcMain.handle('musicbox:show-in-folder', (event, filePath) => {
    if (!fromApp(event) || !savedFiles.has(filePath) || !fs.existsSync(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  })
}

async function launch() {
  const repoRoot = process.env.MUSICBOX_REPO_ROOT || path.resolve(__dirname, '..')
  const userDir = app.getPath('userData')
  fs.mkdirSync(userDir, { recursive: true })
  const moviesSmoke = smokeTest && process.env.MUSICBOX_SMOKE_MOVIES === '1'
  configFile = app.isPackaged || moviesSmoke ? path.join(userDir, 'config.env') : path.join(repoRoot, 'backend/.env')
  dataDir = app.isPackaged || smokeTest ? path.join(userDir, 'data') : path.join(repoRoot, 'backend/data')
  if (!fs.existsSync(configFile)) {
    fs.copyFileSync(app.isPackaged ? path.join(process.resourcesPath, 'config.env.example') : path.join(__dirname, 'config.env.example'), configFile)
  }
  const logDir = path.join(userDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  logFile = path.join(logDir, 'backend.log')
  // Bound the log size between launches without touching the music library.
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) {
    fs.renameSync(logFile, path.join(logDir, `backend-${Date.now()}.log`))
  }
  // Create the download folder up front so it is already there the first time anything is saved.
  downloadFolder()
  registerDesktopBridge()
  const token = randomBytes(32).toString('hex')
  backend = await startBackend({
    packaged: app.isPackaged, resourcesPath: process.resourcesPath, repoRoot, configFile, dataDir, token,
  }, log, (code) => {
    log(`Backend exited unexpectedly: ${code}\n`)
    void dialog.showMessageBox({ type: 'error', title: 'MusicBox', message: 'The music service stopped.', detail: `Restart MusicBox. Details are in ${logFile}` }).then(() => app.quit())
  })
  const ownSession = session.fromPartition('persist:musicbox')
  ownSession.protocol.handle('musicbox', async (request) => {
    if (!isInternalUrl(request.url) || (request.initiatorOrigin && request.initiatorOrigin !== appUrl)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (downloadSmoke && new URL(request.url).pathname === '/api/downloads/direct' && new URL(request.url).searchParams.get('smoke_fixture') === '1') {
      return new Response('MusicBox download fixture', { headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="MusicBox test clip.mp4"' } })
    }
    const response = await proxyDesktopRequest(request, backend.baseUrl, token, fetch)
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Content-Security-Policy', contentSecurityPolicy)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders })
  })
  ownSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ requestHeaders: desktopRequestHeaders(details.url, details.requestHeaders, backend.baseUrl, token) })
  })
  ownSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(isInternalUrl(contents.getURL()) && ['fullscreen', 'clipboard-sanitized-write'].includes(permission))
  })
  ownSession.setPermissionCheckHandler((contents, permission) => Boolean(contents && isInternalUrl(contents.getURL()) && ['fullscreen', 'clipboard-sanitized-write'].includes(permission)))
  ownSession.on('will-download', (_event, item) => {
    let savePath
    const folder = downloadFolder().folder
    const deviceId = isInternalUrl(item.getURL()) ? deviceDownloadId(item.getURL()) : null
    try {
      if (isDeviceVideo(item)) {
        savePath = reserveDownload(folder, item.getFilename())
        item.setSavePath(savePath)
      } else {
        item.setSaveDialogOptions({ title: 'Save from MusicBox', defaultPath: path.join(folder, path.basename(item.getFilename())) })
      }
    } catch (error) {
      log(`Download save failed: ${error.message}\n`)
      item.cancel()
      void dialog.showMessageBox({ type: 'error', message: 'The file could not be saved.', detail: `Check that ${folder} exists and is writable, or choose another download folder in Settings.` })
    }
    item.once('done', (_event, state) => {
      if (savePath && state !== 'completed') {
        try { if (fs.statSync(savePath).size === 0) fs.unlinkSync(savePath) } catch { /* The download may already have removed its placeholder. */ }
      }
      if (state === 'completed') {
        const savedPath = savePath || item.getSavePath()
        if (savedPath) {
          savedFiles.add(savedPath)
          mainWindow?.webContents.send('musicbox:download-saved', {
            id: deviceId, name: path.basename(savedPath), folder: path.dirname(savedPath), path: savedPath,
          })
        }
      }
      if (state === 'interrupted' && !quitting) void dialog.showMessageBox({ type: 'error', message: 'The file could not be saved. Please try again.' })
    })
  })
  mainWindow = new BrowserWindow({
    title: 'MusicBox', width: 1320, height: 900, minWidth: 480, minHeight: 600,
    backgroundColor: '#111318', icon: path.join(__dirname, 'assets/icon.png'), show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      session: ownSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      // The split audio/video player synchronises on a timer, even when minimised.
      backgroundThrottling: false,
    },
  })
  if (smokeTest) mainWindow.webContents.setAudioMuted(true)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' } })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) { event.preventDefault(); openExternal(url) }
  })
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isInternalUrl(url)) event.preventDefault()
  })
  mainWindow.on('page-title-updated', (event) => { event.preventDefault(); mainWindow.setTitle('MusicBox') })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'MusicBox', submenu: [
      { label: 'Open Settings File', click: () => void shell.openPath(configFile) },
      { label: 'Open Music Library', click: () => { fs.mkdirSync(dataDir, { recursive: true }); void shell.openPath(dataDir) } },
      { label: 'Open Logs', click: () => void shell.openPath(path.dirname(logFile)) },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
    ] },
  ]))
  await mainWindow.loadURL(appUrl)
  // A bounded automated launch check closes the window and its backend afterwards.
  if (smokeTest) {
    const result = await mainWindow.webContents.executeJavaScript("new Promise(resolve => { const started = Date.now(); const check = () => { const rendered = document.getElementById('root').childElementCount > 0; if (rendered || Date.now() - started > 10000) resolve({title: document.title, rendered}); else setTimeout(check, 100); }; check(); })")
    if (!result.rendered || result.title !== 'MusicBox') throw new Error('Desktop interface did not render.')
    const apiResult = await mainWindow.webContents.executeJavaScript("fetch('/api/health').then(r => r.json())")
    if (apiResult.status !== 'ok') throw new Error('Desktop interface cannot reach the backend.')
    const storageResult = await mainWindow.webContents.executeJavaScript("(() => { localStorage.setItem('musicbox-desktop-check', 'ok'); const result = { value: localStorage.getItem('musicbox-desktop-check'), origin: location.origin }; localStorage.removeItem('musicbox-desktop-check'); return result; })()")
    if (storageResult.value !== 'ok' || storageResult.origin !== appUrl) throw new Error('Desktop storage does not have a stable origin.')
    if (process.env.MUSICBOX_SMOKE_VIDEO_ID) {
      await require('./playback-check.cjs').checkPlayback(mainWindow, process.env.MUSICBOX_SMOKE_VIDEO_ID, (message) => {
        console.log(message)
        log(message + '\n')
      })
    }
    if (process.env.MUSICBOX_SMOKE_MUSIC === '1') {
      await require('./experience-check.cjs').checkExperiences(mainWindow, process.env.MUSICBOX_SMOKE_VIDEO_ID, (message) => {
        console.log(message)
        log(message + '\n')
      })
    }
    if (process.env.MUSICBOX_SMOKE_MOVIES === '1') {
      await require('./movies-check.cjs').checkMovies(mainWindow, console.log)
    }
    if (process.env.MUSICBOX_SMOKE_SCREENSHOT) {
      fs.writeFileSync(process.env.MUSICBOX_SMOKE_SCREENSHOT, (await mainWindow.webContents.capturePage()).toPNG())
    }
    if (downloadSmoke) {
      const smokeFolder = path.join(app.getPath('downloads'), 'MusicBox')
      fs.mkdirSync(smokeFolder, { recursive: true })
      const existing = path.join(smokeFolder, 'MusicBox test clip.mp4')
      fs.writeFileSync(existing, 'Existing file')
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Device download did not finish.')), 15000)
        ownSession.once('will-download', (_event, item) => {
          item.once('done', (_event, state) => {
            clearTimeout(timer)
            try {
              if (state !== 'completed' || fs.readFileSync(existing, 'utf8') !== 'Existing file' || item.getSavePath() !== path.join(smokeFolder, 'MusicBox test clip (1).mp4') || fs.readFileSync(item.getSavePath(), 'utf8') !== 'MusicBox download fixture') throw new Error('Automatic download or collision protection failed.')
              resolve()
            } catch (error) { reject(error) }
          })
        })
        mainWindow.webContents.executeJavaScript("(() => { const link = document.createElement('a'); link.href = '/api/downloads/direct?media_kind=video&smoke_fixture=1'; link.download = ''; document.body.append(link); link.click(); link.remove(); })()").catch(reject)
      })
      const previousHash = await mainWindow.webContents.executeJavaScript('location.hash')
      await mainWindow.webContents.executeJavaScript("location.hash = '#/watch?v=smoke-back-test'")
      const backWorks = await mainWindow.webContents.executeJavaScript(`new Promise(resolve => { const deadline = Date.now() + 10000; const check = () => { const button = document.querySelector('.watch-navigation button'); if (button) { button.click(); setTimeout(() => resolve(location.hash === ${JSON.stringify(previousHash || '#/')}), 500); } else if (Date.now() > deadline) resolve(false); else setTimeout(check, 100); }; check(); })`)
      if (!backWorks) throw new Error('Watch-page Back button did not return to the previous page.')
      console.log('MUSICBOX_DOWNLOAD_AND_BACK_SMOKE_OK')
      if (process.env.MUSICBOX_SMOKE_CLIP === '1') {
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
          const response = await fetch('/api/downloads/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_id: 'iHvmTok4xYA', title: 'MusicBox real clip test', media_kind: 'video', video_quality: '720', section: { start_seconds: 1960, end_seconds: 1990 } }) });
          if (!response.ok) throw new Error('Could not queue the smoke clip.');
          let job = await response.json();
          const deadline = Date.now() + 120000;
          while (['queued', 'preparing'].includes(job.status) && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 500));
            job = await (await fetch('/api/downloads/device/' + job.id)).json();
          }
          if (job.status !== 'ready') throw new Error(job.detail || 'Clip preparation timed out.');
          return job;
        })()`)
        const savedFile = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Prepared clip did not save.')), 30000)
          ownSession.once('will-download', (_event, item) => item.once('done', (_event, state) => {
            clearTimeout(timer)
            if (state === 'completed') resolve(item.getSavePath())
            else reject(new Error(`Prepared clip save ended with ${state}.`))
          }))
          mainWindow.webContents.executeJavaScript(`(() => { const a = document.createElement('a'); a.download = ''; a.href = ${JSON.stringify(result.download_path)}; document.body.append(a); a.click(); a.remove(); })()`).catch(reject)
        })
        if (fs.statSync(savedFile).size < 100000) throw new Error('Saved clip is too small.')
        const probe = require('node:child_process').execFileSync(path.join(process.resourcesPath, 'tools/ffprobe.exe'), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', savedFile], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
        const media = JSON.parse(probe)
        if (Math.abs(Number(media.format.duration) - 30) > 0.5 || !media.streams.some(stream => stream.codec_type === 'audio') || !media.streams.some(stream => stream.codec_type === 'video')) throw new Error('Saved clip is missing its expected audio, video or duration.')
        console.log(`MUSICBOX_REAL_CLIP_SAVE_OK duration=${media.format.duration} bytes=${fs.statSync(savedFile).size}`)
      }
    }
    console.log('MUSICBOX_DESKTOP_SMOKE_OK')
    app.quit()
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })
  app.whenReady().then(launch).catch(async (error) => {
    if (logFile) log(error.stack + '\n')
    console.error(error.message)
    if (!process.argv.includes('--smoke-test')) await dialog.showMessageBox({ type: 'error', title: 'MusicBox could not start', message: error.message, detail: logFile ? `Details: ${logFile}` : '' })
    app.exitCode = 1
    app.quit()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    Promise.resolve(backend?.stop()).finally(() => app.exit(app.exitCode || 0))
  })
}
