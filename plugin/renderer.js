
if (window.__DiscordUtilsLoaded) {  } else {
  window.__DiscordUtilsLoaded = true;
  if (!window.DiscordNative) {  } else {
  (function () {
    'use strict';

    const NS = 'DiscordUtils';
    const API = 'https://discord.com/api/v10';
    const CDN = 'https://cdn.discordapp.com';
    const log = (...a) => console.log(`[${NS}]`, ...a);
    const sl = (ms) => new Promise((r) => setTimeout(r, ms));

    const slCancel = async (ms, ctx) => { const end = Date.now() + ms; while (Date.now() < end) { if (ctx && ctx.cancelled) return; await sl(Math.min(250, end - Date.now())); } };
    let MY_ID = null;

    (function restoreLocalStorage() {
      try {
        if (window.localStorage) return;

        let ls = null;
        try { const proto = Object.getPrototypeOf(window); ls = proto && proto.localStorage; } catch (_) {}
        if (!ls) {
          let f = document.getElementById('du-ls-frame');
          if (!f) {
            f = document.createElement('iframe');
            f.id = 'du-ls-frame';
            f.setAttribute('aria-hidden', 'true');
            f.style.cssText = 'display:none!important;width:0;height:0;border:0';
            (document.body || document.documentElement).appendChild(f);
          }
          try { ls = f.contentWindow && f.contentWindow.localStorage; } catch (_) {}
        }
        if (!ls) { log('localStorage indisponível — usando só settings.json.'); return; }
        Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ls });
        log('localStorage restaurado.');
      } catch (e) { log('não deu pra restaurar o localStorage:', e); }
    })();

    function looksLikeToken(t) { if (typeof t !== 'string') return false; const s = t.replace(/^Bearer\s+/i, '').replace(/^"|"$/g, ''); return s.length > 40 && (s.includes('.') || s.startsWith('mfa.')); }
    let _tok = null, _sp = null;
    (function hookAuth() {
      try { const of = window.fetch; if (typeof of === 'function' && !of.__duHooked) { const w = function () { try { const h = arguments[1] && arguments[1].headers; if (h) { const pick = (k) => (typeof h.get === 'function' ? h.get(k) : (h[k] !== undefined ? h[k] : h[k.toLowerCase()])); const a = pick('Authorization') || pick('authorization'); if (looksLikeToken(a)) _tok = String(a).replace(/^Bearer\s+/i, '').replace(/^"|"$/g, ''); const s = pick('X-Super-Properties') || pick('x-super-properties'); if (s) _sp = String(s); } } catch (_) {} return of.apply(this, arguments); }; w.__duHooked = true; window.fetch = w; } } catch (_) {}
      try { const sh = XMLHttpRequest.prototype.setRequestHeader; if (!sh.__duHooked) { const w = function (k, v) { try { const n = String(k); if (/^authorization$/i.test(n) && looksLikeToken(v)) _tok = String(v).replace(/^Bearer\s+/i, '').replace(/^"|"$/g, ''); else if (/^x-super-properties$/i.test(n) && v) _sp = String(v); } catch (_) {} return sh.apply(this, arguments); }; w.__duHooked = true; XMLHttpRequest.prototype.setRequestHeader = w; } } catch (_) {}
    })();

    let wpReq = null;
    function getRequire() { if (wpReq && wpReq.c) return wpReq; try { window.webpackChunkdiscord_app.push([[Symbol(NS)], {}, (r) => { wpReq = r; }]); } catch (_) {} return wpReq && wpReq.c ? wpReq : null; }
    function candidatesOf(exp) { const out = []; for (const key of [null, 'default', 'Z', 'ZP', 'YY', 'Y']) { let c; try { c = key === null ? exp : exp[key]; } catch (_) { continue; } if (c && (typeof c === 'object' || typeof c === 'function')) out.push(c); } return out; }
    function find(filter) { const req = getRequire(); if (!req || !req.c) return null; for (const id in req.c) { let exp; try { exp = req.c[id] && req.c[id].exports; } catch (_) { continue; } if (!exp || exp === window || exp === document) continue; for (const c of candidatesOf(exp)) { try { if (filter(c)) return c; } catch (_) {} } } return null; }
    const findByProps = (...p) => find((c) => p.every((k) => { try { return typeof c[k] !== 'undefined'; } catch (_) { return false; } }));
    const findByMethods = (...p) => find((c) => p.every((k) => { try { return typeof c[k] === 'function'; } catch (_) { return false; } }));

    function getToken() {
      if (looksLikeToken(_tok)) return _tok;
      try { const a = findByProps('getToken', 'getId') || findByProps('getToken'); if (a && typeof a.getToken === 'function') { const t = a.getToken(); if (looksLikeToken(t)) return String(t).replace(/^"|"$/g, ''); } } catch (_) {}
      let f = null; try { find((c) => { if (typeof c.getToken === 'function') { try { const t = c.getToken(); if (looksLikeToken(t)) { f = t; return true; } } catch (_) {} } return false; }); } catch (_) {}
      if (f) return String(f).replace(/^"|"$/g, '');
      for (const s of [() => localStorage, () => sessionStorage]) { try { const ls = s(); const t = ls.getItem('token') || ls.getItem('Token'); if (t) { const v = String(t).replace(/^"|"$/g, ''); if (looksLikeToken(v)) return v; } } catch (_) {} }
      return null;
    }
    const findRestAPI = () => findByProps('getAPIBaseURL', 'get') || findByProps('get', 'post', 'put', 'patch', 'del');

    function superProps() {
      if (_sp) return _sp;
      try { const m = findByProps('getSuperPropertiesBase64'); if (m) { const v = m.getSuperPropertiesBase64(); if (v) return (_sp = String(v)); } } catch (_) {}
      try { const m = findByProps('getSuperProperties'); if (m) { const v = m.getSuperProperties(); if (v) return (_sp = btoa(JSON.stringify(v))); } } catch (_) {}
      return null;
    }
    async function req(path, opts = {}) {
      const method = (opts.method || 'GET').toUpperCase();
      const token = getToken();
      if (token) {
        const headers = { Authorization: token };
        if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
        const sp = superProps(); if (sp) headers['X-Super-Properties'] = sp;
        if (opts.headers) Object.assign(headers, opts.headers);
        const res = await fetch(API + path, { method, headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined, cache: 'no-store' });
        let data = null; try { data = await res.json(); } catch (_) {}
        return { ok: res.ok, status: res.status, data };
      }
      try { const rest = findRestAPI(); if (rest && method === 'GET' && rest.get) { const r = await rest.get({ url: path }); const st = r.status ?? 200; return { ok: st >= 200 && st < 300, status: st, data: r.body !== undefined ? r.body : r }; } } catch (_) {}
      throw new Error('token indisponível — aguarde o Discord carregar');
    }

    function limiter(start = 420, min = 220, max = 6000) {
      return {
        d: start, min, max, s: 0,
        ok() { if (++this.s >= 3) { this.s = 0; this.d = Math.max(this.min, Math.round(this.d * 0.8)); } },
        hit() { this.s = 0; this.d = Math.min(this.max, Math.round(this.d * 1.5) + 100); },
      };
    }
    const GLOBAL_RL = { until: 0 };
    async function reqRL(path, opts, ctx, lim) {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (ctx && ctx.cancelled) return { ok: false, status: 0, data: null, cancelled: true };
        const wait = GLOBAL_RL.until - Date.now();
        if (wait > 0) await sl(Math.min(wait, 30000));
        let r;
        try { r = await req(path, opts); } catch (_) { await sl(1500); continue; }
        if (r.status === 429) {
          const d = r.data || {};
          let ra = Number(d.retry_after != null ? d.retry_after : d.retryAfter);
          if (!isFinite(ra) || ra < 0) ra = 1;
          const ms = Math.min(60000, Math.round(ra > 1000 ? ra : ra * 1000) + 300);
          if (lim) lim.hit();
          if (d.global) GLOBAL_RL.until = Date.now() + ms;
          if (ctx && ctx.note) ctx.note(`Limite atingido — retomando em ${Math.ceil(ms / 1000)}s…`);
          await sl(ms);
          continue;
        }
        if (r.status >= 500 && r.status < 600) { await sl(1000 + attempt * 500); continue; }
        if (lim) lim.ok();
        return r;
      }
      return { ok: false, status: 429, data: null };
    }

    async function pool(items, size, worker, ctx) {
      let i = 0;
      const n = Math.max(1, Math.min(size, items.length));
      await Promise.all(new Array(n).fill(0).map(async () => {
        for (;;) {
          if (ctx && ctx.cancelled) return;
          const idx = i++;
          if (idx >= items.length) return;
          try { await worker(items[idx], idx); } catch (_) {}
        }
      }));
    }

    const _sc = {};
    const store = (key, ...m) => (_sc[key] = _sc[key] || findByMethods(...m));
    const Stores = { get user() { return store('user', 'getCurrentUser', 'getUser'); } };
    const currentUser = () => { try { const us = Stores.user; return us && us.getCurrentUser ? us.getCurrentUser() : null; } catch (_) { return null; } };
    const DISCORD_EPOCH = 1420070400000;
    const snowStr = (id) => { try { return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (_) { return '—'; } };

    const cache = { get(k) { try { return JSON.parse(localStorage.getItem('DiscordUtils.cache.' + k) || 'null'); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem('DiscordUtils.cache.' + k, JSON.stringify(v)); } catch (_) {} } };
    const POS_KEY = 'DiscordUtils.pos';
    const loadPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) { return null; } };
    const savePos = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (_) {} };

    const defAvatar = (id) => `${CDN}/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;

    const avatarUrl = (id, hash, s = 128, anim = true) => (!hash ? defAvatar(id) : `${CDN}/avatars/${id}/${hash}.${anim && hash.startsWith('a_') ? 'gif' : 'png'}?size=${s}`);
    const bannerUrl = (id, hash, s = 600) => (!hash ? '' : `${CDN}/banners/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${s}`);
    const iconUrl = (gid, hash, s = 96, anim = true) => (!hash ? '' : `${CDN}/icons/${gid}/${hash}.${anim && hash.startsWith('a_') ? 'gif' : 'png'}?size=${s}`);
    const tagBadgeUrl = (gid, badge) => (!gid || !badge ? '' : `${CDN}/guild-tag-badges/${gid}/${badge}.png?size=48`);
    const badgeIconUrl = (b) => b.simple_icon_url || (b.icon ? `${CDN}/badge-icons/${b.icon}.png` : '');
    const NITRO = { 0: null, 1: 'Nitro Classic', 2: 'Nitro', 3: 'Nitro Basic' };

    const P = {
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
      chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
      x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
      userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>',
      door: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
      bellOff: '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
      search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
      link: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
      calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
      eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
      alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/>',
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
      sparkles: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 15l.7 2.1L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.9z"/>',
      rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
      compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
      play: '<polygon points="5 3 19 12 5 21 5 3"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
      pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
      list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
      layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    };
    const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

    const GEAR_FILLED = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';

    const STYLE_ID = 'discord-utils-style', NAV_ID = 'du-nav-item';
    function injectBaseStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const s = document.createElement('style'); s.id = STYLE_ID;
      s.textContent = `
        #${NAV_ID}{display:flex;align-items:center;height:42px;padding:0 8px;margin:1px 0;border-radius:8px;cursor:pointer;color:var(--channels-default,#949ba4);font-family:var(--font-primary,"gg sans",system-ui,sans-serif)}
        #${NAV_ID}:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06));color:var(--interactive-hover,#f2f3f5)}
        #${NAV_ID} .du-ico{display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin-right:12px;flex:0 0 auto}
        #${NAV_ID} .du-lbl{font-size:16px;font-weight:700;white-space:nowrap}

        #du-panel{--bg:#0b0b0f;--bg2:#131319;--bg3:#1b1b23;--line:rgba(255,255,255,.07);--txt:#ececed;--mut:#7d7d89;--acc:#8b5cf6;--red:#ed4245;--warn:#e0913a;
          position:fixed;z-index:2147483000;width:min(440px,calc(100vw - 24px));max-height:min(700px,84vh);display:none;flex-direction:column;overflow:hidden;
          background:var(--bg);color:var(--txt);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.3);
          font-family:var(--font-primary,"gg sans",system-ui,sans-serif);opacity:0;transform:scale(.97);transition:opacity .14s,transform .14s}
        #du-panel.open{display:flex;opacity:1;transform:scale(1)}
        @media (prefers-reduced-motion:reduce){#du-panel{transition:none}}
        #du-panel *{box-sizing:border-box}
        #du-panel .du-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);border-bottom:1px solid var(--line);cursor:grab;user-select:none}
        #du-panel .du-head:active{cursor:grabbing}
        #du-panel .du-brand{display:flex;align-items:center;gap:9px;flex:1}
        #du-panel .du-brand .du-g{color:var(--acc);display:flex}
        #du-panel .du-title{font-size:14px;font-weight:700}
        #du-panel .du-x{display:flex;padding:5px;border:none;background:none;color:var(--mut);cursor:pointer;border-radius:6px}
        #du-panel .du-x:hover{color:var(--txt);background:rgba(255,255,255,.06)}

        #du-panel .du-tabs{flex:0 0 auto;display:flex;flex-wrap:wrap;padding:6px;gap:3px;background:var(--bg2);border-bottom:1px solid var(--line)}
        #du-panel .du-tab{flex:1 1 30%;min-width:74px;display:flex;align-items:center;justify-content:center;gap:5px;padding:8px 3px;border:none;background:none;color:var(--mut);cursor:pointer;border-radius:8px;font-size:11px;font-weight:600;white-space:nowrap;transition:color .12s,background .12s}
        #du-panel .du-tab svg{flex:0 0 auto}
        #du-panel .du-tab:hover{color:var(--txt);background:rgba(255,255,255,.04)}
        #du-panel .du-tab.active{color:var(--txt);background:rgba(139,92,246,.14);box-shadow:inset 0 0 0 1px rgba(139,92,246,.35)}

        #du-panel .du-body{position:relative;flex:1 1 auto;min-height:120px;padding:14px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}

        @media (max-height:820px){#du-panel{max-height:min(700px,88vh)}}
        @media (max-height:620px){#du-panel{max-height:92vh}#du-panel .du-body{padding:11px;min-height:90px}#du-panel .du-tab{padding:6px 3px}}
        @media (max-width:560px){#du-panel{width:calc(100vw - 16px)}}
        #du-panel .du-body::-webkit-scrollbar{width:8px}
        #du-panel .du-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:4px}
        #du-panel .du-sec{font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--mut);margin:14px 0 8px;font-weight:700}
        #du-panel .du-sec:first-child{margin-top:0}
        #du-panel .du-hint{font-size:11px;color:var(--mut);line-height:1.5;margin-top:6px}

        #du-panel .du-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px;margin:6px 0;border:1px solid var(--line);border-radius:10px;background:var(--bg2);color:var(--txt);cursor:pointer;font-size:13px;font-weight:600;transition:background .12s,border-color .12s}
        #du-panel .du-btn:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14)}
        #du-panel .du-btn:disabled{opacity:.45;cursor:default}
        #du-panel .du-btn.acc{background:var(--acc);border-color:var(--acc);color:#fff}
        #du-panel .du-btn.acc:hover{background:#7c46ec}
        #du-panel .du-btn.red{background:rgba(237,66,69,.12);border-color:rgba(237,66,69,.4);color:#ff6b6e}
        #du-panel .du-btn.red:hover{background:rgba(237,66,69,.2)}

        #du-panel .du-input{width:100%;margin:6px 0;padding:10px;border-radius:10px;border:1px solid var(--line);background:#08080b;color:var(--txt);font-size:12px}
        #du-panel .du-input:focus{outline:none;border-color:var(--acc)}
        #du-panel select.du-input{cursor:pointer}

        #du-panel .du-stat{display:flex;align-items:center;gap:11px;padding:9px 11px;margin:5px 0;background:var(--bg2);border:1px solid var(--line);border-radius:10px}
        #du-panel .du-stat .si{display:flex;color:var(--acc);flex:0 0 auto}
        #du-panel .du-stat .sl{flex:0 0 auto;font-size:12px;color:var(--mut)}
        #du-panel .du-stat .sv{flex:1;text-align:right;font-size:12.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #du-panel .du-stat.click{cursor:pointer}
        #du-panel .blur{filter:blur(5px);user-select:none;transition:filter .15s}

        #du-panel .du-search{display:flex;align-items:center;gap:8px;padding:0 11px;margin-bottom:10px;background:#08080b;border:1px solid var(--line);border-radius:10px}
        #du-panel .du-search svg{color:var(--mut);flex:0 0 auto}
        #du-panel .du-search input{flex:1;padding:9px 0;border:none;background:none;color:var(--txt);font-size:13px}
        #du-panel .du-search input:focus{outline:none}
        #du-panel .du-cnt{font-size:11px;color:var(--mut);margin-bottom:8px}

        #du-panel .du-li{display:flex;align-items:center;gap:10px;padding:8px;margin:4px 0;background:var(--bg2);border:1px solid var(--line);border-radius:10px}
        #du-panel .du-li .av{width:36px;height:36px;border-radius:50%;flex:0 0 auto;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;overflow:hidden}
        #du-panel .du-li .av.sq{border-radius:10px}
        #du-panel .du-li .av img{width:100%;height:100%;object-fit:cover}
        #du-panel .du-li .inf{flex:1;min-width:0}
        #du-panel .du-li .nm{font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #du-panel .du-li .sb{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #du-panel .du-li .ac{display:flex;gap:5px;flex:0 0 auto}
        #du-panel .du-ib{display:flex;padding:7px;border:1px solid var(--line);border-radius:8px;background:none;color:var(--mut);cursor:pointer}
        #du-panel .du-ib:hover{color:#fff;background:rgba(255,255,255,.06)}
        #du-panel .du-ib.red:hover{color:#fff;background:var(--red);border-color:var(--red)}
        #du-panel .du-ib.warn:hover{color:#fff;background:var(--warn);border-color:var(--warn)}
        #du-panel .du-ib.on{color:var(--acc);border-color:rgba(139,92,246,.5)}
        #du-panel .owner{font-size:9px;font-weight:700;color:#000;background:var(--warn);padding:1px 5px;border-radius:4px;margin-left:6px;vertical-align:middle}

        #du-panel .pf-banner{height:100px;margin:-14px -14px 0;background:linear-gradient(135deg,#5865F2,#8b5cf6);background-size:cover;background-position:center}
        #du-panel .pf-av{width:80px;height:80px;border-radius:50%;border:5px solid var(--bg);background:var(--bg3);overflow:hidden;margin:-42px 0 0 2px;position:relative;z-index:1}
        #du-panel .pf-av img{width:100%;height:100%;object-fit:cover}
        #du-panel .pf-nm{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:19px;font-weight:800;color:#fff;margin-top:10px}
        #du-panel .pf-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#fff;background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px}
        #du-panel .pf-tag img{width:14px;height:14px;border-radius:3px}
        #du-panel .pf-un{font-size:13px;color:var(--mut);margin-top:3px}
        #du-panel .pf-badges{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
        #du-panel .pf-badges img{width:24px;height:24px}
        #du-panel .pf-nitro{font-size:10.5px;font-weight:700;color:#ffd9a0;background:rgba(224,145,58,.13);border:1px solid rgba(224,145,58,.3);padding:3px 9px;border-radius:20px}
        #du-panel .pf-nums{display:flex;gap:8px;margin:12px 0}
        #du-panel .pf-num{flex:1;text-align:center;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px 4px}
        #du-panel .pf-num .n{font-family:ui-monospace,Consolas,monospace;font-size:18px;font-weight:700;color:#fff}
        #du-panel .pf-num .l{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}

        #du-panel .du-tg{display:flex;align-items:center;gap:11px;padding:11px;margin:5px 0;background:var(--bg2);border:1px solid var(--line);border-radius:10px;cursor:pointer}
        #du-panel .du-tg .tgi{display:flex;color:var(--acc);flex:0 0 auto}
        #du-panel .du-tg .tgt{flex:1;min-width:0}
        #du-panel .du-tg .tgt b{display:block;font-size:13px;color:#fff;font-weight:600}
        #du-panel .du-tg .tgt small{font-size:11px;color:var(--mut)}
        #du-panel .du-sw{position:relative;width:38px;height:22px;flex:0 0 auto;border-radius:11px;background:#2a2a34;transition:background .15s}
        #du-panel .du-sw::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
        #du-panel .du-tg.on .du-sw{background:var(--acc)}
        #du-panel .du-tg.on .du-sw::after{transform:translateX(16px)}

        #du-toasts{position:fixed;right:18px;bottom:18px;z-index:2147483040;display:flex;flex-direction:column;gap:10px;align-items:flex-end;width:min(370px,calc(100vw - 36px));pointer-events:none;font-family:var(--font-primary,"gg sans",system-ui,sans-serif)}
        .du-toast{--tc:#8b5cf6;--tcb:rgba(139,92,246,.18);position:relative;box-sizing:border-box;pointer-events:auto;display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px 14px 15px;overflow:hidden;border-radius:14px;border:1px solid rgba(255,255,255,.08);border-left:3px solid var(--tc);background:linear-gradient(150deg,#17171f,#0d0d12);box-shadow:0 18px 44px rgba(0,0,0,.6);color:#ececed;opacity:0;transform:translateX(20px) scale(.97);transition:opacity .22s cubic-bezier(.2,.9,.25,1),transform .22s cubic-bezier(.2,.9,.25,1)}
        .du-toast.in{opacity:1;transform:none}
        .du-toast.out{opacity:0;transform:translateX(20px) scale(.97)}
        .du-toast .ti{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:11px;background:var(--tcb);color:var(--tc)}
        .du-toast .tc{flex:1;min-width:0;padding-top:1px}
        .du-toast .tt{font-size:13.5px;font-weight:800;color:#fff;line-height:1.2}
        .du-toast .tm{margin-top:3px;font-size:12.5px;line-height:1.45;color:#b6b6c4;word-break:break-word}
        .du-toast .tx{flex:0 0 auto;display:flex;padding:4px;border:none;background:none;color:#6f6f7d;cursor:pointer;border-radius:6px}
        .du-toast .tx:hover{color:#fff;background:rgba(255,255,255,.07)}
        .du-toast .tbar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:var(--tc);opacity:.5;transform-origin:left;animation:dutbar linear forwards}
        @keyframes dutbar{from{transform:scaleX(1)}to{transform:scaleX(0)}}

        #du-jobs{position:fixed;right:18px;top:76px;z-index:2147483030;display:none;flex-direction:column;gap:10px;width:min(320px,calc(100vw - 36px));max-height:60vh;overflow-y:auto;font-family:var(--font-primary,"gg sans",system-ui,sans-serif)}
        #du-jobs::-webkit-scrollbar{width:0}
        #du-jobs.on{display:flex}
        .du-job{box-sizing:border-box;padding:12px 13px 11px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(150deg,#17171f,#0d0d12);box-shadow:0 16px 40px rgba(0,0,0,.55);color:#ececed}
        .du-job .jh{display:flex;align-items:center;gap:9px}
        .du-job .ji{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:rgba(139,92,246,.18);color:#a78bfa}
        .du-job .jt{flex:1;min-width:0;font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .du-job .jx{flex:0 0 auto;display:flex;padding:4px;border:none;background:none;color:#6f6f7d;cursor:pointer;border-radius:6px}
        .du-job .jx:hover{color:#fff;background:rgba(237,66,69,.85)}
        .du-job .jbar{height:6px;margin:10px 0 7px;border-radius:4px;background:#22222c;overflow:hidden}
        .du-job .jfill{height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#5865F2,#8b5cf6);transition:width .25s}
        .du-job .jfill.ind{width:38%;animation:duind 1.1s infinite ease-in-out}
        @keyframes duind{0%{margin-left:-38%}100%{margin-left:100%}}
        .du-job .js{font-size:11px;color:#9a9aa8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        #du-modalbg{position:fixed;inset:0;z-index:2147483035;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);opacity:0;transition:opacity .12s}
        #du-modalbg.on{opacity:1}
        #du-modal{width:340px;max-width:90vw;background:#0b0b0f;border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.7);padding:22px 20px;text-align:center;font-family:var(--font-primary,"gg sans",system-ui,sans-serif);transform:scale(.96);transition:transform .12s}
        #du-modalbg.on #du-modal{transform:scale(1)}
        #du-modal .mi{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;background:rgba(139,92,246,.14);color:#8b5cf6}
        #du-modal .mi.danger{background:rgba(237,66,69,.14);color:#ff6b6e}
        #du-modal .mt{font-size:17px;font-weight:800;color:#fff;margin-bottom:7px}
        #du-modal .mm{font-size:13px;color:#c9c9d1;line-height:1.55}
        #du-modal .mchk{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:16px;font-size:12.5px;color:#c9c9d1;cursor:pointer}
        #du-modal .mchk input{width:16px;height:16px;accent-color:#8b5cf6}
        #du-modal .macts{display:flex;gap:10px;margin-top:20px}
        #du-modal .du-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:11px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#1b1b23;color:#ececed;cursor:pointer;font-size:13.5px;font-weight:600;transition:background .12s,border-color .12s}
        #du-modal .du-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16)}
        #du-modal .du-btn:disabled{opacity:.4;cursor:default}
        #du-modal .du-btn.acc{background:#8b5cf6;border-color:#8b5cf6;color:#fff}
        #du-modal .du-btn.acc:hover{background:#7c46ec}
        #du-modal .du-btn.red{background:#ed4245;border-color:#ed4245;color:#fff}
        #du-modal .du-btn.red:hover{background:#c93438}

        #du-modalbg.cap{z-index:1000000}
        html.du-captcha-open #du-panel{z-index:999000}
        html.du-captcha-open #du-jobs{z-index:999500}
        html.du-captcha-open #du-toasts{z-index:1000500}
        #du-modal.cap{width:368px}
        #du-modal .cap-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;min-height:104px;margin-top:16px;padding:15px 12px;border-radius:12px;background:#08080b;border:1px solid rgba(255,255,255,.07)}
        #du-modal .cap-msg{font-size:12px;line-height:1.5;color:#9a9aa8;text-align:center}
        #du-modal .cap-msg.err{color:#ff8f91}
        #du-modal .cap-go{width:auto;margin:0;padding:9px 22px}

        #du-panel .du-pills{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:12px}
        #du-panel .du-pill{font-size:11px;font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--line);background:var(--bg2);color:var(--mut);cursor:pointer;white-space:nowrap}
        #du-panel .du-pill:hover{color:var(--txt)}
        #du-panel .du-pill.on{color:#fff;background:rgba(139,92,246,.18);border-color:rgba(139,92,246,.45)}
        #du-panel .q-card{display:flex;gap:11px;padding:11px;margin:6px 0;background:var(--bg2);border:1px solid var(--line);border-radius:12px}
        #du-panel .q-thumb{width:52px;height:52px;border-radius:10px;object-fit:cover;background:var(--bg3);flex:0 0 auto}
        #du-panel .q-body{flex:1;min-width:0}
        #du-panel .q-top{display:flex;align-items:center;gap:8px}
        #du-panel .q-name{flex:1;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #du-panel .q-meta{font-size:11px;color:var(--mut);margin-top:3px}
        #du-panel .q-reward{display:inline-block;font-size:11px;font-weight:600;color:#ffd9a0;background:rgba(224,145,58,.13);border:1px solid rgba(224,145,58,.3);padding:1px 8px;border-radius:20px;margin-top:6px}
        #du-panel .q-badge{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:6px;flex:0 0 auto}
        #du-panel .q-badge.available{color:#c4b5fd;background:rgba(139,92,246,.16)}
        #du-panel .q-badge.pending{color:#f0b674;background:rgba(224,145,58,.16)}
        #du-panel .q-badge.done{color:#7ee0a3;background:rgba(59,165,93,.16)}
        #du-panel .q-badge.expired{color:#ff8f91;background:rgba(237,66,69,.16)}
        #du-panel .q-badge.reward{color:#ffd9a0;background:rgba(224,145,58,.16)}
        #du-panel .q-do{margin-top:9px;padding:7px}
`;
      document.head.appendChild(s);
    }

    const TOAST_KIND = {
      ok: { c: '#3ba55d', b: 'rgba(59,165,93,.18)', i: 'check', t: 'Tudo certo' },
      err: { c: '#ed4245', b: 'rgba(237,66,69,.18)', i: 'alert', t: 'Erro' },
      inf: { c: '#5865F2', b: 'rgba(88,101,242,.18)', i: 'info', t: 'Aviso' },
      warn: { c: '#e0913a', b: 'rgba(224,145,58,.18)', i: 'alert', t: 'Atenção' },
    };
    let toastRoot = null;
    function toastsRoot() {
      if (!toastRoot || !toastRoot.isConnected) { toastRoot = document.getElementById('du-toasts') || el('div', { id: 'du-toasts' }); if (!toastRoot.isConnected) document.body.appendChild(toastRoot); }
      return toastRoot;
    }
    function toast(msg, type = 'ok', title) {
      const k = TOAST_KIND[type] || TOAST_KIND.ok;
      const life = type === 'err' ? 7000 : 4800;
      const t = el('div', { className: 'du-toast' });
      t.style.setProperty('--tc', k.c); t.style.setProperty('--tcb', k.b);
      t.innerHTML = `<span class="ti">${icon(k.i, 19)}</span>
        <div class="tc"><div class="tt">${esc(title || k.t)}</div><div class="tm">${esc(msg)}</div></div>
        <button class="tx" title="Fechar">${icon('x', 13)}</button>
        <div class="tbar" style="animation-duration:${life}ms"></div>`;
      const root = toastsRoot();
      root.appendChild(t);
      while (root.children.length > 4) root.firstElementChild.remove();
      requestAnimationFrame(() => t.classList.add('in'));
      let timer = setTimeout(close, life);
      const bar = t.querySelector('.tbar');
      function close() { clearTimeout(timer); t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 240); }
      t.querySelector('.tx').onclick = close;
      t.addEventListener('mouseenter', () => { clearTimeout(timer); bar.style.animationPlayState = 'paused'; });
      t.addEventListener('mouseleave', () => { timer = setTimeout(close, 1500); bar.style.animationPlayState = 'running'; });
      return t;
    }
    function copy(text) { try { if (window.DiscordNative?.clipboard?.copy) window.DiscordNative.clipboard.copy(String(text)); else navigator.clipboard.writeText(String(text)); toast('Copiado'); } catch (_) { toast('Falha ao copiar', 'err'); } }
    const el = (tag, props = {}, kids = []) => { const n = document.createElement(tag); Object.assign(n, props); for (const c of [].concat(kids)) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); return n; };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const initials = (name) => (name || '?').replace(/[^\w]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

    function duConfirm({ title, message, danger, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', requireCheck }) {
      return new Promise((resolve) => {
        const bg = el('div', { id: 'du-modalbg' });
        bg.innerHTML = `<div id="du-modal">
          <div class="mi ${danger ? 'danger' : ''}">${icon(danger ? 'alert' : 'shield', 22)}</div>
          <div class="mt">${esc(title)}</div>
          <div class="mm">${esc(message).replace(/\n/g, '<br>')}</div>
          ${requireCheck ? `<label class="mchk"><input type="checkbox"><span>${esc(requireCheck)}</span></label>` : ''}
          <div class="macts"><button class="du-btn cancel">${esc(cancelLabel)}</button><button class="du-btn ${danger ? 'red' : 'acc'} ok" ${requireCheck ? 'disabled' : ''}>${esc(confirmLabel)}</button></div>
        </div>`;
        document.body.appendChild(bg);
        requestAnimationFrame(() => bg.classList.add('on'));
        const okBtn = bg.querySelector('.ok');
        if (requireCheck) bg.querySelector('input').onchange = (e) => { okBtn.disabled = !e.target.checked; };
        const done = (v) => { bg.classList.remove('on'); setTimeout(() => bg.remove(), 130); resolve(v); };
        bg.querySelector('.cancel').onclick = () => done(false);
        okBtn.onclick = () => done(true);
        bg.onclick = (e) => { if (e.target === bg) done(false); };
      });
    }

    const jobs = [];
    let jobSeq = 0, jobsEl = null, jobsPaintQueued = false;
    function jobsRoot() {
      if (!jobsEl || !jobsEl.isConnected) { jobsEl = document.getElementById('du-jobs') || el('div', { id: 'du-jobs' }); if (!jobsEl.isConnected) document.body.appendChild(jobsEl); }
      return jobsEl;
    }
    function paintJobs() {
      if (jobsPaintQueued) return;
      jobsPaintQueued = true;
      requestAnimationFrame(() => {
        jobsPaintQueued = false;
        const root = jobsRoot();
        root.classList.toggle('on', jobs.length > 0);
        for (const j of jobs) {
          if (!j.node || !j.node.isConnected) {
            j.node = el('div', { className: 'du-job' });
            j.node.innerHTML = `<div class="jh"><span class="ji">${icon(j.icon, 15)}</span><div class="jt"></div><button class="jx" title="Cancelar">${icon('x', 14)}</button></div><div class="jbar"><div class="jfill ind"></div></div><div class="js"></div>`;
            j.node.querySelector('.jx').onclick = () => cancelJob(j);
            root.appendChild(j.node);
          }
          j.node.querySelector('.jt').textContent = j.title;
          j.node.querySelector('.js').textContent = j.status;
          const f = j.node.querySelector('.jfill');
          if (j.total > 0) { f.className = 'jfill'; f.style.width = Math.min(100, Math.round(j.done / j.total * 100)) + '%'; }
          else f.className = 'jfill ind';
        }
      });
    }
    function cancelJob(j) { j.cancelled = true; j.status = 'Cancelando…'; try { if (j.onCancel) j.onCancel(); } catch (_) {} paintJobs(); }
    function startJob(title, iconName, status) {
      const j = { id: ++jobSeq, title, icon: iconName || 'zap', done: 0, total: 0, status: status || 'Iniciando…', cancelled: false, node: null };
      j.update = (done, total, st) => { j.done = done; j.total = total; if (st != null) j.status = st; paintJobs(); };
      j.note = (st) => { j.status = st; paintJobs(); };
      j.end = () => { const i = jobs.indexOf(j); if (i >= 0) jobs.splice(i, 1); if (j.node) { j.node.remove(); j.node = null; } paintJobs(); };
      jobs.push(j); paintJobs();
      return j;
    }

    function runJob(title, iconName, status, fn) {
      const j = startJob(title, iconName, status);
      (async () => {
        try { await fn(j); }
        catch (e) { toast(e && e.message ? e.message : String(e), 'err', title); }
        finally { j.end(); }
      })();
      return j;
    }

    async function loadProfile() {
      const cached = cache.get('profile');
      const me = await req('/users/@me').catch(() => null);
      let user = me && me.ok && me.data ? me.data : cached;
      if (!user) return null;
      MY_ID = user.id;
      try {
        const pr = await req(`/users/${user.id}/profile?type=popout&with_mutual_guilds=false&with_mutual_friends=false&with_mutual_friends_count=false`);
        if (pr.ok && pr.data) {
          user = { ...user, badges: pr.data.badges || [], connected_accounts: pr.data.connected_accounts || [] };
          if (pr.data.user) { user.banner = user.banner || pr.data.user.banner; user.primary_guild = pr.data.user.primary_guild || user.primary_guild; }
        }
      } catch (_) {}
      cache.set('profile', user);
      return user;
    }
    async function loadFriends() { const r = await req('/users/@me/relationships').catch(() => null); if (r && r.ok && Array.isArray(r.data)) { const fr = r.data.filter((x) => x.type === 1); cache.set('friends', fr); return fr; } return cache.get('friends') || []; }
    async function loadGuilds() { const r = await req('/users/@me/guilds?limit=200&with_counts=true').catch(() => null); if (r && r.ok && Array.isArray(r.data)) { cache.set('guilds', r.data); return r.data; } return cache.get('guilds') || []; }
    async function loadDMs() { const r = await req('/users/@me/channels').catch(() => null); if (r && r.ok && Array.isArray(r.data)) return r.data.filter((c) => c.type === 1 || c.type === 3); return []; }

    async function deleteMyMessagesInChannel(cid, ctx, offset) {
      const lim = limiter(420);
      const base = offset || 0;
      let del = 0, scanned = 0, before = null;
      while (!(ctx && ctx.cancelled)) {
        let url = `/channels/${cid}/messages?limit=100`; if (before) url += `&before=${before}`;
        const r = await reqRL(url, undefined, ctx, lim);
        if (!r.ok) break;
        const msgs = r.data;
        if (!Array.isArray(msgs) || !msgs.length) break;
        scanned += msgs.length;
        for (const m of msgs.filter((m) => m.author && m.author.id === MY_ID)) {
          if (ctx && ctx.cancelled) break;
          const dr = await reqRL(`/channels/${cid}/messages/${m.id}`, { method: 'DELETE' }, ctx, lim);
          if (dr.ok || dr.status === 204) { del++; if (ctx) ctx.update(base + del, 0, `${base + del} apagada(s) · ${scanned} verificadas`); }
          await sl(lim.d);
        }
        before = msgs[msgs.length - 1].id;
        if (msgs.length < 100) break;
      }
      return del;
    }
    async function deleteMyMessagesInGuild(gid, ctx) {
      const lims = new Map();
      const limFor = (cid) => { let l = lims.get(cid); if (!l) { l = limiter(420); lims.set(cid, l); } return l; };
      let del = 0, total = 0;
      while (!(ctx && ctx.cancelled)) {
        const r = await reqRL(`/guilds/${gid}/messages/search?author_id=${MY_ID}&limit=25`, undefined, ctx);
        if (!r.ok) break;
        const hits = (r.data && r.data.messages ? r.data.messages.flat() : []).filter((m) => m.author && m.author.id === MY_ID);
        if (!hits.length) break;
        total = Math.max(total, del + ((r.data && r.data.total_results) || hits.length));

        const byChan = new Map();
        for (const m of hits) { if (!byChan.has(m.channel_id)) byChan.set(m.channel_id, []); byChan.get(m.channel_id).push(m); }
        const deletedBefore = del;
        await pool([...byChan.entries()], 4, async (pair) => {
          const cid = pair[0], list = pair[1], lim = limFor(cid);
          for (const m of list) {
            if (ctx && ctx.cancelled) return;
            const dr = await reqRL(`/channels/${cid}/messages/${m.id}`, { method: 'DELETE' }, ctx, lim);
            if (dr.ok || dr.status === 204) { del++; if (ctx) ctx.update(del, total, `${del} de ~${total} apagada(s)…`); }
            await sl(lim.d);
          }
        }, ctx);
        if (del === deletedBefore) break;
        await sl(700);
      }
      return del;
    }

    const NSET = (window.__DU_SETTINGS__ = window.__DU_SETTINGS__ || {});
    const outbox = (window.__DU_OUTBOX__ = window.__DU_OUTBOX__ || []);
    const sendNative = (type, data) => { try { outbox.push(data !== undefined ? { type, data } : { type }); } catch (_) {} };
    const setNative = (key, val) => { NSET[key] = val; sendNative('settings', NSET); };

    const CDN_HOST = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i;
    function staticize(url) {
      if (typeof url !== 'string' || !CDN_HOST.test(url)) return url;
      return url
        .replace(/\.gif(\?|$)/i, '.png$1')
        .replace(/([?&])animated=true/gi, '$1animated=false');
    }
    let freezeObs = null;
    function freezeImg(img) {
      const cur = img.getAttribute('src');
      const next = staticize(cur);
      if (next !== cur) img.setAttribute('src', next);
    }
    function freezeSweep(root) {
      if (root.tagName === 'IMG') { freezeImg(root); return; }
      if (!root.querySelectorAll) return;
      for (const img of root.querySelectorAll('img')) freezeImg(img);
    }
    function setFreezeAnims(on) {
      if (!on) { if (freezeObs) { freezeObs.disconnect(); freezeObs = null; } return; }
      if (freezeObs) return;
      freezeSweep(document.body);
      freezeObs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'attributes') { freezeImg(m.target); continue; }
          for (const n of m.addedNodes) if (n.nodeType === 1) freezeSweep(n);
        }
      });
      freezeObs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }

    const OPTS = [
      { key: 'disblock', icon: 'wand', label: 'Disblock Origin', desc: 'Oculta anúncios, promoções e Nitro', css: () => window.__DU_DISBLOCK_CSS__ || '' },
      { key: 'noanim', icon: 'zap', label: 'Desativar animações', desc: 'Corta transições e animações — interface mais rápida', css: () => '*{animation-duration:1ms!important;animation-delay:0ms!important;transition-duration:1ms!important}' },
      { key: 'freezeanim', icon: 'pause', label: 'Congelar imagens animadas', desc: 'Avatares, emojis e ícones GIF viram estáticos — recarregue (Ctrl+R) para reverter', run: setFreezeAnims },
      { key: 'nodeco', icon: 'sparkles', label: 'Ocultar decorações animadas', desc: 'Some nameplates, molduras e coletáveis — bem mais leve', css: () => '[class*="avatarDecoration"],[class*="nameplate"],[class*="Nameplate"],[class*="collectible"],[class*="Collectible"],[class*="profileEffect"],[class*="ProfileEffect"]{display:none!important}' },
      { key: 'noblur', icon: 'droplet', label: 'Desativar desfoque (blur)', desc: 'Remove backdrop-filter — reduz uso da GPU', css: () => '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },

      { key: 'cvauto', icon: 'layers', label: 'Renderizar só o que aparece', desc: 'Pula o desenho das mensagens fora da tela — ajuda muito em canais longos', css: () => '[class*="messageListItem"]{content-visibility:auto;contain-intrinsic-size:auto 44px}' },
      { key: 'nomembers', icon: 'list', label: 'Ocultar lista de membros', desc: 'Deixa de desenhar centenas de avatares e presenças em servidores grandes', css: () => '[class*="membersWrap"]{display:none!important}' },
    ];

    const optKey = (k) => 'DiscordUtils.opt.' + k;
    const optState = () => (NSET.opts && typeof NSET.opts === 'object' ? NSET.opts : (NSET.opts = {}));
    const optEnabled = (k) => {
      const s = optState();
      if (Object.prototype.hasOwnProperty.call(s, k)) return s[k] === true;
      try { return localStorage.getItem(optKey(k)) === '1'; } catch (_) { return false; }
    };
    function setOptEnabled(k, on) {
      optState()[k] = !!on;
      setNative('opts', optState());
      try { localStorage.setItem(optKey(k), on ? '1' : '0'); } catch (_) {}
    }

    function applyOpt(o, on, silent) {
      if (o.css) {
        const id = 'du-opt-' + o.key;
        let st = document.getElementById(id);
        if (on) { const css = o.css(); if (!css) { if (!silent) toast('CSS indisponível — reinstale o plugin.', 'err'); return false; } if (!st) { st = document.createElement('style'); st.id = id; document.head.appendChild(st); } st.textContent = css; }
        else if (st) { st.remove(); }
      }
      if (o.run) { try { o.run(on); } catch (e) { if (!silent) toast(e && e.message ? e.message : String(e), 'err', o.label); return false; } }
      return true;
    }
    function applyEnabledOpts() { for (const o of OPTS) if (optEnabled(o.key)) applyOpt(o, true, true); guardOpts(); }

    let optGuard = null, optGuardTimer = null;
    function guardOpts() {
      if (optGuard || !document.head) return;
      optGuard = new MutationObserver(() => {
        if (optGuardTimer) return;
        optGuardTimer = setTimeout(() => {
          optGuardTimer = null;
          for (const o of OPTS) if (o.css && optEnabled(o.key) && !document.getElementById('du-opt-' + o.key)) applyOpt(o, true, true);
        }, 400);
      });
      try { optGuard.observe(document.head, { childList: true }); } catch (_) {}
    }

    try { applyEnabledOpts(); } catch (_) {}

    async function closeAllDMs() {
      if (!(await duConfirm({ title: 'Fechar todas as DMs', message: 'Fecha todas as conversas diretas abertas. As mensagens NÃO são apagadas — só somem da sua lista.', danger: true, confirmLabel: 'Fechar todas', requireCheck: 'Entendo' }))) return;
      const dms = await loadDMs();
      if (!dms.length) { toast('Você não tem nenhuma DM aberta.', 'inf'); return; }
      runJob('Fechando todas as DMs', 'x', `${dms.length} conversa(s)`, async (job) => {
        let done = 0;
        await pool(dms, 5, async (dm) => {
          const r = await reqRL(`/channels/${dm.id}`, { method: 'DELETE' }, job);
          if (r.ok || r.status === 200) done++;
          job.update(done, dms.length, `${done} de ${dms.length} fechada(s)…`);
        }, job);
        toast(`${done} de ${dms.length} conversa(s) fechada(s).`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'DMs fechadas');
      });
    }
    async function muteAllServers() {
      if (!(await duConfirm({ title: 'Silenciar todos', message: 'Silenciar TODOS os servidores permanentemente?', confirmLabel: 'Silenciar todos' }))) return;
      const gs = await loadGuilds();
      if (!gs.length) { toast('Nenhum servidor encontrado.', 'inf'); return; }
      runJob('Silenciando servidores', 'bellOff', `${gs.length} servidor(es)`, async (job) => {
        let done = 0;
        await pool(gs, 5, async (g) => {
          const r = await reqRL(`/users/@me/guilds/${g.id}/settings`, { method: 'PATCH', json: { muted: true, mute_config: { selected_time_window: -1, end_time: null } } }, job);
          if (r.ok) done++;
          job.update(done, gs.length, `${done} de ${gs.length} silenciado(s)…`);
        }, job);
        toast(`${done} de ${gs.length} servidor(es) silenciado(s).`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'Servidores silenciados');
      });
    }

    function statRow(iconName, label, value, click) {
      const row = el('div', { className: 'du-stat' + (click ? ' click' : '') });
      row.innerHTML = `<span class="si">${icon(iconName, 17)}</span><span class="sl">${esc(label)}</span><span class="sv">${value === undefined ? '…' : esc(value)}</span>`;
      return { row, val: row.querySelector('.sv') };
    }

    function renderProfileInto(body, u) {
      body.innerHTML = '';
      const banner = bannerUrl(u.id, u.banner);
      const bn = el('div', { className: 'pf-banner' });
      if (banner) bn.style.backgroundImage = `url("${banner}")`;
      else if (u.banner_color) bn.style.background = u.banner_color;
      body.appendChild(bn);

      const av = el('div', { className: 'pf-av' });
      av.innerHTML = `<img src="${avatarUrl(u.id, u.avatar, 160)}" onerror="this.src='${defAvatar(u.id)}'" alt="">`;
      body.appendChild(av);

      const tag = u.primary_guild || u.clan;
      const tagHtml = tag && tag.identity_enabled && tag.tag ? `<span class="pf-tag">${tag.badge ? `<img src="${tagBadgeUrl(tag.identity_guild_id, tag.badge)}" onerror="this.remove()">` : ''}${esc(tag.tag)}</span>` : '';
      body.appendChild(el('div', { className: 'pf-nm', innerHTML: `${esc(u.global_name || u.username)}${tagHtml}` }));
      body.appendChild(el('div', { className: 'pf-un', innerHTML: `@${esc(u.username)}${u.discriminator && u.discriminator !== '0' ? '#' + esc(u.discriminator) : ''}` }));

      const badges = Array.isArray(u.badges) ? u.badges : [];
      if (badges.length) {
        const bw = el('div', { className: 'pf-badges' });
        for (const b of badges) { const url = badgeIconUrl(b); if (!url) continue; const img = el('img', { src: url, title: b.description || b.id, alt: b.description || '' }); img.onerror = () => img.remove(); bw.appendChild(img); }
        body.appendChild(bw);
      }

      const nums = el('div', { className: 'pf-nums' });
      nums.innerHTML = `<div class="pf-num"><div class="n" data-k="friends">…</div><div class="l">Amigos</div></div><div class="pf-num"><div class="n" data-k="guilds">…</div><div class="l">Servidores</div></div><div class="pf-num"><div class="n" data-k="dms">…</div><div class="l">DMs</div></div>`;
      body.appendChild(nums);

      body.appendChild(el('div', { className: 'du-sec' }, 'Detalhes'));
      const idR = statRow('hash', 'ID', u.id, true); idR.row.title = 'Copiar ID'; idR.row.onclick = () => copy(u.id); body.appendChild(idR.row);
      body.appendChild(statRow('calendar', 'Criado', snowStr(u.id)).row);
      body.appendChild(statRow('shield', 'MFA', u.mfa_enabled ? 'Ativado' : 'Inativo').row);

      const emR = statRow('mail', 'Email', u.email || '—', true); emR.val.classList.add('blur'); emR.row.title = 'Clique para revelar';
      let revealed = false; emR.row.onclick = () => { if (!revealed) { emR.val.classList.remove('blur'); revealed = true; } else copy(u.email || ''); };
      body.appendChild(emR.row);

      body.appendChild(el('div', { className: 'du-sec' }, 'Links'));
      for (const [label, url] of [['Website', 'https://autoquest.squareweb.app/'], ['Discord', 'https://discord.gg/AutoQuest']]) {
        const b = el('button', { className: 'du-btn' }); b.innerHTML = `<span style="display:flex">${icon('link', 16)}</span>${esc(label)}`; b.onclick = () => window.open(url, '_blank'); body.appendChild(b);
      }

      (async () => { const [fr, gs, dms] = await Promise.all([loadFriends(), loadGuilds(), loadDMs()]); const set = (k, v) => { const n = body.querySelector(`[data-k="${k}"]`); if (n) n.textContent = v; }; set('friends', fr.length); set('guilds', gs.length); set('dms', dms.length); })();
    }
    async function renderPainel(body) {
      body.innerHTML = '';
      const cached = cache.get('profile');
      if (cached) { MY_ID = cached.id; renderProfileInto(body, cached); }
      else body.innerHTML = `<div class="du-hint" style="text-align:center;padding:30px 0">Carregando perfil…</div>`;
      const fresh = await loadProfile();
      if (fresh) { MY_ID = fresh.id; renderProfileInto(body, fresh); }
      else if (!cached) body.innerHTML = `<div class="du-hint" style="text-align:center;padding:30px 0">Não foi possível carregar o perfil.<br>Aguarde o Discord terminar de abrir.</div>`;
    }

    function buildListTab(body, placeholder) {
      body.innerHTML = '';
      const search = el('div', { className: 'du-search' }); search.innerHTML = `${icon('search', 16)}<input type="text" placeholder="${esc(placeholder)}">`;
      const input = search.querySelector('input');
      const count = el('div', { className: 'du-cnt' }, 'Carregando…');
      const listWrap = el('div');
      body.appendChild(search); body.appendChild(count); body.appendChild(listWrap);
      input.addEventListener('input', () => { const q = input.value.toLowerCase(); let shown = 0; listWrap.querySelectorAll('.du-li').forEach((row) => { const hit = (row.dataset.search || '').includes(q); row.style.display = hit ? '' : 'none'; if (hit) shown++; }); count.textContent = `${shown} de ${listWrap.querySelectorAll('.du-li').length}`; });
      return { count, listWrap };
    }

    async function renderAmigos(body) {
      const { count, listWrap } = buildListTab(body, 'Buscar amigo por nome ou ID…');
      const friends = await loadFriends(); MY_ID = MY_ID || (cache.get('profile') || {}).id;
      count.textContent = `${friends.length} amigo(s)`;
      if (!friends.length) { listWrap.innerHTML = `<div class="du-hint" style="text-align:center;padding:24px 0">Nenhum amigo encontrado.</div>`; return; }
      listWrap.innerHTML = friends.map((x) => { const u = x.user, nm = esc(u.global_name || u.username);
        return `<div class="du-li" data-search="${esc((u.global_name || '') + ' ' + u.username + ' ' + u.id).toLowerCase()}">
          <div class="av"><img src="${avatarUrl(u.id, u.avatar, 80, false)}" onerror="this.parentElement.textContent='${esc(initials(u.username))}';this.remove()" alt=""></div>
          <div class="inf"><div class="nm">${nm}</div><div class="sb">${esc(u.id)}</div></div>
          <div class="ac"><button class="du-ib red" data-a="rmf" data-id="${u.id}" data-nm="${nm}" title="Remover amizade">${icon('userMinus', 15)}</button>
          <button class="du-ib warn" data-a="dmf" data-id="${u.id}" data-nm="${nm}" title="Limpar mensagens da DM">${icon('trash', 15)}</button></div></div>`; }).join('');
      listWrap.onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.dataset.id, row = b.closest('.du-li');
        if (b.dataset.a === 'rmf') {
          if (!(await duConfirm({ title: 'Remover amizade', message: `Remover ${b.dataset.nm} dos seus amigos?`, danger: true, confirmLabel: 'Remover' }))) return;
          const r = await req(`/users/@me/relationships/${id}`, { method: 'DELETE' }); if (r.ok || r.status === 204) { row.remove(); toast('Amigo removido'); } else toast('Erro ' + r.status, 'err');
        } else if (b.dataset.a === 'dmf') {
          if (!(await duConfirm({ title: 'Limpar mensagens', message: `Apagar TODAS as suas mensagens na DM com ${b.dataset.nm}?\nIsso é irreversível.`, danger: true, confirmLabel: 'Apagar', requireCheck: 'Entendo que não dá pra desfazer' }))) return;
          runJob(`Limpando DM · ${b.dataset.nm}`, 'trash', 'Abrindo a conversa…', async (job) => {
            const open = await req('/users/@me/channels', { method: 'POST', json: { recipients: [id] } });
            if (!open.ok) throw new Error('não foi possível abrir a DM');
            const n = await deleteMyMessagesInChannel(open.data.id, job);
            toast(`${n} mensagem(ns) apagada(s) na DM com ${b.dataset.nm}.`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'DM limpa');
          });
        }
      };
    }

    async function renderServidores(body) {
      const { count, listWrap } = buildListTab(body, 'Buscar servidor por nome ou ID…');
      const guilds = await loadGuilds(); MY_ID = MY_ID || (cache.get('profile') || {}).id;

      guilds.sort((a, b) => (a.owner ? 1 : 0) - (b.owner ? 1 : 0));
      count.textContent = `${guilds.length} servidor(es)`;
      if (!guilds.length) { listWrap.innerHTML = `<div class="du-hint" style="text-align:center;padding:24px 0">Nenhum servidor encontrado.</div>`; return; }
      listWrap.innerHTML = guilds.map((gd) => { const nm = esc(gd.name), ic = iconUrl(gd.id, gd.icon, 96, false), init = esc(initials(gd.name));
        const avH = ic ? `<div class="av sq"><img src="${ic}" onerror="this.parentElement.textContent='${init}';this.remove()" alt=""></div>` : `<div class="av sq">${init}</div>`;
        const mc = gd.approximate_member_count != null ? `${gd.approximate_member_count} membros` : snowStr(gd.id);
        const leaveBtn = gd.owner ? '' : `<button class="du-ib red" data-a="lv" data-id="${gd.id}" data-nm="${nm}" title="Sair do servidor">${icon('door', 15)}</button>`;
        return `<div class="du-li" data-search="${esc(gd.name + ' ' + gd.id).toLowerCase()}">${avH}
          <div class="inf"><div class="nm">${nm}${gd.owner ? '<span class="owner">DONO</span>' : ''}</div><div class="sb">${mc}</div></div>
          <div class="ac">${leaveBtn}
          <button class="du-ib warn" data-a="dgs" data-id="${gd.id}" data-nm="${nm}" title="Limpar minhas mensagens">${icon('trash', 15)}</button>
          <button class="du-ib" data-a="mg" data-id="${gd.id}" title="Silenciar servidor">${icon('bellOff', 15)}</button></div></div>`; }).join('');
      listWrap.onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.dataset.id, row = b.closest('.du-li');
        if (b.dataset.a === 'lv') {
          if (!(await duConfirm({ title: 'Sair do servidor', message: `Sair de "${b.dataset.nm}"?`, danger: true, confirmLabel: 'Sair' }))) return;
          const r = await req(`/users/@me/guilds/${id}`, { method: 'DELETE' }); if (r.ok || r.status === 204) { row.remove(); toast('Saiu do servidor'); } else toast('Erro ' + r.status, 'err');
        } else if (b.dataset.a === 'mg') {
          const on = b.classList.contains('on'); const r = await req(`/users/@me/guilds/${id}/settings`, { method: 'PATCH', json: { muted: !on, mute_config: on ? null : { selected_time_window: -1, end_time: null } } });
          if (r.ok) { b.classList.toggle('on', !on); toast(on ? 'Servidor ativado' : 'Servidor silenciado'); } else toast('Erro ' + r.status, 'err');
        } else if (b.dataset.a === 'dgs') {
          if (!(await duConfirm({ title: 'Limpar mensagens', message: `Apagar TODAS as suas mensagens em "${b.dataset.nm}"?\nÉ irreversível e pode demorar.`, danger: true, confirmLabel: 'Apagar', requireCheck: 'Entendo que não dá pra desfazer' }))) return;
          runJob(`Limpando mensagens · ${b.dataset.nm}`, 'trash', 'Procurando mensagens…', async (job) => {
            const n = await deleteMyMessagesInGuild(id, job);
            toast(`${n} mensagem(ns) apagada(s) em "${b.dataset.nm}".`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'Servidor limpo');
          });
        }
      };
    }

    function renderOtimizacoes(body) {
      body.innerHTML = '';
      body.appendChild(el('div', { className: 'du-sec' }, 'Deixar o Discord mais leve'));
      for (const o of OPTS) {
        const row = el('div', { className: 'du-tg' + (optEnabled(o.key) ? ' on' : '') });
        row.setAttribute('role', 'switch');
        row.innerHTML = `<span class="tgi">${icon(o.icon, 18)}</span><div class="tgt"><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></div><div class="du-sw"></div>`;

        row.addEventListener('click', () => { const next = !row.classList.contains('on'); if (!applyOpt(o, next)) return; setOptEnabled(o.key, next); row.classList.toggle('on', next); toast(next ? 'Ativado.' : 'Desativado.', next ? 'ok' : 'inf', o.label); });
        body.appendChild(row);
      }
      body.appendChild(el('div', { className: 'du-sec' }, 'Ações rápidas'));
      const cb = el('button', { className: 'du-btn' }); cb.innerHTML = `<span style="display:flex">${icon('x', 16)}</span>Fechar todas as DMs`; cb.onclick = closeAllDMs; body.appendChild(cb);
      const mb = el('button', { className: 'du-btn' }); mb.innerHTML = `<span style="display:flex">${icon('bellOff', 16)}</span>Silenciar todos os servidores`; mb.onclick = muteAllServers; body.appendChild(mb);
    }

    function renderDiversos(body) {
      body.innerHTML = '';

      body.appendChild(el('div', { className: 'du-sec' }, 'Ferramentas de desenvolvedor'));
      const dtRow = el('div', { className: 'du-tg' + (NSET.devtools ? ' on' : '') });
      dtRow.setAttribute('role', 'switch');
      dtRow.innerHTML = `<span class="tgi">${icon('code', 18)}</span><div class="tgt"><b>Liberar inspecionar (DevTools)</b><small>F12, Ctrl+Shift+I, Ctrl+Shift+J e Ctrl+Shift+C</small></div><div class="du-sw"></div>`;
      const dtState = el('div', { className: 'du-hint' });
      const paintDtState = () => {
        dtState.textContent = !NSET.devtools
          ? 'Desligado — o Discord bloqueia o inspecionar.'
          : window.__DU_DEVTOOLS_ACTIVE__
            ? 'Ativo nesta sessão — os atalhos já funcionam.'
            : 'Salvo, mas só vale depois de reiniciar o Discord (Ctrl+R não basta).';
      };
      dtRow.addEventListener('click', async () => {
        const next = !dtRow.classList.contains('on');
        dtRow.classList.toggle('on', next);
        setNative('devtools', next);
        paintDtState();
        if (!next) { toast('O inspecionar volta a ser bloqueado depois de reiniciar o Discord.', 'inf', 'DevTools desativado'); return; }
        if (window.__DU_DEVTOOLS_ACTIVE__) { toast('Use F12 ou Ctrl+Shift+I agora mesmo.', 'ok', 'DevTools liberado'); return; }
        toast('A permissão só é aplicada quando a janela do Discord é criada.', 'inf', 'Reinicie o Discord');
        if (await duConfirm({ title: 'Reiniciar o Discord?', message: 'O inspecionar só pode ser liberado no momento em que a janela é criada.\nReiniciar agora aplica na hora.', confirmLabel: 'Reiniciar agora' })) sendNative('relaunch');
      });
      body.appendChild(dtRow);
      body.appendChild(dtState);
      paintDtState();
      const dtOpen = el('button', { className: 'du-btn' });
      dtOpen.innerHTML = `<span style="display:flex">${icon('terminal', 16)}</span>Abrir o inspecionar agora`;
      dtOpen.onclick = () => { if (!NSET.devtools) { toast('Ative o inspecionar acima primeiro.', 'inf'); return; } sendNative('devtools'); };
      body.appendChild(dtOpen);

      body.appendChild(el('div', { className: 'du-sec' }, 'Apagar mensagens por ID'));
      const sel = el('select', { className: 'du-input' }); sel.innerHTML = `<option value="channel">Por ID de Canal</option><option value="user">Por ID de Usuário (abre a DM)</option>`;
      const inp = el('input', { className: 'du-input', placeholder: 'Cole o ID aqui…' });
      const goBtn = el('button', { className: 'du-btn red' }); goBtn.innerHTML = `<span style="display:flex">${icon('trash', 16)}</span>Apagar minhas mensagens`;
      body.appendChild(sel); body.appendChild(inp); body.appendChild(goBtn);
      goBtn.onclick = async () => {
        const idv = inp.value.trim(); if (!/^\d{15,21}$/.test(idv)) { toast('ID inválido (só números).', 'err'); return; }
        if (!(await duConfirm({ title: 'Apagar mensagens', message: 'Apagar TODAS as suas mensagens nesse alvo? Irreversível.', danger: true, confirmLabel: 'Apagar', requireCheck: 'Entendo que não dá pra desfazer' }))) return;
        const isUser = sel.value === 'user';
        runJob(isUser ? `Limpando DM · ${idv}` : `Limpando canal · ${idv}`, 'trash', 'Procurando mensagens…', async (job) => {
          let cid = idv;
          if (isUser) { const open = await req('/users/@me/channels', { method: 'POST', json: { recipients: [idv] } }); if (!open.ok) throw new Error('não foi possível abrir a DM'); cid = open.data.id; }
          const n = await deleteMyMessagesInChannel(cid, job);
          toast(`${n} mensagem(ns) apagada(s).`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'Mensagens apagadas');
        });
      };

      body.appendChild(el('div', { className: 'du-sec' }, 'Ações em massa (irreversível)'));
      body.appendChild(el('div', { className: 'du-hint' }, 'Cada ação pede confirmação e roda em segundo plano — dá pra fechar o menu.'));
      const massBtn = (label, iconName, handler) => { const b = el('button', { className: 'du-btn red' }); b.innerHTML = `<span style="display:flex">${icon(iconName, 16)}</span>${label}`; b.onclick = handler; body.appendChild(b); };

      massBtn('Remover TODOS os amigos', 'userMinus', async () => {
        if (!(await duConfirm({ title: 'Remover todos os amigos', message: 'Remove TODOS os seus amigos. Irreversível.', danger: true, confirmLabel: 'Remover todos', requireCheck: 'Entendo que não dá pra desfazer' }))) return;
        const fr = await loadFriends();
        if (!fr.length) { toast('Você não tem amigos na lista.', 'inf'); return; }
        runJob('Removendo amigos', 'userMinus', `${fr.length} amigo(s)`, async (job) => {
          let done = 0;
          await pool(fr, 4, async (f) => {
            const r = await reqRL(`/users/@me/relationships/${f.user.id}`, { method: 'DELETE' }, job);
            if (r.ok || r.status === 204) done++;
            job.update(done, fr.length, `${done} de ${fr.length} removido(s)…`);
          }, job);
          if (!job.cancelled) cache.set('friends', []);
          toast(`${done} de ${fr.length} amigo(s) removido(s).`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'Amigos removidos');
        });
      });
      massBtn('Sair de TODOS os servidores', 'door', async () => {
        if (!(await duConfirm({ title: 'Sair de todos os servidores', message: 'Sai de TODOS os servidores (menos os que você é dono). Irreversível.', danger: true, confirmLabel: 'Sair de todos', requireCheck: 'Entendo que não dá pra desfazer' }))) return;
        const gs = (await loadGuilds()).filter((g) => !g.owner);
        if (!gs.length) { toast('Nenhum servidor para sair.', 'inf'); return; }
        runJob('Saindo dos servidores', 'door', `${gs.length} servidor(es)`, async (job) => {
          let done = 0;
          await pool(gs, 4, async (g) => {
            const r = await reqRL(`/users/@me/guilds/${g.id}`, { method: 'DELETE' }, job);
            if (r.ok || r.status === 204) done++;
            job.update(done, gs.length, `${done} de ${gs.length} servidor(es)…`);
          }, job);
          toast(`Saiu de ${done} de ${gs.length} servidor(es).`, job.cancelled ? 'inf' : 'ok', job.cancelled ? 'Cancelado' : 'Servidores');
        });
      });
    }

    const Q_PRIORITY = ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION', 'PLAY_ACTIVITY'];
    const Q_TEXT = { WATCH_VIDEO: 'Assistir vídeo', WATCH_VIDEO_ON_MOBILE: 'Assistir vídeo (mobile)', PLAY_ON_DESKTOP: 'Jogar no PC', STREAM_ON_DESKTOP: 'Transmitir no PC', PLAY_ON_XBOX: 'Jogar no Xbox', PLAY_ON_PLAYSTATION: 'Jogar no PlayStation', PLAY_ACTIVITY: 'Atividade' };

    async function qapi(path, method = 'GET', body, headers) {
      const rest = headers ? null : findRestAPI();
      if (rest) {
        const opts = { url: path }; if (body !== undefined) opts.body = body;
        const fn = method === 'POST' ? rest.post : method === 'PATCH' ? rest.patch : method === 'DELETE' ? (rest.del || rest.delete) : rest.get;
        try { const res = await fn.call(rest, opts); return { ok: true, status: res.status ?? 200, data: res.body !== undefined ? res.body : res }; }
        catch (e) { return { ok: false, status: e.status ?? e.statusCode ?? 500, data: e.body ?? null }; }
      }
      return req(path, { method, json: body, headers });
    }

    async function qapiRL(path, method, body, headers, ctx) {
      for (let attempt = 0; attempt < 12; attempt++) {
        if (ctx && ctx.cancelled) return { ok: false, status: 0, data: null, cancelled: true };
        const wait = GLOBAL_RL.until - Date.now();
        if (wait > 0) await slCancel(Math.min(wait, 30000), ctx);
        const r = await qapi(path, method, body, headers);
        if (r.status !== 429) return r;
        const d = r.data || {};
        let ra = Number(d.retry_after);
        if (!isFinite(ra) || ra < 0) ra = 1;
        const ms = Math.min(60000, Math.round(ra > 1000 ? ra : ra * 1000) + 400);
        if (d.global) GLOBAL_RL.until = Date.now() + ms;
        if (ctx && ctx.onRate) ctx.onRate(Math.ceil(ms / 1000));
        await slCancel(ms, ctx);
      }
      return { ok: false, status: 429, data: null };
    }
    async function loadQuests() { const r = await qapi('/quests/@me'); return r.ok && r.data && Array.isArray(r.data.quests) ? r.data.quests : []; }
    function qTasks(q) { return (q.config && q.config.task_config_v2 && q.config.task_config_v2.tasks) || {}; }
    function qPick(q) { const t = qTasks(q); for (const k of Q_PRIORITY) if (t[k]) return { type: k, target: t[k].target || t[k].target_seconds || 0 }; const k = Object.keys(t)[0]; return k ? { type: k, target: t[k].target || 0 } : null; }
    function qReward(q) { const r = q.config && q.config.rewards_config && q.config.rewards_config.rewards && q.config.rewards_config.rewards[0]; if (!r) return 'Recompensa'; if (r.type === 4) return `${r.orb_quantity} Orbs`; return (r.messages && r.messages.name) || 'Recompensa'; }
    function qDur(sec) { if (sec >= 60) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}min ${s}s` : `${m}min`; } return `${sec}s`; }
    function qAsset(q) { const a = (q.config && q.config.assets) || {}; const p = a.game_tile_dark || a.game_tile || a.hero; return p ? (p.startsWith('http') ? p : `${CDN}/${p}`) : ''; }
    function qStatus(q) { const now = Date.now(); const exp = q.config && q.config.expires_at ? new Date(q.config.expires_at).getTime() : 0; const us = q.user_status || {}; if (us.completed_at) return 'done'; if (exp && exp < now) return 'expired'; if (us.enrolled_at) return 'pending'; return 'available'; }

    async function completeQuest(q, onProgress) {
      const pick = qPick(q); if (!pick) throw new Error('missão sem tarefa suportada');
      const { type, target } = pick; const id = q.id;
      if (!(q.user_status && q.user_status.enrolled_at)) {
        const en = await qapi(`/quests/${id}/enroll`, 'POST', { location: 11, is_targeted: false, metadata_raw: null });
        if (!(en.ok || en.status === 200 || en.status === 204)) throw new Error('falha ao inscrever (' + en.status + ')');
      }
      let cur = 0;
      if (type.startsWith('WATCH_')) {
        let ts = 0;
        while (cur < target && !questCancel) {
          const res = await qapi(`/quests/${id}/video-progress`, 'POST', { timestamp: ts });
          if (res.status === 400 || res.status === 429) { ts = Math.max(0, ts - 10); await sl(8000); continue; }
          if (res.ok || res.status === 200) {
            if (res.data && res.data.completed_at) { cur = target; break; }
            cur = ts; ts += 10; onProgress(Math.min(cur, target), target);
            if (cur >= target) break;
          }
          await sl(2500);
        }
      } else {
        const streamKey = `call:${id}:1`; let stuck = 0;
        while (cur < target && !questCancel) {
          const res = await qapi(`/quests/${id}/heartbeat`, 'POST', { stream_key: streamKey, terminal: false });
          if (res.status === 429) { await sl(8000); continue; }
          if (res.ok || res.status === 200) {
            const d = res.data || {};
            if (d.completed_at || (d.user_status && d.user_status.completed_at)) { cur = target; break; }
            const np = (d.progress && d.progress[type] && d.progress[type].value) ?? cur;
            if (np > cur) { cur = np; stuck = 0; onProgress(Math.min(cur, target), target); if (cur >= target) { await qapi(`/quests/${id}/heartbeat`, 'POST', { stream_key: streamKey, terminal: true }); break; } }
            else { stuck++; if (stuck >= 8) { await qapi(`/quests/${id}/heartbeat`, 'POST', { stream_key: streamKey, terminal: true }); cur = target; break; } }
          }
          await sl(24000);
        }
      }
      return cur >= target;
    }

    let activeQuest = null, questCancel = false, questQueueRunning = false, lastCancelled = false, questProgressEl = null;

    let questFilter = 'available';
    const questName = (q) => (q.config && q.config.messages && q.config.messages.quest_name) || 'Missão';

    function qSortKey(q) { const pick = qPick(q); const vid = pick && pick.type.startsWith('WATCH_') ? 0 : 1; const r = q.config && q.config.rewards_config && q.config.rewards_config.rewards && q.config.rewards_config.rewards[0]; const orbs = r && r.type === 4 ? 0 : 1; return vid * 2 + orbs; }
    function updateQuestProgress(cur, tot) {
      if (activeQuest) { activeQuest.current = cur; activeQuest.target = tot; if (activeQuest.job) activeQuest.job.update(cur, tot, `${cur} / ${tot}s`); }
      if (questProgressEl) { const pct = tot > 0 ? Math.min(100, Math.round(cur / tot * 100)) : 0; questProgressEl.bar.style.width = pct + '%'; questProgressEl.text.textContent = `${cur} / ${tot}s`; }
    }
    const isMissoesActive = () => panel && panel.classList.contains('open') && tabs[activeTab] && tabs[activeTab].name === 'Missões';
    function refreshMissoes() { if (isMissoesActive()) renderMissoes(panelBody); }

    const CLAIM_SKIP_CODES = new Set([10008]);
    const questBroken = new Set();

    async function claimQuest(q, headers, ctx) {
      const body = { platform: 0, location: 11, is_targeted: false, metadata_sealed: null };
      if (q.traffic_metadata_sealed) body.traffic_metadata_sealed = q.traffic_metadata_sealed;
      const r = await qapiRL(`/quests/${q.id}/claim-reward`, 'POST', body, headers, ctx);
      if (r.ok || r.status === 200) return { ok: true };
      const cap = captchaFrom(r.data);
      if (cap) { log('claim-reward pediu captcha', r.status, r.data); return { ok: false, captcha: cap }; }
      const code = r.data && r.data.code;
      if (CLAIM_SKIP_CODES.has(code) || r.status === 404) {
        questBroken.add(q.id);
        log('claim-reward com erro permanente, ignorando missão', q.id, r.status, r.data);
        return { ok: false, skip: true, error: (r.data && r.data.message) || `Erro ${r.status}` };
      }
      return { ok: false, error: (r.data && r.data.message) || `Erro ${r.status}` };
    }

    async function claimQuestInteractive(q, note, opts) {
      const ctx = opts || {};
      try {
        let res = await claimQuest(q, undefined, ctx);
        if (res.cancelled) return { ok: false, cancelled: true };
        for (let i = 0; i < 3 && res.captcha; i++) {
          const cap = res.captcha;
          const token = await duCaptcha(cap, note, ctx.auto);
          if (!token) return { ok: false, cancelled: true };
          res = await claimQuest(q, captchaHeaders(cap, token), ctx);
          if (res.cancelled) return { ok: false, cancelled: true };
        }
        if (res.ok) return { ok: true };
        if (res.skip) return { ok: false, skip: true, error: res.error };
        if (res.captcha) return { ok: false, error: 'O Discord recusou o hCaptcha 3 vezes. Tente de novo daqui a pouco, ou colete pela aba Missões do próprio Discord.' };
        return { ok: false, error: res.error || 'Falha ao coletar' };
      } catch (e) { return { ok: false, error: e && e.message ? e.message : 'Falha ao coletar' }; }
    }
    async function runQuestBackground(q) {
      activeQuest = { id: q.id, name: questName(q), current: 0, target: (qPick(q) || {}).target || 0, running: true, job: null };
      questCancel = false; lastCancelled = false;

      const job = startJob('Missão: ' + activeQuest.name, 'compass', 'Inscrevendo…');
      job.onCancel = () => { questCancel = true; };
      activeQuest.job = job;
      refreshMissoes();
      let ok = false;
      let needsCaptcha = false;
      try {
        ok = await completeQuest(q, (c, t) => updateQuestProgress(c, t));
        if (ok) {
          job.note('Coletando recompensa…');

          let cl = null;
          try { cl = await claimQuest(q); } catch (_) {}
          needsCaptcha = !!(cl && cl.captcha);
        }
      }
      catch (e) { toast(e.message, 'err', 'Erro na missão'); }
      job.end();
      activeQuest.running = false; activeQuest.job = null; lastCancelled = questCancel && !ok;
      if (ok && needsCaptcha) toast(`${activeQuest.name} — o Discord pediu um hCaptcha. Abra Missões › Recompensas e clique em Coletar.`, 'warn', 'Recompensa esperando você');
      else if (ok) toast(`${activeQuest.name} — recompensa coletada.`, 'ok', 'Missão concluída');
      else if (lastCancelled) toast(activeQuest.name, 'inf', 'Missão cancelada');
      return ok;
    }
    async function doQuest(q) { if (activeQuest && activeQuest.running) { toast('Já há uma missão em andamento', 'inf'); return; } await runQuestBackground(q); refreshMissoes(); }
    async function doAllQuests(silentStart) {
      if (questQueueRunning || (activeQuest && activeQuest.running)) { toast('Já há missões em andamento', 'inf'); return; }
      questQueueRunning = true;
      try {
        const list = (await loadQuests()).filter((q) => { const s = qStatus(q); return s === 'available' || s === 'pending'; }).sort((a, b) => qSortKey(a) - qSortKey(b));
        if (!list.length) { toast('Nenhuma missão disponível', 'inf'); return; }
        if (!silentStart) toast(`Iniciando ${list.length} missão(ões)…`, 'ok');
        for (const q of list) { await runQuestBackground(q); if (lastCancelled) break; }
        toast('Fila de missões finalizada ✅', 'ok');
      } finally { questQueueRunning = false; refreshMissoes(); }
    }

    let claimAllRunning = false;
    async function claimAllRewards(list) {
      if (claimAllRunning) { toast('A coleta automática já está rodando.', 'inf'); return; }
      list = (list || []).filter((q) => !questBroken.has(q.id));
      if (!list.length) { toast('Não há recompensas para coletar.', 'inf'); return; }
      claimAllRunning = true;
      refreshMissoes();
      const job = startJob('Coleta automática', 'sparkles', `0 de ${list.length}`);

      const lim = limiter(1500, 900, 20000);
      job.onRate = (secs) => { lim.hit(); job.note(`Limite do Discord — retomando em ${secs}s…`); };
      let done = 0, failed = 0, skipped = 0, stopped = false, lastError = '';
      try {
        for (let i = 0; i < list.length; i++) {
          if (job.cancelled) { stopped = true; break; }
          const q = list[i];
          job.update(done, list.length, `${i + 1}/${list.length} · ${questName(q)}`);
          job.auto = true;
          const res = await claimQuestInteractive(q, `Coletando ${i + 1} de ${list.length}: ${questName(q)}. Resolva o desafio e a fila continua.`, job);
          if (res.ok) { done++; lim.ok(); }
          else if (res.cancelled) { stopped = true; break; }
          else if (res.skip) { skipped++; lim.ok(); }
          else { failed++; lastError = res.error || lastError; }
          job.update(done, list.length, `${done} de ${list.length} coletada(s)`);
          if (i < list.length - 1 && !job.cancelled) {
            job.update(done, list.length, `${done} de ${list.length} · aguardando ${(lim.d / 1000).toFixed(1)}s`);
            await slCancel(lim.d, job);
          }
        }
      } finally { job.end(); claimAllRunning = false; }
      let tail = skipped ? ` · ${skipped} ignorada(s) (com erro no Discord)` : '';
      if (failed) tail += ` · ${failed} falhou(ram)`;
      if (stopped) toast(`${done} de ${list.length} coletada(s) antes de parar.${tail}`, 'inf', 'Coleta interrompida');
      else if (done) toast(`${done} recompensa(s) coletada(s).${tail}`, failed ? 'warn' : 'ok', 'Coleta automática');
      else if (skipped && !failed) toast(`Nenhuma pôde ser coletada: ${skipped} está(ão) com erro no Discord.`, 'inf', 'Coleta automática');
      else toast(lastError || 'Nenhuma recompensa foi coletada.', 'err', 'Coleta automática');
      refreshMissoes();
    }

    function renderQuestProgress(body) {
      body.innerHTML = ''; questProgressEl = null;
      const wrap = el('div', { style: 'padding:28px 8px;text-align:center' });
      wrap.innerHTML = `<div style="font-size:15px;font-weight:800;color:#fff;margin-bottom:4px">Fazendo missão</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:18px">${esc(activeQuest.name)}</div>
        <div style="width:100%;height:8px;border-radius:5px;background:var(--bg3);overflow:hidden;margin-bottom:12px"><div class="qp-bar" style="height:100%;width:0;background:linear-gradient(90deg,#5865F2,#8b5cf6);transition:width .2s"></div></div>
        <div class="qp-text" style="font-size:13px;color:#c9c9d1;margin-bottom:18px">…</div>`;
      const cancel = el('button', { className: 'du-btn red', style: 'width:auto;margin:0 auto;padding:9px 26px' }, 'Cancelar');
      cancel.onclick = () => { questCancel = true; };
      wrap.appendChild(cancel);
      body.appendChild(wrap);
      questProgressEl = { bar: wrap.querySelector('.qp-bar'), text: wrap.querySelector('.qp-text') };
      updateQuestProgress(activeQuest.current, activeQuest.target);
    }

    async function renderMissoes(body) {
      if (activeQuest && activeQuest.running) { renderQuestProgress(body); return; }
      questProgressEl = null;
      body.innerHTML = `<div class="du-hint" style="text-align:center;padding:24px 0">Carregando missões…</div>`;
      const quests = await loadQuests();
      if (activeQuest && activeQuest.running) { renderQuestProgress(body); return; }
      body.innerHTML = '';

      const orbRow = statRow('sparkles', 'Orbs', '…');
      body.appendChild(orbRow.row);
      loadOrbs().then((b) => { orbRow.val.textContent = b == null ? '—' : b.toLocaleString('pt-BR'); });

      const autoRow = el('div', { className: 'du-tg' + (autoQuestsOn() ? ' on' : '') });
      autoRow.setAttribute('role', 'switch');
      autoRow.innerHTML = `<span class="tgi">${icon('rocket', 18)}</span><div class="tgt"><b>Fazer missões automaticamente</b><small>Ao abrir o Discord, pega as disponíveis e começa a fila sozinho</small></div><div class="du-sw"></div>`;
      autoRow.addEventListener('click', () => {
        const next = !autoRow.classList.contains('on');
        autoRow.classList.toggle('on', next);
        setAutoQuests(next);
        if (next) { toast('Ao abrir o Discord, a fila começa sozinha.', 'ok', 'Missões automáticas'); questWatchTick(); }
        else toast('Você continua fazendo as missões na mão.', 'inf', 'Missões automáticas');
      });
      body.appendChild(autoRow);
      body.appendChild(el('div', { className: 'du-sec' }, 'Missões'));

      if (!quests.length) { body.appendChild(el('div', { className: 'du-hint', style: 'text-align:center;padding:24px 0' }, 'Nenhuma missão encontrada.')); return; }

      const claimable = (q) => { const us = q.user_status || {}; return !!us.completed_at && !us.claimed_at; };
      const inFilter = (q, f) => { const s = qStatus(q); if (f === 'available') return s === 'available' || s === 'pending'; if (f === 'done') return s === 'done'; if (f === 'rewards') return claimable(q); return true; };
      const badgeLabel = { available: 'Disponível', pending: 'Pendente', done: 'Concluída', expired: 'Expirada' };
      const filters = [['available', 'Disponíveis'], ['done', 'Concluídas'], ['rewards', 'Recompensas']];
      let active = questFilter;
      const pills = el('div', { className: 'du-pills' });
      const listWrap = el('div');

      const draw = () => {
        listWrap.innerHTML = '';
        if (active === 'available') {
          const n = quests.filter((q) => inFilter(q, 'available')).length;
          if (n) { const allBtn = el('button', { className: 'du-btn acc', style: 'margin:0 0 10px' }); allBtn.innerHTML = `<span style="display:flex">${icon('rocket', 15)}</span>Fazer todas as missões (${n})`; allBtn.onclick = () => doAllQuests(); listWrap.appendChild(allBtn); }
        } else if (active === 'rewards') {
          const pend = quests.filter((q) => claimable(q) && !questBroken.has(q.id));
          if (pend.length) {
            const allBtn = el('button', { className: 'du-btn acc', style: 'margin:0 0 10px' });
            allBtn.innerHTML = `<span style="display:flex">${icon('sparkles', 15)}</span>${claimAllRunning ? 'Coletando…' : `Coleta automática (${pend.length})`}`;
            allBtn.disabled = claimAllRunning;
            allBtn.onclick = () => claimAllRewards(pend);
            listWrap.appendChild(allBtn);
            listWrap.appendChild(el('div', { className: 'du-hint', style: 'margin:0 0 10px' }, 'Coleta uma atrás da outra. O hCaptcha só aparece quando o Discord pedir.'));
          }
        }
        const items = quests.filter((q) => inFilter(q, active)).sort((a, b) => qSortKey(a) - qSortKey(b));
        if (!items.length) { listWrap.appendChild(el('div', { className: 'du-hint', style: 'text-align:center;padding:16px 0' }, 'Nada aqui.')); return; }
        for (const q of items) {
          const st = qStatus(q), pick = qPick(q), thumb = qAsset(q);
          const broken = active === 'rewards' && questBroken.has(q.id);
          const tagClass = broken ? 'expired' : active === 'rewards' ? 'reward' : st;
          const tagText = broken ? 'Com erro' : active === 'rewards' ? 'Recompensa' : badgeLabel[st];
          const taskLabel = pick ? `${Q_TEXT[pick.type] || pick.type} · ${qDur(pick.target)}` : '—';
          const card = el('div', { className: 'q-card' });
          card.innerHTML = `${thumb ? `<img class="q-thumb" src="${thumb}" onerror="this.style.visibility='hidden'">` : '<div class="q-thumb"></div>'}
            <div class="q-body">
              <div class="q-top"><div class="q-name">${esc(questName(q))}</div><span class="q-badge ${tagClass}">${tagText}</span></div>
              <div class="q-meta">${esc(taskLabel)}</div>
              <div class="q-reward">${esc(qReward(q))}</div>
            </div>`;
          const bodyEl = card.querySelector('.q-body');
          if (broken) {
            const btn = el('button', { className: 'du-btn q-do' });
            btn.disabled = true;
            btn.innerHTML = `<span style="display:flex">${icon('alert', 14)}</span>Indisponível no Discord`;
            btn.title = 'O Discord responde "Mensagem desconhecida" (10008) para esta recompensa.';
            bodyEl.appendChild(btn);
          } else if (active === 'rewards') {
            const btn = el('button', { className: 'du-btn acc q-do' }); btn.innerHTML = `<span style="display:flex">${icon('check', 14)}</span>Coletar recompensa`;
            btn.onclick = async () => {
              if (claimAllRunning) { toast('Espere a coleta automática terminar.', 'inf'); return; }
              btn.disabled = true;
              const res = await claimQuestInteractive(q);
              if (res.ok) { toast(`${questName(q)} — ${qReward(q)}`, 'ok', 'Recompensa coletada 🎁'); renderMissoes(body); return; }
              if (res.skip) { toast(`${questName(q)} — o Discord responde "${res.error}". Essa recompensa foi ignorada.`, 'inf', 'Recompensa com erro'); renderMissoes(body); return; }
              btn.disabled = false;
              if (res.cancelled) toast('Verificação cancelada — a recompensa continua disponível.', 'inf');
              else toast(res.error, 'err', 'Falha ao coletar');
            };
            bodyEl.appendChild(btn);
          } else if (st === 'available' || st === 'pending') {
            const btn = el('button', { className: 'du-btn acc q-do' }); btn.innerHTML = `<span style="display:flex">${icon('play', 14)}</span>Fazer missão`;
            btn.onclick = () => doQuest(q);
            bodyEl.appendChild(btn);
          }
          listWrap.appendChild(card);
        }
      };
      filters.forEach(([k, label]) => { const n = quests.filter((q) => inFilter(q, k)).length; const p = el('button', { className: 'du-pill' + (k === active ? ' on' : '') }, `${label} (${n})`); p.onclick = () => { active = questFilter = k; pills.querySelectorAll('.du-pill').forEach((x) => x.classList.remove('on')); p.classList.add('on'); draw(); }; pills.appendChild(p); });
      body.appendChild(pills); body.appendChild(listWrap); draw();
    }

    const autoQuestsOn = () => NSET.autoQuests === true;
    const setAutoQuests = (on) => setNative('autoQuests', !!on);
    const QUEST_POLL_MS = 30 * 60 * 1000;
    let questWatchTimer = null, questBootTries = 0;

    async function loadOrbs() {
      try {
        const r = await qapi('/users/@me/virtual-currency/balance');
        const b = r && r.data && r.data.balance;
        return typeof b === 'number' ? b : null;
      } catch (_) { return null; }
    }

    async function questWatchTick() {
      if (!getToken()) { if (questBootTries++ < 20) setTimeout(questWatchTick, 30000); return; }
      questBootTries = 0;
      let quests = [];
      try { quests = await loadQuests(); } catch (_) { return; }
      if (!quests.length) return;

      const doable = quests.filter((q) => { const s = qStatus(q); return s === 'available' || s === 'pending'; });

      const first = !Array.isArray(NSET.questsSeen);
      const seen = first ? [] : NSET.questsSeen;
      const fresh = doable.filter((q) => seen.indexOf(q.id) === -1);
      setNative('questsSeen', quests.map((q) => q.id));

      if (!first && fresh.length) {
        toast(fresh.length === 1 ? questName(fresh[0]) : `${fresh.length} missões novas disponíveis.`, 'ok', fresh.length === 1 ? 'Missão nova' : 'Missões novas');
      }
      refreshMissoes();

      if (!autoQuestsOn() || !doable.length) return;
      if (questQueueRunning || (activeQuest && activeQuest.running)) return;
      toast(`Comecei sozinho: ${doable.length} missão(ões) na fila.`, 'inf', 'Missões automáticas');
      doAllQuests(true);
    }

    function startQuestWatch() {
      if (questWatchTimer) return;
      setTimeout(questWatchTick, 25000);
      questWatchTimer = setInterval(questWatchTick, QUEST_POLL_MS);
    }

    const captchaFrom = (d) => (d && d.captcha_sitekey ? {
      sitekey: d.captcha_sitekey,
      rqdata: d.captcha_rqdata || null,
      rqtoken: d.captcha_rqtoken || null,
      sessionId: d.captcha_session_id || null,
      service: d.captcha_service || 'hcaptcha',
    } : null);
    const captchaHeaders = (cap, token) => {
      const h = { 'x-captcha-key': token };
      if (cap.rqtoken) h['x-captcha-rqtoken'] = cap.rqtoken;
      if (cap.sessionId) h['x-captcha-session-id'] = cap.sessionId;
      return h;
    };

    let hcapLoad = null;
    function loadHCaptcha() {
      if (window.hcaptcha && window.hcaptcha.render) return Promise.resolve(window.hcaptcha);
      if (hcapLoad) return hcapLoad;
      hcapLoad = new Promise((resolve, reject) => {
        const cb = '__duHCaptchaReady';
        const ready = () => window.hcaptcha && typeof window.hcaptcha.render === 'function';
        const fail = (msg) => { hcapLoad = null; reject(new Error(msg)); };
        window[cb] = () => { if (ready()) resolve(window.hcaptcha); else fail('o hCaptcha carregou vazio'); };
        const s = document.createElement('script');
        s.src = `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${cb}`;
        s.async = true; s.defer = true;
        s.onerror = () => fail('não foi possível baixar o hCaptcha');
        document.head.appendChild(s);

        setTimeout(() => { if (ready()) resolve(window.hcaptcha); else fail('tempo esgotado ao carregar o hCaptcha'); }, 20000);
      });
      return hcapLoad;
    }

    function duCaptcha(cap, message, auto) {
      return new Promise((resolve) => {
        const bg = el('div', { id: 'du-modalbg', className: 'cap' });
        bg.innerHTML = `<div id="du-modal" class="cap">
          <div class="mi">${icon('shield', 22)}</div>
          <div class="mt">Verificação do Discord</div>
          <div class="mm">${esc(message || 'O Discord pediu um hCaptcha para liberar esta ação. Resolva aqui e a coleta continua sozinha.')}</div>
          <div class="cap-box"><div class="cap-msg">Carregando o hCaptcha…</div></div>
          <div class="macts"><button class="du-btn cancel">Cancelar</button></div>
        </div>`;
        document.body.appendChild(bg);
        document.documentElement.classList.add('du-captcha-open');
        requestAnimationFrame(() => bg.classList.add('on'));

        const box = bg.querySelector('.cap-box');
        let widgetId = null, settled = false;
        const done = (v) => {
          if (settled) return;
          settled = true;
          try { if (widgetId !== null && window.hcaptcha) window.hcaptcha.remove(widgetId); } catch (_) {}
          document.documentElement.classList.remove('du-captcha-open');
          bg.classList.remove('on');
          setTimeout(() => bg.remove(), 130);
          resolve(v);
        };
        const fatal = (msg) => { if (!settled) box.innerHTML = `<div class="cap-msg err">${esc(msg)}</div>`; };
        bg.querySelector('.cancel').onclick = () => done(null);

        if (cap.service && cap.service !== 'hcaptcha') { fatal(`Captcha "${cap.service}" não é suportado pelo plugin.`); return; }

        loadHCaptcha().then((hc) => {
          if (settled) return;
          box.innerHTML = '';

          const host = el('div', { className: 'cap-host' });
          const msg = el('div', { className: 'cap-msg' }, auto ? 'Abrindo o desafio…' : 'Clique abaixo para abrir o desafio.');
          const go = el('button', { className: 'du-btn acc cap-go' }, 'Resolver desafio');
          box.appendChild(host); box.appendChild(msg); box.appendChild(go);

          const say = (text, isErr) => { msg.className = 'cap-msg' + (isErr ? ' err' : ''); msg.textContent = text; };
          const again = (text) => { if (settled) return; say(text, true); go.textContent = 'Tentar de novo'; go.disabled = false; };

          const conf = {
            sitekey: cap.sitekey,
            theme: 'dark',
            size: 'invisible',

            callback: (t) => done(t),
            'error-callback': () => again('O hCaptcha falhou.'),
            'expired-callback': () => again('O desafio expirou.'),
            'chalexpired-callback': () => again('O desafio expirou.'),
            'close-callback': () => again('Você fechou o desafio.'),
          };
          try { widgetId = hc.render(host, conf); }
          catch (e) { fatal('Não deu pra montar o hCaptcha: ' + e.message); return; }

          const bindRq = () => { if (!cap.rqdata || !hc.setData) return; try { hc.setData(widgetId, { rqdata: cap.rqdata }); } catch (_) {} };
          bindRq();

          const run = () => {
            if (settled) return;
            go.disabled = true;
            say('Resolva o desafio na janela do hCaptcha.');
            bindRq();
            let p;
            try { p = hc.execute(widgetId, cap.rqdata ? { rqdata: cap.rqdata, async: true } : { async: true }); }
            catch (e) { again('Não deu pra abrir o desafio: ' + e.message); return; }
            if (p && typeof p.then === 'function') {
              p.then((r) => { const t = typeof r === 'string' ? r : (r && r.response); if (t) done(t); else again('O desafio foi fechado.'); })
               .catch(() => again('O desafio foi fechado ou falhou.'));
            }
          };
          go.onclick = run;

          if (auto) run();
        }).catch((e) => fatal(e.message + ' — dá pra coletar essa recompensa pela aba Missões do próprio Discord.'));
      });
    }

    let panel, panelBody, tabButtons = [], activeTab = 0, positioned = false;
    const tabs = [
      { name: 'Painel', icon: 'user', render: renderPainel },
      { name: 'Missões', icon: 'compass', render: renderMissoes },
      { name: 'Amigos', icon: 'users', render: renderAmigos },
      { name: 'Servidores', icon: 'grid', render: renderServidores },
      { name: 'Otimizar', icon: 'rocket', render: renderOtimizacoes },
      { name: 'Diversos', icon: 'trash', render: renderDiversos },
    ];

    const renderActiveTab = () => {
      const fresh = el('div', { className: 'du-body' });
      panelBody.replaceWith(fresh); panelBody = fresh;
      try { const r = tabs[activeTab].render(panelBody); if (r && r.catch) r.catch((e) => log('render err', e)); } catch (e) { log('render err', e); }
    };
    function placePanel() { const w = panel.offsetWidth, h = panel.offsetHeight, saved = loadPos(); let x = saved && typeof saved.left === 'number' ? saved.left : (window.innerWidth - w) / 2; let y = saved && typeof saved.top === 'number' ? saved.top : (window.innerHeight - h) / 2; x = Math.max(6, Math.min(window.innerWidth - w - 6, x)); y = Math.max(6, Math.min(window.innerHeight - h - 6, y)); panel.style.left = x + 'px'; panel.style.top = y + 'px'; }

    function clampPanel() {
      if (!panel || !panel.classList.contains('open')) return;
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const maxX = Math.max(6, window.innerWidth - w - 6), maxY = Math.max(6, window.innerHeight - h - 6);
      panel.style.left = Math.max(6, Math.min(maxX, parseFloat(panel.style.left) || 0)) + 'px';
      panel.style.top = Math.max(6, Math.min(maxY, parseFloat(panel.style.top) || 0)) + 'px';
    }
    function togglePanel(force) { const open = force != null ? force : !panel.classList.contains('open'); panel.classList.toggle('open', open); if (open) { if (!positioned) { placePanel(); positioned = true; } renderActiveTab(); requestAnimationFrame(clampPanel); } }
    function enableDrag(handle) {
      let dr = false, ox = 0, oy = 0;
      handle.addEventListener('pointerdown', (e) => { if (e.target.closest('.du-x')) return; dr = true; const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; panel.style.transition = 'none'; try { handle.setPointerCapture(e.pointerId); } catch (_) {} });
      handle.addEventListener('pointermove', (e) => { if (!dr) return; const w = panel.offsetWidth, h = panel.offsetHeight; panel.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, e.clientX - ox)) + 'px'; panel.style.top = Math.max(6, Math.min(window.innerHeight - h - 6, e.clientY - oy)) + 'px'; });
      const end = () => { if (!dr) return; dr = false; panel.style.transition = ''; savePos({ left: parseFloat(panel.style.left), top: parseFloat(panel.style.top) }); };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    }
    function buildPanel() {
      injectBaseStyle();
      panel = el('div', { id: 'du-panel' });
      const head = el('div', { className: 'du-head' });
      head.innerHTML = `<div class="du-brand"><span class="du-g">${icon('gear', 18)}</span><div class="du-title">Discord Utils</div></div><button class="du-x" title="Fechar">${icon('x', 16)}</button>`;
      head.querySelector('.du-x').onclick = () => togglePanel(false);
      panel.appendChild(head); enableDrag(head);
      const tabsBar = el('div', { className: 'du-tabs' }); tabButtons = [];
      tabs.forEach((t, i) => { const btn = el('button', { className: 'du-tab' + (i === 0 ? ' active' : '') }); btn.innerHTML = `${icon(t.icon, 14)}<span>${t.name}</span>`; btn.onclick = () => { activeTab = i; tabButtons.forEach((b) => b.classList.remove('active')); btn.classList.add('active'); renderActiveTab(); }; tabButtons.push(btn); tabsBar.appendChild(btn); });
      panel.appendChild(tabsBar);
      panelBody = el('div', { className: 'du-body' });
      panel.appendChild(panelBody);
      document.body.appendChild(panel);
      jobsRoot();

      try { new ResizeObserver(() => clampPanel()).observe(panel); } catch (_) {}
    }

    const NAV_LABELS = ['Missões', 'Missôes', 'Missions', 'Quests'];
    function findNavRow() { const nodes = document.querySelectorAll('[class*="channel_"], [class*="link_"], nav a, nav li'); for (const node of nodes) { const t = (node.textContent || '').trim(); if (NAV_LABELS.includes(t)) return node.closest('li') || node.closest('a') || node; } return null; }
    function buildNavItem() { const item = el('div', { id: NAV_ID }); item.setAttribute('role', 'button'); item.setAttribute('tabindex', '0'); item.innerHTML = `<div class="du-ico">${GEAR_FILLED}</div><div class="du-lbl">Discord Utils</div>`; item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePanel(); }); return item; }
    function insertNavItem() { if (document.getElementById(NAV_ID)) return; const row = findNavRow(); if (!row || !row.parentNode) return; row.parentNode.insertBefore(buildNavItem(), row.nextSibling); log('sidebar item inserido.'); }
    let navTimer = null;
    const scheduleNav = () => { if (navTimer) return; navTimer = setTimeout(() => { navTimer = null; if (!document.getElementById(NAV_ID)) insertNavItem(); }, 300); };

    function start() {
      getRequire(); buildPanel(); insertNavItem();
      new MutationObserver(scheduleNav).observe(document.body, { childList: true, subtree: true });
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) togglePanel(false); });
      window.addEventListener('resize', clampPanel);
      applyEnabledOpts();
      startQuestWatch();
      const u = currentUser(); if (u) { MY_ID = u.id; if (!cache.get('profile')) loadProfile(); }
      window.DiscordUtils = { find, findByProps, findByMethods, Stores, req, getToken, jobs, settings: NSET, loadOrbs, questWatchTick, open: () => togglePanel(true), async debug() { const info = { webpack: !!getRequire(), hasToken: !!getToken(), user: currentUser(), devtools: { enabled: !!NSET.devtools, activeThisSession: !!window.__DU_DEVTOOLS_ACTIVE__ }, jobs: jobs.length }; console.log(`[${NS}] debug`, info); return info; } };
      log('pronto.');
    }
    function waitAndStart(tries = 0) { if (tries > 150) { log('desisti de esperar o Discord.'); return; } if (document.body && window.webpackChunkdiscord_app) { start(); return; } setTimeout(() => waitAndStart(tries + 1), 300); }
    waitAndStart();
    log('renderer.js carregado.');
  })();
  }
}
