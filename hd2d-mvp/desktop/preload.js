// What the game page may ask of the desktop window (src/app.js reads window.desktop; a browser has none, and the
// rows that need it are not shown there). Nothing else of Electron or Node reaches the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  mac: process.platform === 'darwin',
  // 全屏: the same switch as F11 / Alt+Enter. isFullscreen() answers now; onFullscreen(f) tells every change, whoever made it.
  toggleFullscreen: () => ipcRenderer.send('desktop:fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('desktop:is-fullscreen'),
  onFullscreen: (f) => { ipcRenderer.on('desktop:fullscreen', (_e, on) => f(!!on)); },
  // 界面大小 (desktop/uiscale.js SIZES: small / medium / normal / large): the page zoomed to fit the window; answers
  // { zoom, screen }, the zoom now in use and what the screen alone asks for. onUiZoom(f) tells each change the window makes.
  setUiSize: (size) => ipcRenderer.invoke('desktop:ui-size', String(size)),
  onUiZoom: (f) => { ipcRenderer.on('desktop:ui-zoom', (_e, z) => f(z)); },
  // A game is on that closing the window would lose: the window's ✕, Alt+F4 and ⌘Q then ask first (main.js).
  setUnsaved: (on) => ipcRenderer.send('desktop:unsaved', !!on),
  // 系统 → 文字 (src/lang.js): 'hans' or 'hant', so the window's own questions (closing with a game on) read as the page does.
  setLang: (lang) => ipcRenderer.send('desktop:lang', String(lang)),
  // 退出游戏: the page has already asked the player, so this closes without asking again.
  quit: () => ipcRenderer.send('desktop:quit'),
  // 更新 (desktop/updater.js; src/app.js updateDialog): enabled only in the release build with its keys. check / download answer
  // the state they end in ({ phase: 'latest' | 'update' | 'ready' | 'shell-required' | 'error' | …, … }); onEvent(f) tells each
  // step on the way (downloading, with done / bytes). apply / revert reload the page and are refused away from the title.
  updater: {
    enabled: ipcRenderer.sendSync('updater:enabled') === true,
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    cancel: () => ipcRenderer.send('updater:cancel'),
    apply: () => ipcRenderer.invoke('updater:apply'),
    revert: () => ipcRenderer.invoke('updater:revert'),
    setAutoCheck: (on) => ipcRenderer.invoke('updater:set-auto', on === true),
    openDownloadPage: () => ipcRenderer.send('updater:open-download-page'),
    onEvent: (f) => { ipcRenderer.on('updater:event', (_e, st) => f(st)); },
  },
});

// Each screen the game's own code shows, told once per page to main.js, whose start-up watch waits for the first (watchPage):
// index.html itself opens with data-screen="title", which says nothing of whether the game came up. Watched from before the
// page's first script, so a startup-error set early is seen too.
{
  const told = new Set();
  new MutationObserver((recs) => {
    for (const r of recs) {
      const s = r.target === document.body ? document.body.dataset.screen : '';
      if (s && !told.has(s)) { told.add(s); ipcRenderer.send('page:screen', s); }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
}
