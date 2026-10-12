const fs = require('node:fs')
const path = require('node:path')

function isDeviceVideo(item) {
  if (item.getInitiatorOrigin() !== 'musicbox://app') return false
  try {
    const url = new URL(item.getURL())
    if (url.protocol !== 'musicbox:' || url.host !== 'app') return false
    return (url.pathname === '/api/downloads/direct' && url.searchParams.get('media_kind') === 'video') ||
      (/^\/api\/downloads\/(?:device\/)?[^/]+\/file$/.test(url.pathname) && item.getMimeType().startsWith('video/'))
  } catch { return false }
}

function reserveDownload(directory, filename) {
  fs.mkdirSync(directory, { recursive: true })
  let safeName = path.win32.basename(path.posix.basename(filename)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '')
  if (!safeName) safeName = 'MusicBox video.mp4'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`
  const extension = path.extname(safeName)
  const stem = safeName.slice(0, safeName.length - extension.length)
  for (let suffix = 0; ; suffix += 1) {
    const target = path.join(directory, suffix ? `${stem} (${suffix})${extension}` : safeName)
    try {
      // Reserve atomically so simultaneous downloads cannot choose the same name.
      fs.closeSync(fs.openSync(target, 'wx'))
      return target
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

module.exports = { isDeviceVideo, reserveDownload }
