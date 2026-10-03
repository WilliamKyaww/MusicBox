const { app, BrowserWindow, Menu, dialog, session, shell, protocol } = require('electron')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { startBackend } = require('./backend.cjs')
const { APP_ID, desktopRequestHeaders, proxyDesktopRequest } = require('./network.cjs')

app.setName('MusicBox')
app.setAppUserModelId(APP_ID)
const smokeTest = process.argv.includes('--smoke-test')
if (smokeTest) app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'musicbox-desktop-smoke-')))
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

async function launch() {
  const repoRoot = process.env.MUSICBOX_REPO_ROOT || path.resolve(__dirname, '..')
  const userDir = app.getPath('userData')
  fs.mkdirSync(userDir, { recursive: true })
  configFile = app.isPackaged ? path.join(userDir, 'config.env') : path.join(repoRoot, 'backend/.env')
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
    item.setSaveDialogOptions({ title: 'Save from MusicBox', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) })
    item.once('done', (_event, state) => {
      if (state === 'interrupted' && !quitting) void dialog.showMessageBox({ type: 'error', message: 'The file could not be saved. Please try again.' })
    })
  })
  mainWindow = new BrowserWindow({
    title: 'MusicBox', width: 1320, height: 900, minWidth: 480, minHeight: 600,
    backgroundColor: '#111318', icon: path.join(__dirname, 'assets/icon.png'), show: false,
    webPreferences: {
      session: ownSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      // The split audio/video player synchronizes on a timer, even when minimized.
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
    if (process.env.MUSICBOX_SMOKE_SCREENSHOT) {
      fs.writeFileSync(process.env.MUSICBOX_SMOKE_SCREENSHOT, (await mainWindow.webContents.capturePage()).toPNG())
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
