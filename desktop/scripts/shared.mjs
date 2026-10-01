import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const repoRoot = process.env.MUSICBOX_REPO_ROOT || path.resolve(desktopDir, '..')

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true, ...options })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`)))
  })
}

export function npm(args, cwd, env = process.env) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  return run(process.execPath, [npmCli, ...args], { cwd, env })
}

export async function buildFrontend() {
  const frontendDir = path.join(repoRoot, 'frontend')
  if (!existsSync(path.join(frontendDir, 'node_modules'))) await npm(['ci'], frontendDir)
  await npm(['run', 'build'], frontendDir, { ...process.env, VITE_API_BASE_URL: '' })
}
