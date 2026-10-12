const { app, BrowserWindow, protocol } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { isDeviceVideo, reserveDownload } = require('../downloads.cjs')
const directory = process.env.MUSICBOX_TEST_DOWNLOAD_DIRECTORY
app.setPath('userData', path.join(directory, 'profile'))
protocol.registerSchemesAsPrivileged([{ scheme: 'musicbox', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
const timer = setTimeout(() => app.exit(1), 15000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  const ownSession = window.webContents.session
  ownSession.protocol.handle('musicbox', (request) => {
    if (new URL(request.url).pathname === '/api/downloads/direct') {
      return new Response('fixture video bytes', { headers: {
        'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="clip.mp4"',
      } })
    }
    return new Response('<!doctype html><a download href="/api/downloads/direct?media_kind=video">Download</a>', { headers: { 'Content-Type': 'text/html' } })
  })
  ownSession.on('will-download', (_event, item) => {
    if (!isDeviceVideo(item)) { console.error(`Unexpected initiator: ${item.getInitiatorOrigin()}`); app.exit(1); return }
    item.setSavePath(reserveDownload(directory, item.getFilename()))
    item.once('done', (_event, state) => {
      if (state !== 'completed' || fs.readFileSync(item.getSavePath(), 'utf8') !== 'fixture video bytes') app.exit(1)
      else { console.log('MUSICBOX_AUTOMATIC_DOWNLOAD_OK'); clearTimeout(timer); app.exit(0) }
    })
  })
  await window.loadURL('musicbox://app')
  await window.webContents.executeJavaScript("document.querySelector('a').click()")
}).catch((error) => { console.error(error); app.exit(1) })
