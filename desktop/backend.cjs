const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

function backendLaunchOptions({ packaged, resourcesPath, repoRoot, dataDir, configFile, token }) {
  const backendDir = packaged ? path.join(resourcesPath, 'backend') : path.join(repoRoot, 'backend')
  const executable = process.platform === 'win32' ? 'musicbox-backend.exe' : 'musicbox-backend'
  const python = process.env.MUSICBOX_PYTHON || path.join(
    backendDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
  const command = packaged ? path.join(backendDir, executable) : python
  if (!existsSync(command)) throw new Error(`Backend executable not found: ${command}`)
  const args = packaged ? [] : [path.join(backendDir, 'desktop_server.py')]
  args.push('--frontend-dir', packaged ? path.join(resourcesPath, 'frontend') : path.join(repoRoot, 'frontend/dist'))
  args.push('--config-file', configFile, '--data-dir', dataDir)
  if (packaged) args.push('--tools-dir', path.join(resourcesPath, 'tools'))
  return {
    command, args, cwd: backendDir, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MUSICBOX_DESKTOP_TOKEN: token, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
  }
}

async function startBackend(options, log, onUnexpectedExit) {
  const launch = backendLaunchOptions(options)
  const child = spawn(launch.command, launch.args, launch)
  let expectedExit = false
  let baseUrl
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.once('exit', (code) => {
    if (!expectedExit && baseUrl) onUnexpectedExit(code)
  })
  child.stderr.on('data', (data) => log(data.toString()))
  const lines = readline.createInterface({ input: child.stdout })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend did not start within 60 seconds. Check the backend log.')), 60000)
    const finish = (callback, value) => { clearTimeout(timer); callback(value) }
    child.once('error', (error) => finish(reject, error))
    child.once('exit', (code) => finish(reject, new Error(`Backend exited during startup (code ${code}).`)))
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line)
        if (message.event === 'musicbox-ready' && Number.isInteger(message.port) && message.port > 0 && message.port < 65536) {
          finish(resolve, `http://127.0.0.1:${message.port}`)
          return
        }
      } catch { /* Normal backend log lines are not JSON. */ }
      log(line + '\n')
    })
  })
  async function stop() {
    expectedExit = true
    if (child.exitCode !== null || !child.pid) return
    if (baseUrl) {
      await fetch(`${baseUrl}/api/desktop/shutdown`, {
        method: 'POST', headers: { 'X-MusicBox-Desktop': options.token }, signal: AbortSignal.timeout(2000),
      }).catch(() => {})
    }
    let timeout
    const finished = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 5000) }),
    ])
    clearTimeout(timeout)
    if (!finished) {
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.once('error', resolve)
          killer.once('exit', resolve)
        })
      } else child.kill('SIGKILL')
    }
    lines.close()
  }
  try {
    baseUrl = await ready
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Backend exited before it was ready.')
      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          headers: { 'X-MusicBox-Desktop': options.token }, signal: AbortSignal.timeout(1000),
        })
        if (response.ok && (await response.json()).status === 'ok') return { baseUrl, stop }
      } catch { /* Wait for Uvicorn to finish startup. */ }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('Backend health check timed out.')
  } catch (error) {
    await stop()
    throw error
  }
}

module.exports = { backendLaunchOptions, startBackend }
