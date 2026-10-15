const { contextBridge, ipcRenderer } = require('electron')

// A narrow bridge for the desktop-only parts of the Settings page and download
// notifications. Everything else stays in the sandboxed web app.
contextBridge.exposeInMainWorld('musicboxDesktop', {
  getDownloadFolder: () => ipcRenderer.invoke('musicbox:get-download-folder'),
  chooseDownloadFolder: () => ipcRenderer.invoke('musicbox:choose-download-folder'),
  openDownloadFolder: () => ipcRenderer.invoke('musicbox:open-download-folder'),
  showInFolder: (filePath) => ipcRenderer.invoke('musicbox:show-in-folder', String(filePath)),
  onDownloadSaved(listener) {
    const handler = (_event, details) => listener(details)
    ipcRenderer.on('musicbox:download-saved', handler)
    return () => ipcRenderer.removeListener('musicbox:download-saved', handler)
  },
})
