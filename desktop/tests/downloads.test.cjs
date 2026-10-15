const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { isDeviceVideo, reserveDownload } = require('../downloads.cjs')

test('real Electron saves a device video without a Save As dialogue', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbox-native-download-'))
  try {
    fs.writeFileSync(path.join(directory, 'clip.mp4'), 'existing video')
    const env = { ...process.env, MUSICBOX_TEST_DOWNLOAD_DIRECTORY: directory }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(require('electron'), [path.join(__dirname, 'download-fixture.cjs')], {
      env, encoding: 'utf8', timeout: 25000, windowsHide: true,
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /MUSICBOX_AUTOMATIC_DOWNLOAD_OK/)
    assert.equal(fs.readFileSync(path.join(directory, 'clip.mp4'), 'utf8'), 'existing video')
    assert.equal(fs.readFileSync(path.join(directory, 'clip (1).mp4'), 'utf8'), 'fixture video bytes')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('device videos are restricted to first-party media endpoints', () => {
  const item = (url, origin = 'musicbox://app', mime = 'video/mp4') => ({
    getURL: () => url, getInitiatorOrigin: () => origin, getMimeType: () => mime,
  })
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/direct?media_kind=video')), true)
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/job/file')), true)
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/device/task/file')), true)
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/direct?media_kind=audio')), false)
  assert.equal(isDeviceVideo(item('https://example.com/api/downloads/direct?media_kind=video')), false)
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/job/file', 'https://example.com')), false)
  assert.equal(isDeviceVideo(item('musicbox://app/api/downloads/job/file', 'musicbox://app', 'audio/mpeg')), false)
})

test('download names are safe and repeated reservations never overwrite existing files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbox-download-names-'))
  try {
    fs.writeFileSync(path.join(directory, 'clip.mp4'), 'existing video')
    assert.equal(reserveDownload(directory, 'clip.mp4'), path.join(directory, 'clip (1).mp4'))
    assert.equal(reserveDownload(directory, 'clip.mp4'), path.join(directory, 'clip (2).mp4'))
    assert.equal(fs.readFileSync(path.join(directory, 'clip.mp4'), 'utf8'), 'existing video')
    assert.equal(reserveDownload(directory, '../../escape.mp4'), path.join(directory, 'escape.mp4'))
    assert.equal(reserveDownload(directory, '..\\escape.mp4'), path.join(directory, 'escape (1).mp4'))
    assert.equal(reserveDownload(directory, 'CON.mp4'), path.join(directory, '_CON.mp4'))
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('the download folder defaults to a MusicBox folder inside Downloads and honours the setting', () => {
  const { prepareDownloadFolder, readConfigValue, resolveDownloadFolder, deviceDownloadId } = require('../downloads.cjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbox-download-folder-'))
  try {
    const downloads = path.join(root, 'Downloads')
    const configFile = path.join(root, 'config.env')

    fs.writeFileSync(configFile, 'YOUTUBE_API_KEY=abc\n')
    assert.equal(resolveDownloadFolder(configFile, downloads).folder, path.join(downloads, 'MusicBox'))
    assert.equal(resolveDownloadFolder(configFile, downloads).isDefault, true)
    assert.equal(resolveDownloadFolder(path.join(root, 'missing.env'), downloads).isDefault, true)

    // The default folder is created ahead of the first save.
    const prepared = prepareDownloadFolder(configFile, downloads)
    assert.equal(prepared.folder, path.join(downloads, 'MusicBox'))
    assert.equal(fs.statSync(prepared.folder).isDirectory(), true)

    // Quoted, double-quoted and last-assignment-wins values, as the backend writes them.
    const custom = path.join(root, 'My Videos', 'Clips')
    fs.writeFileSync(configFile, `DEVICE_DOWNLOADS_DIR='${path.join(root, 'old')}'\nDEVICE_DOWNLOADS_DIR='${custom}'\n`)
    assert.equal(readConfigValue(configFile, 'DEVICE_DOWNLOADS_DIR'), custom)
    assert.equal(prepareDownloadFolder(configFile, downloads).folder, custom)
    assert.equal(fs.statSync(custom).isDirectory(), true)

    fs.writeFileSync(configFile, 'DEVICE_DOWNLOADS_DIR="relative/folder" # comment\n')
    assert.equal(resolveDownloadFolder(configFile, downloads).isDefault, true)

    // A folder that cannot be created falls back to the default instead of failing the save.
    const blocker = path.join(root, 'blocker')
    fs.writeFileSync(blocker, 'a file, not a folder')
    fs.writeFileSync(configFile, `DEVICE_DOWNLOADS_DIR='${path.join(blocker, 'inside')}'\n`)
    const fallback = prepareDownloadFolder(configFile, downloads, () => {})
    assert.equal(fallback.folder, path.join(downloads, 'MusicBox'))

    assert.equal(deviceDownloadId('musicbox://app/api/downloads/device/abc123/file'), 'abc123')
    assert.equal(deviceDownloadId('musicbox://app/api/downloads/direct?media_kind=video'), null)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
