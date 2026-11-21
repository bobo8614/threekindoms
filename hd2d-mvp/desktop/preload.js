// What the game page may ask of the desktop window (src/app.js reads window.desktop; a browser has none, and the
// rows that need it are not shown there). Nothing else of Electron or Node reaches the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  mac: process.platform === 'darwin',
  // 全屏: the same switch as F11 / Alt+Enter. isFullscreen() answers now; onFullscreen(f) tells every change, whoever made it.
  toggleFullscreen: () => ipcRenderer.send('desktop:fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('desktop:is-fullscreen'),
  onFullscreen: (f) => { ipcRenderer.on('desktop:fullscreen', (_e, on) => f(!!on)); },
  // 界面大小 (desktop/uiscale.js SIZES: small / normal / large): the page zoomed to fit the window; answers the zoom now in use.
  setUiSize: (size) => ipcRenderer.invoke('desktop:ui-size', String(size)),
  // A game is on that closing the window would lose: the window's ✕, Alt+F4 and ⌘Q then ask first (main.js).
  setUnsaved: (on) => ipcRenderer.send('desktop:unsaved', !!on),
  // 退出游戏: the page has already asked the player, so this closes without asking again.
  quit: () => ipcRenderer.send('desktop:quit'),
});
