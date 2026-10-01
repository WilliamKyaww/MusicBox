import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { desktopDir, repoRoot } from './shared.mjs'

export async function buildAssets() {
  const assetDir = path.join(desktopDir, 'assets')
  await mkdir(assetDir, { recursive: true })
  const svg = await readFile(path.join(repoRoot, 'frontend/public/favicon.svg'))
  const png = await sharp(svg).resize(256, 256).png().toBuffer()
  await writeFile(path.join(assetDir, 'icon.png'), png)
  await writeFile(path.join(assetDir, 'icon.ico'), await pngToIco(png))
}
