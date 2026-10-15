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

const FOLDER_SETTING = 'DEVICE_DOWNLOADS_DIR'

/** Reads one value the way the backend's dotenv file stores it; the last assignment wins. */
function readConfigValue(configFile, key) {
  let text
  try { text = fs.readFileSync(configFile, 'utf8') } catch { return '' }
  let value = ''
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match || match[1] !== key) continue
    const raw = match[2].trim()
    if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) value = raw.slice(1, -1)
    else if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) value = raw.slice(1, -1).replace(/\\(["\\])/g, '$1')
    else value = raw.replace(/\s+#.*$/, '')
  }
  return value
}

/** The folder device downloads go to: the configured one, else Downloads\MusicBox. */
function resolveDownloadFolder(configFile, downloadsPath) {
  const defaultFolder = path.join(downloadsPath, 'MusicBox')
  const configured = readConfigValue(configFile, FOLDER_SETTING).trim()
  const usable = configured && path.isAbsolute(configured) ? path.normalize(configured) : ''
  return { folder: usable || defaultFolder, defaultFolder, isDefault: !usable }
}

/** Resolves the folder and makes sure it exists, falling back so a save never fails on a bad setting. */
function prepareDownloadFolder(configFile, downloadsPath, onProblem = () => {}) {
  const resolved = resolveDownloadFolder(configFile, downloadsPath)
  for (const candidate of [resolved.folder, resolved.defaultFolder]) {
    try {
      fs.mkdirSync(candidate, { recursive: true })
      fs.accessSync(candidate, fs.constants.W_OK)
      return { ...resolved, folder: candidate, isDefault: candidate === resolved.defaultFolder }
    } catch (error) {
      onProblem(`Download folder ${candidate} is not usable: ${error.message}`)
    }
  }
  return { ...resolved, folder: downloadsPath, isDefault: false }
}

/** The preparation job id inside a device download URL, or null for other downloads. */
function deviceDownloadId(url) {
  try {
    return /^\/api\/downloads\/device\/([^/]+)\/file$/.exec(new URL(url).pathname)?.[1] ?? null
  } catch { return null }
}

module.exports = {
  isDeviceVideo, reserveDownload, readConfigValue, resolveDownloadFolder, prepareDownloadFolder, deviceDownloadId,
}
