import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { desktopDir, repoRoot, buildFrontend, run } from './shared.mjs'
import { buildAssets } from './assets.mjs'

const require = createRequire(import.meta.url)
try {
  if (process.platform !== 'win32') throw new Error('This installer build currently targets Windows. Build it on Windows.')
  await buildFrontend()
  await buildAssets()
  const venv = path.join(desktopDir, '.venv')
  const python = path.join(venv, 'Scripts/python.exe')
  if (!existsSync(python)) {
    const existingPython = process.env.MUSICBOX_PYTHON || path.join(repoRoot, 'backend/.venv/Scripts/python.exe')
    await run(existsSync(existingPython) ? existingPython : 'python', ['-m', 'venv', venv])
  }
  await run(python, ['-m', 'pip', 'install', '-r', path.join(desktopDir, 'requirements-build.txt')])
  const settingsPython = process.env.MUSICBOX_PYTHON || path.join(repoRoot, 'backend/.venv/Scripts/python.exe')
  const lookup = spawnSync(existsSync(settingsPython) ? settingsPython : python, ['-c',
    'import json; from app.services.downloads import get_download_manager; print(json.dumps(get_download_manager().get_ffmpeg_binary()))',
  ], { cwd: path.join(repoRoot, 'backend'), encoding: 'utf8', windowsHide: true })
  if (lookup.status !== 0) throw new Error('Could not find FFmpeg. Install the backend requirements and configure FFMPEG_BINARY first.')
  const ffmpeg = JSON.parse(lookup.stdout.trim())
  const ffprobe = ffmpeg ? path.join(path.dirname(ffmpeg), 'ffprobe.exe') : ''
  if (!ffmpeg || !existsSync(ffmpeg) || !existsSync(ffprobe)) throw new Error('FFmpeg and FFprobe are both required to build the installer.')
  const resources = path.join(desktopDir, 'resources')
  await mkdir(path.join(resources, 'tools'), { recursive: true })
  await cp(ffmpeg, path.join(resources, 'tools/ffmpeg.exe'))
  await cp(ffprobe, path.join(resources, 'tools/ffprobe.exe'))
  await cp(path.join(repoRoot, 'frontend/dist'), path.join(resources, 'frontend'), { recursive: true })
  const buildDir = path.join(desktopDir, 'build')
  await mkdir(buildDir, { recursive: true })
  await run(python, [
    '-m', 'PyInstaller', '--noconfirm', '--onedir', '--console', '--noupx',
    '--name', 'musicbox-backend', '--icon', path.join(desktopDir, 'assets/icon.ico'),
    '--distpath', path.join(buildDir, 'backend'), '--workpath', path.join(buildDir, 'pyinstaller'), '--specpath', buildDir,
    '--paths', path.join(repoRoot, 'backend'),
    '--collect-all', 'yt_dlp', '--collect-all', 'yt_dlp_plugins', '--collect-all', 'pypresence',
    '--collect-all', 'truststore', '--collect-submodules', 'uvicorn', '--collect-submodules', 'PIL',
    '--copy-metadata', 'yt-dlp', '--copy-metadata', 'bgutil-ytdlp-pot-provider',
    path.join(repoRoot, 'backend/desktop_server.py'),
  ])
  await cp(path.join(buildDir, 'backend/musicbox-backend'), path.join(resources, 'backend'), { recursive: true })
  const builderCli = require.resolve('electron-builder/cli.js')
  const args = [builderCli, process.argv.includes('--dir') ? '--dir' : '--win', '--x64']
  // Antivirus or sync tools can lock dist\win-unpacked.tmp (EPERM on rename); building
  // outside the synced Documents folder avoids it.
  const output = process.env.MUSICBOX_DIST_DIR ? path.resolve(process.env.MUSICBOX_DIST_DIR) : path.join(desktopDir, 'dist')
  if (process.env.MUSICBOX_DIST_DIR) args.push(`-c.directories.output=${output}`)
  await run(process.execPath, args, { cwd: desktopDir })
  console.log(`Desktop output: ${output}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
