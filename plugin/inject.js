'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');

let electron;
try {
  electron = require('electron');
} catch (e) {
  console.error('[DiscordUtils] could not require electron:', e);
}

const RENDERER_PATH = path.join(__dirname, 'renderer.js');
const DISBLOCK_PATH = path.join(__dirname, 'disblock.css');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const DISBLOCK_URL = 'https://allpurposemat.codeberg.page/Disblock-Origin/DisblockOrigin.theme.css';

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) || {}; } catch (_) { return {}; } };
let SETTINGS = readJson(SETTINGS_PATH);
function saveSettings(next) {
  if (!next || typeof next !== 'object') return;
  SETTINGS = next;
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2)); } catch (_) {}
  syncDiscordDevToolsFlag();
}

const DEV_FLAG = 'DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING';
function syncDiscordDevToolsFlag() {
  try {
    if (!electron || !electron.app) return;
    const p = path.join(electron.app.getPath('userData'), 'settings.json');
    const j = readJson(p);
    const want = !!SETTINGS.devtools;
    if (j[DEV_FLAG] === want) return;
    j[DEV_FLAG] = want;
    fs.writeFileSync(p, JSON.stringify(j, null, 2));
  } catch (_) {}
}

let devtoolsPatched = false;
function patchBrowserWindow() {
  try {
    if (!electron || typeof electron.BrowserWindow !== 'function') return;
    const entry = require.cache[require.resolve('electron')];
    if (!entry || !entry.exports) return;
    if (entry.exports.__duDevTools) { devtoolsPatched = true; return; }
    const orig = entry.exports;
    const OrigBW = orig.BrowserWindow;
    const PatchedBW = new Proxy(OrigBW, {
      construct(target, args, newTarget) {
        try {
          const o = args[0];
          if (o && typeof o === 'object') {
            o.webPreferences = o.webPreferences || {};
            o.webPreferences.devTools = true;
          }
        } catch (_) {}
        return Reflect.construct(target, args, newTarget === PatchedBW ? target : newTarget);
      },
    });
    entry.exports = new Proxy(orig, {
      get(t, p) {
        if (p === 'BrowserWindow') return PatchedBW;
        if (p === '__duDevTools') return true;
        return Reflect.get(t, p, t);
      },
      has(t, p) { return p === '__duDevTools' || Reflect.has(t, p); },
    });
    devtoolsPatched = true;
    console.log('[DiscordUtils] DevTools desbloqueado.');
  } catch (e) {
    console.error('[DiscordUtils] devtools patch failed:', e);
  }
}
if (SETTINGS.devtools) patchBrowserWindow();
syncDiscordDevToolsFlag();

const MARK_START = '/* === DiscordUtils inject start === */';
const MARK_END = '/* === DiscordUtils inject end === */';
const DISCORD_ROOTS = ['Discord', 'DiscordCanary', 'DiscordPTB']
  .map((n) => path.join(process.env.LOCALAPPDATA || '', n));

function sourceFile(dir, name) {
  for (const p of [path.join(dir, name), path.join(dir, 'plugin', name)]) {
    try { if (fs.statSync(p).isFile()) return p; } catch (_) {}
  }
  return null;
}

function syncFromSource() {
  const dir = SETTINGS.sourceDir;
  if (!dir) return;
  for (const name of ['renderer.js', 'inject.js']) {
    const from = sourceFile(dir, name);
    if (!from) continue;
    const to = path.join(__dirname, name);
    try {
      const a = fs.statSync(from);
      let b = null;
      try { b = fs.statSync(to); } catch (_) {}
      if (b && a.mtimeMs <= b.mtimeMs + 1000) continue;
      fs.writeFileSync(to, fs.readFileSync(from));
      console.log('[DiscordUtils] atualizado do projeto:', name);
    } catch (_) {}
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DiscordUtils' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(httpGet(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function looksLikePlugin(text) {
  return typeof text === 'string' && text.length > 2000 && text.indexOf('DiscordUtils') !== -1;
}

async function updateFromRepo() {
  if (SETTINGS.autoUpdate === false || !SETTINGS.repo) return;
  const branch = SETTINGS.branch || 'main';
  const base = 'https://raw.githubusercontent.com/' + SETTINGS.repo + '/' + branch + '/plugin/';
  for (const name of ['renderer.js', 'inject.js']) {
    try {
      const remote = await httpGet(base + name);
      if (!looksLikePlugin(remote)) continue;
      const target = path.join(__dirname, name);
      let local = null;
      try { local = fs.readFileSync(target, 'utf8'); } catch (_) {}
      if (local === remote) continue;
      if (local) { try { fs.writeFileSync(target + '.bak', local); } catch (_) {} }
      fs.writeFileSync(target, remote);
      console.log('[DiscordUtils] atualizado do GitHub:', name);
    } catch (_) {}
  }
}

function coreIndexesFor(appDir) {
  const modules = path.join(appDir, 'modules');
  const out = [];
  let names;
  try { names = fs.readdirSync(modules); } catch (_) { return out; }
  for (const c of names) {
    if (c.indexOf('discord_desktop_core-') !== 0) continue;
    const idx = path.join(modules, c, 'discord_desktop_core', 'index.js');
    try { if (fs.statSync(idx).isFile()) out.push(idx); } catch (_) {}
  }
  return out;
}

function patchCore(idx) {
  let raw;
  try { raw = fs.readFileSync(idx, 'utf8'); } catch (_) { return false; }
  if (raw.indexOf(MARK_START) !== -1) return false;
  const block = MARK_START + '\ntry { require(' + JSON.stringify(__filename) +
    "); } catch (e) { console.error('[DiscordUtils] inject failed', e); }\n" + MARK_END;
  const bak = idx + '.discordutils.bak';
  try { if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw); } catch (_) {}
  try { fs.writeFileSync(idx, block + '\r\n' + raw); } catch (e) {
    console.error('[DiscordUtils] falhou ao repatchar', idx, e);
    return false;
  }
  console.log('[DiscordUtils] patch reaplicado em', idx);
  return true;
}

function patchAllApps() {
  if (SETTINGS.autoPatch === false) return 0;
  ensureRendererPresent();
  let n = 0;
  for (const root of DISCORD_ROOTS) {
    let apps;
    try { apps = fs.readdirSync(root); } catch (_) { continue; }
    for (const a of apps) {
      if (a.indexOf('app-') !== 0) continue;
      const appDir = path.join(root, a);
      watchModules(appDir);
      for (const idx of coreIndexesFor(appDir)) if (patchCore(idx)) n++;
    }
  }
  return n;
}

function ensureRendererPresent() {
  const target = path.join(__dirname, 'renderer.js');
  if (fs.existsSync(target)) return;
  const dir = SETTINGS.sourceDir;
  if (!dir) return;
  const from = sourceFile(dir, 'renderer.js');
  if (!from) return;
  try {
    fs.mkdirSync(__dirname, { recursive: true });
    fs.writeFileSync(target, fs.readFileSync(from));
    console.log('[DiscordUtils] renderer.js restaurado do projeto.');
  } catch (_) {}
}

let repatchTimer = null, repatchLeft = 0;
function scheduleRepatch() {
  repatchLeft = 20;
  if (repatchTimer) return;
  repatchTimer = setInterval(() => {
    patchAllApps();
    if (--repatchLeft <= 0) { clearInterval(repatchTimer); repatchTimer = null; }
  }, 3000);
}

const watchedModules = new Set();
function watchModules(appDir) {
  const modules = path.join(appDir, 'modules');
  if (watchedModules.has(modules) || !fs.existsSync(modules)) return;
  try {
    fs.watch(modules, { persistent: false }, (_ev, name) => {
      if (name && String(name).indexOf('discord_desktop_core') === 0) scheduleRepatch();
    });
    watchedModules.add(modules);
  } catch (_) {}
}

function watchDiscordApps() {
  if (SETTINGS.autoPatch === false) return;
  patchAllApps();
  for (const root of DISCORD_ROOTS) {
    try {
      if (!fs.existsSync(root)) continue;

      fs.watch(root, { persistent: false }, (_ev, name) => {
        if (name && String(name).indexOf('app-') === 0) scheduleRepatch();
      });
    } catch (_) {}
  }
  setInterval(patchAllApps, 2 * 60 * 1000);

  try {
    if (electron && electron.app) {
      electron.app.on('before-quit', () => { try { patchAllApps(); } catch (_) {} });
      electron.app.on('browser-window-created', () => { try { syncFromSource(); } catch (_) {} });
    }
  } catch (_) {}
}

let DISBLOCK_CSS = '';
try { DISBLOCK_CSS = fs.readFileSync(DISBLOCK_PATH, 'utf8'); } catch (_) {}
function fetchDisblock() {
  https.get(DISBLOCK_URL, { headers: { 'User-Agent': 'DiscordUtils/1.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return; }
    let data = ''; res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => { if (data && data.length > 100) { DISBLOCK_CSS = data; try { fs.writeFileSync(DISBLOCK_PATH, data); } catch (_) {} } });
  }).on('error', () => {});
}
if (!DISBLOCK_CSS) fetchDisblock();

function injectRenderer(webContents) {
  let code;
  try {
    code = fs.readFileSync(RENDERER_PATH, 'utf8');
  } catch (e) {
    console.error('[DiscordUtils] failed to read renderer.js:', e);
    return;
  }

  const preamble =
    'window.__DU_DISBLOCK_CSS__=' + JSON.stringify(DISBLOCK_CSS) + ';\n' +
    'window.__DU_SETTINGS__=window.__DU_SETTINGS__||' + JSON.stringify(SETTINGS) + ';\n' +
    'window.__DU_OUTBOX__=window.__DU_OUTBOX__||[];\n' +
    'window.__DU_DEVTOOLS_ACTIVE__=' + JSON.stringify(!!devtoolsPatched) + ';\n';
  const wrapped = preamble + code + '\n//# sourceURL=DiscordUtils/renderer.js';
  webContents.executeJavaScript(wrapped).catch((e) => {
    console.error('[DiscordUtils] renderer injection error:', e);
  });
}

const DRAIN = '(function(){try{var o=window.__DU_OUTBOX__;if(!o||!o.length)return "";return JSON.stringify(o.splice(0,o.length));}catch(e){return "";}})()';

function handleMessage(msg, wc) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'settings') { saveSettings(msg.data); return; }
  if (msg.type === 'devtools') {
    try { if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode: 'detach' }); } catch (e) { console.error('[DiscordUtils] openDevTools:', e); }
    return;
  }
  if (msg.type === 'relaunch') {
    try { electron.app.relaunch(); electron.app.exit(0); } catch (_) {}
  }
}

function startBridge(wc) {
  const timer = setInterval(() => {
    if (wc.isDestroyed()) { clearInterval(timer); return; }
    wc.executeJavaScript(DRAIN)
      .then((s) => {
        if (!s) return;
        let arr; try { arr = JSON.parse(s); } catch (_) { return; }
        if (Array.isArray(arr)) for (const m of arr) handleMessage(m, wc);
      })
      .catch(() => {});
  }, 600);
  wc.on('destroyed', () => clearInterval(timer));
}

function hookWindow(window) {
  if (!window || !window.webContents) return;
  const wc = window.webContents;

  const fire = () => {
    injectRenderer(wc);
    setTimeout(() => injectRenderer(wc), 2000);
    setTimeout(() => injectRenderer(wc), 6000);
  };
  wc.on('dom-ready', fire);
  wc.on('did-finish-load', fire);
  startBridge(wc);

  try {
    wc.on('before-input-event', (_e, input) => {
      if (!input || input.type !== 'keyDown' || !SETTINGS.devtools) return;
      const key = String(input.key || '').toLowerCase();
      const combo = input.control && input.shift && (key === 'i' || key === 'j' || key === 'c');
      if (key !== 'f12' && !combo) return;
      try {
        if (wc.isDevToolsOpened() && key !== 'c') wc.closeDevTools();
        else wc.openDevTools({ mode: 'detach' });
      } catch (_) {}
    });
  } catch (_) {}
}

try { syncFromSource(); } catch (e) { console.error('[DiscordUtils] syncFromSource:', e); }
updateFromRepo().catch(() => {});
try { watchDiscordApps(); } catch (e) { console.error('[DiscordUtils] watchDiscordApps:', e); }

if (electron && electron.app) {
  electron.app.on('browser-window-created', (_event, window) => {
    try {
      hookWindow(window);
    } catch (e) {
      console.error('[DiscordUtils] hookWindow failed:', e);
    }
  });
  console.log('[DiscordUtils] inject.js loaded, waiting for windows.');
} else {
  console.error('[DiscordUtils] electron.app unavailable; renderer will not be injected.');
}
