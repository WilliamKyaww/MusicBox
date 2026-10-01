const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { backendLaunchOptions, startBackend } = require('../backend.cjs')

test('missing backend fails with an actionable error', () => {
  assert.throws(() => backendLaunchOptions({ packaged: true, resourcesPath: path.join(os.tmpdir(), 'missing-musicbox-resources') }), /Backend executable not found/)
})

test('desktop backend binds its own port, requires its session token, serves the app, and shuts down', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbox-sidecar-test-'))
  const frontendDir = path.join(tempDir, 'frontend/dist')
  fs.mkdirSync(frontendDir, { recursive: true })
  fs.writeFileSync(path.join(frontendDir, 'index.html'), '<!doctype html><title>MusicBox</title><div id="root">Ready</div>')
  const configFile = path.join(tempDir, 'config.env')
  fs.writeFileSync(configFile, 'DISCORD_PRESENCE_ENABLED=false\nPO_TOKEN_SERVER_URL=\n')
  // Use the installed development Python, with a fixture UI and isolated data.
  const realRoot = process.env.MUSICBOX_REPO_ROOT || path.resolve(__dirname, '../..')
  const token = 'test-session-' + 'a'.repeat(48)
  const executable = process.env.MUSICBOX_PYTHON || path.join(realRoot, 'backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const fixtureBackend = path.join(tempDir, 'backend')
  fs.mkdirSync(fixtureBackend)
  fs.copyFileSync(path.join(realRoot, 'backend/desktop_server.py'), path.join(fixtureBackend, 'desktop_server.py'))
  process.env.MUSICBOX_PYTHON = executable
  const previousPythonPath = process.env.PYTHONPATH
  process.env.PYTHONPATH = path.join(realRoot, 'backend')
  let service
  let backendLog = ''
  t.after(async () => {
    if (service) await service.stop()
    if (previousPythonPath === undefined) delete process.env.PYTHONPATH
    else process.env.PYTHONPATH = previousPythonPath
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
  try {
    service = await startBackend({ packaged: false, repoRoot: tempDir, configFile, dataDir: path.join(tempDir, 'data'), token }, (line) => { backendLog += line }, () => {})
  } catch (error) { throw new Error(error.message + '\n' + backendLog) }
  assert.match(service.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)
  const unauthorized = await fetch(service.baseUrl + '/api/health')
  assert.equal(unauthorized.status, 401)
  const headers = { 'X-MusicBox-Desktop': token }
  const health = await fetch(service.baseUrl + '/api/health', { headers })
  assert.deepEqual(await health.json(), { status: 'ok' })
  const html = await fetch(service.baseUrl, { headers })
  assert.match(await html.text(), /MusicBox/)
  const discord = await fetch(service.baseUrl + '/api/discord-presence', { headers })
  assert.equal((await discord.json()).enabled, false)
  await service.stop()
  service = null
  await assert.rejects(fetch(health.url, { headers, signal: AbortSignal.timeout(1000) }))
})
