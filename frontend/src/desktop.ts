/**
 * The small bridge the desktop app's preload script exposes. It is undefined in
 * a normal browser, so every caller must handle that.
 */
export type DownloadFolderInfo = {
  folder: string
  defaultFolder: string
  isDefault: boolean
}

export type SavedDownload = {
  /** The device-download job this file belongs to, when known. */
  id: string | null
  name: string
  folder: string
  path: string
}

export type DesktopBridge = {
  getDownloadFolder: () => Promise<DownloadFolderInfo | null>
  chooseDownloadFolder: () => Promise<string | null>
  openDownloadFolder: () => Promise<boolean>
  showInFolder: (filePath: string) => Promise<boolean>
  onDownloadSaved: (listener: (details: SavedDownload) => void) => () => void
}

declare global {
  interface Window {
    musicboxDesktop?: DesktopBridge
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  return typeof window !== 'undefined' ? (window.musicboxDesktop ?? null) : null
}
