import { createRequire } from 'node:module'
import { desktopDir, repoRoot, buildFrontend, run } from './shared.mjs'
import { buildAssets } from './assets.mjs'

const require = createRequire(import.meta.url)
try {
  await buildFrontend()
  await buildAssets()
  const env = { ...process.env, MUSICBOX_REPO_ROOT: repoRoot }
  delete env.ELECTRON_RUN_AS_NODE
  await run(require('electron'), [desktopDir, ...process.argv.slice(2)], { cwd: desktopDir, env })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
