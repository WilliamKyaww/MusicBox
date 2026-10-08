const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { backendLaunchOptions, startBackend } = require('../backend.cjs')
const { proxyDesktopRequest } = require('../network.cjs')

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

  // The Settings page saves to the desktop config file and never returns secrets.
  const settingsUrl = service.baseUrl + '/api/settings'
  const put = (values, extra = { 'X-MusicBox-Settings': '1' }) => fetch(settingsUrl, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ values }),
  })
  const before = await (await fetch(settingsUrl, { headers })).json()
  assert.equal(before.read_only_reason, null)
  assert.equal(path.resolve(before.config_file), path.resolve(configFile))
  assert.deepEqual(before.fields.find((f) => f.key === 'YOUTUBE_API_KEY'), {
    ...before.fields.find((f) => f.key === 'YOUTUBE_API_KEY'), is_set: false, value: null,
  })
  const apiKey = 'AIzaTest' + 'k'.repeat(31)
  assert.equal((await put({ YOUTUBE_API_KEY: apiKey }, {})).status, 403)
  const invalid = await put({ YOUTUBE_API_KEY: 'not a key!' })
  assert.equal(invalid.status, 400)
  assert.doesNotMatch(JSON.stringify(await invalid.json()), /not a key/)
  const cookies = 'C:\\Users\\me\\My cookies.txt'
  const saved = await put({ YOUTUBE_API_KEY: apiKey, DISCORD_PRESENCE_ENABLED: true, YOUTUBE_COOKIES_FILE: cookies, MAX_CONCURRENT_DOWNLOADS: 3 })
  const savedText = await saved.text()
  assert.equal(saved.status, 200, savedText)
  assert.doesNotMatch(savedText, new RegExp(apiKey))
  const fields = Object.fromEntries(JSON.parse(savedText).fields.map((f) => [f.key, f]))
  assert.equal(fields.YOUTUBE_API_KEY.is_set, true)
  assert.equal(fields.YOUTUBE_API_KEY.value, null)
  assert.equal(fields.YOUTUBE_COOKIES_FILE.value, cookies)
  assert.equal(fields.MAX_CONCURRENT_DOWNLOADS.value, 3)
  const file = fs.readFileSync(configFile, 'utf8')
  assert.match(file, new RegExp(`^YOUTUBE_API_KEY=${apiKey}$`, 'm'))
  assert.match(file, /^PO_TOKEN_SERVER_URL=$/m)
  // Discord reads its settings live, so enabling it needs no restart.
  assert.equal((await (await fetch(service.baseUrl + '/api/discord-presence', { headers })).json()).enabled, true)
  const cleared = await put({ YOUTUBE_API_KEY: null })
  assert.equal((await cleared.json()).fields.find((f) => f.key === 'YOUTUBE_API_KEY').is_set, false)
  assert.doesNotMatch(fs.readFileSync(configFile, 'utf8'), /YOUTUBE_API_KEY/)
  const check = await fetch(settingsUrl + '/youtube-key-check', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-MusicBox-Settings': '1' }, body: '{}',
  })
  assert.deepEqual(await check.json(), { ok: false, message: 'No YouTube API key has been saved yet.' })
  const moviesUrl = service.baseUrl + '/api/movies/status'
  assert.equal((await (await fetch(moviesUrl, { headers })).json()).enabled, false)
  assert.equal((await put({ MOVIES_ENABLED: true }, {})).status, 403)
  for (const enabled of [true, false]) {
    const changed = await proxyDesktopRequest(new Request('musicbox://app/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-MusicBox-Settings': '1' },
      body: JSON.stringify({ values: { MOVIES_ENABLED: enabled } }),
    }), service.baseUrl, token, fetch)
    assert.equal(changed.status, 200)
    const movies = await (await fetch(moviesUrl, { headers })).json()
    assert.equal(movies.enabled, enabled)
    assert.equal(movies.playback_available, enabled)
    assert.equal(movies.catalogue_available, enabled)
  }
  assert.equal(fs.existsSync(path.join(tempDir, 'data/movies')), false)
  await service.stop()
  service = null
  await assert.rejects(fetch(health.url, { headers, signal: AbortSignal.timeout(1000) }))
})
