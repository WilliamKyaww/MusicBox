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
