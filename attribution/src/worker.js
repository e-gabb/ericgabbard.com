/* ericgabbard.com — link attribution
 *
 * Sits on the zone as a Worker. Three jobs, and for every other request on the
 * site it is a pass-through:
 *
 *   /<code>        a 4-char short link. Logs a click, drops a short-lived
 *                  cookie, 302s to the real page.
 *   POST /e        the confirmation beacon. A click alone proves nothing —
 *                  corporate mail scanners follow every link they see — so a
 *                  visit only counts once a real browser has rendered a page
 *                  and run script.
 *   /x/<secret>    the dashboard. Served from here rather than from the repo,
 *                  because the repo is public.
 *
 * Anything that throws falls through to the origin. A bug in this file must
 * never be able to take the site down.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no i/l/o/0/1 — misread aloud
const CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{4}$/;
const COOKIE = 'eg';
const COOKIE_TTL = 1800; // 30 min: long enough to read the site, not to follow anyone

/* Crawlers, unfurlers, and the mail scanners that pre-click links in an inbox.
 * `bot\b` catches LinkedInBot and Slackbot without catching the LinkedIn and
 * Slack in-app browsers, which are real people. */
const BOT_RE = new RegExp([
  'bot\\b', 'bot/', 'crawler', 'spider', 'slurp', 'headlesschrome', 'phantomjs',
  'curl/', 'wget/', 'python-requests', 'go-http-client', 'java/', 'libwww',
  'okhttp', 'axios', 'node-fetch', 'preview', 'scanner', 'validator',
  'proofpoint', 'mimecast', 'barracuda', 'safelinks', 'urldefense', 'symantec',
  'facebookexternalhit', 'embedly', 'whatsapp', 'telegram', 'applebot',
  'bingbot', 'googlebot', 'duckduckbot', 'yandex', 'ahrefs', 'semrush',
  'petalbot', 'amazonbot', 'gptbot', 'claudebot', 'perplexity', 'ccbot',
].join('|'), 'i');

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      // A bug in here must never be able to take the site down.
      return passthrough(request, env, new URL(request.url));
    }
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/e') {
    return request.method === 'POST'
      ? beacon(request, env, ctx)
      : new Response(null, { status: 405 });
  }

  if (env.DASH_SECRET && path.startsWith('/x/')) {
    return dashboard(request, env, url);
  }

  const code = path.replace(/^\/+|\/+$/g, '');
  if (isCode(code)) return shortLink(request, env, ctx, code, url);

  return passthrough(request, env, url);
}

/* Hand the request to GitHub Pages. On any hostname that is not the site — the
 * workers.dev URL used for testing — there is no origin behind us, and
 * fetch(request) would re-enter this Worker until Cloudflare killed it. */
function passthrough(request, env, url) {
  const site = new URL(env.SITE_ORIGIN || url.origin);
  if (url.host !== site.host) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return fetch(request);
}

/* A code must carry a digit. That is what keeps this off real pages: `work`
 * and `home` are the same shape as a code, `w0rk` is not, and no generated
 * code is ever all letters. */
function isCode(s) {
  return CODE_RE.test(s) && /[2-9]/.test(s);
}

// ---------------------------------------------------------------- short link

async function shortLink(request, env, ctx, code, url) {
  const link = await env.DB.prepare(
    'SELECT code, dest, archived FROM links WHERE code = ?'
  ).bind(code).first();

  // Unknown or retired code: behave exactly like any other missing path, so a
  // guessed code is indistinguishable from a typo.
  if (!link || link.archived) return passthrough(request, env, url);

  const dest = new URL(link.dest || '/', url.origin);
  ctx.waitUntil(logEvent(env, request, { code, kind: 'click', path: dest.pathname }));

  return new Response(null, {
    status: 302,
    headers: {
      'Location': dest.toString(),
      'Set-Cookie': `${COOKIE}=${code}; Path=/; Max-Age=${COOKIE_TTL}; SameSite=Lax; Secure`,
      'Cache-Control': 'no-store, private',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

// -------------------------------------------------------------------- beacon

async function beacon(request, env, ctx) {
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

  // The cookie is read from the header, not from the posted body — the body is
  // whatever the page chose to send, the header is what we actually set.
  const code = readCookie(request, COOKIE);
  if (!isCode(code)) return done;

  let body = {};
  try { body = await request.json(); } catch (err) { /* treat as empty */ }

  ctx.waitUntil(logEvent(env, request, {
    code,
    kind: 'view',
    path: str(body.path, 200),
    referrer: str(body.ref, 200),
  }));

  return done;
}

// --------------------------------------------------------------------- write

async function logEvent(env, request, ev) {
  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const bot = BOT_RE.test(ua) || !!cf.verifiedBotCategory || ua === '';

  // The WHERE EXISTS makes a forged cookie inert: no link row, no event row.
  await env.DB.prepare(
    `INSERT INTO events (code, kind, path, ts, country, device, ua, referrer, is_bot)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM links WHERE code = ?)`
  ).bind(
    ev.code,
    ev.kind,
    ev.path || null,
    new Date().toISOString(),
    cf.country || null,
    /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    ua.slice(0, 200),
    ev.referrer || null,
    bot ? 1 : 0,
    ev.code
  ).run();
}

function readCookie(request, name) {
  const jar = request.headers.get('Cookie') || '';
  for (const part of jar.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function str(v, max) {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}

// ----------------------------------------------------------------- dashboard

async function dashboard(request, env, url) {
  const rest = url.pathname.slice(3);            // strip "/x/"
  const slash = rest.indexOf('/');
  const given = slash === -1 ? rest : rest.slice(0, slash);
  const action = slash === -1 ? '' : rest.slice(slash + 1).replace(/\/+$/, '');

  // A wrong secret looks exactly like a page that does not exist.
  if (!timingSafeEqual(given, env.DASH_SECRET)) return passthrough(request, env, url);
  const base = `/x/${env.DASH_SECRET}`;

  if (request.method === 'POST') {
    // Same-origin only. Whoever knows the secret can do this anyway, but there
    // is no reason to accept a form posted from somewhere else.
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) {
      return new Response('bad origin', { status: 403 });
    }
    const form = await request.formData();
    if (action === 'new') return createLink(env, form, base);
    if (action === 'update') return updateLink(env, form, base);
    if (action === 'archive') return archiveLink(env, form, base);
    return new Response('unknown action', { status: 404 });
  }

  if (action.startsWith('link/')) {
    return renderDetail(env, url, base, action.slice(5));
  }
  return renderIndex(env, url, base);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------------- actions

async function createLink(env, form, base) {
  const company = str(form.get('company'), 120);
  if (!company) return redirect(base);

  const code = await mintCode(env);
  await env.DB.prepare(
    `INSERT INTO links (code, company, role, channel, notes, dest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    code,
    company,
    str(form.get('role'), 120),
    str(form.get('channel'), 120),
    null,
    str(form.get('dest'), 200),
    new Date().toISOString()
  ).run();

  return redirect(`${base}/?new=${code}`);
}

async function mintCode(env) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    let code = '';
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
    if (!isCode(code)) continue; // no digit — reroll rather than patch one in
    const taken = await env.DB.prepare('SELECT 1 FROM links WHERE code = ?').bind(code).first();
    if (!taken) return code;
  }
  throw new Error('could not mint an unused code');
}

async function updateLink(env, form, base) {
  const code = form.get('code');
  if (!isCode(code)) return redirect(base);
  await env.DB.prepare(
    'UPDATE links SET company = ?, role = ?, channel = ?, notes = ? WHERE code = ?'
  ).bind(
    str(form.get('company'), 120) || 'Untitled',
    str(form.get('role'), 120),
    str(form.get('channel'), 120),
    str(form.get('notes'), 1000),
    code
  ).run();
  return redirect(`${base}/link/${code}`);
}

async function archiveLink(env, form, base) {
  const code = form.get('code');
  if (!isCode(code)) return redirect(base);
  await env.DB.prepare(
    'UPDATE links SET archived = 1 - archived WHERE code = ?'
  ).bind(code).run();
  return redirect(base);
}

function redirect(to) {
  return new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

// --------------------------------------------------------------------- views

async function renderIndex(env, url, base) {
  const site = env.SITE_ORIGIN || url.origin;
  const { results } = await env.DB.prepare(
    `SELECT l.code, l.company, l.role, l.channel, l.created_at, l.archived,
       (SELECT COUNT(*)           FROM events e WHERE e.code = l.code AND e.kind = 'view'  AND e.is_bot = 0) AS views,
       (SELECT COUNT(DISTINCT e.path) FROM events e WHERE e.code = l.code AND e.kind = 'view'  AND e.is_bot = 0) AS pages,
       (SELECT MIN(e.ts)          FROM events e WHERE e.code = l.code AND e.kind = 'view'  AND e.is_bot = 0) AS first_view,
       (SELECT MAX(e.ts)          FROM events e WHERE e.code = l.code AND e.kind = 'view'  AND e.is_bot = 0) AS last_view,
       (SELECT COUNT(*)           FROM events e WHERE e.code = l.code AND e.kind = 'click' AND e.is_bot = 1) AS bots
     FROM links l
     ORDER BY l.archived ASC,
       COALESCE((SELECT MAX(e.ts) FROM events e WHERE e.code = l.code AND e.kind = 'view' AND e.is_bot = 0),
                l.created_at) DESC`
  ).all();

  const links = results || [];
  const minted = new URL(url).searchParams.get('new');
  const opened = links.filter((l) => l.views > 0).length;

  const banner = isCode(minted) ? `
    <div class="minted">
      <p class="minted-label">New link for ${esc((links.find((l) => l.code === minted) || {}).company || '')}</p>
      <div class="minted-row">
        <code id="mintedUrl">${esc(site)}/${esc(minted)}</code>
        <button type="button" class="copy" data-copy="mintedUrl">Copy</button>
      </div>
    </div>` : '';

  const rows = links.length ? links.map((l) => `
    <tr class="${l.archived ? 'is-archived' : ''} ${l.views ? 'is-open' : ''}">
      <td>
        <a class="company" href="${base}/link/${esc(l.code)}">${esc(l.company)}</a>
        ${l.role ? `<span class="sub">${esc(l.role)}</span>` : ''}
      </td>
      <td><code>/${esc(l.code)}</code></td>
      <td class="num">${l.views ? `<strong>${l.views}</strong>` : '<span class="dash">—</span>'}</td>
      <td>${l.first_view ? time(l.first_view) : '<span class="dash">not opened</span>'}</td>
      <td>${l.last_view ? time(l.last_view) : '<span class="dash">—</span>'}</td>
      <td class="num">${l.pages || '<span class="dash">—</span>'}</td>
      <td class="num bots" title="clicks from scanners and unfurlers, not counted as opens">${l.bots || ''}</td>
    </tr>`).join('') : `
    <tr><td colspan="7" class="empty">No links yet. Create one above.</td></tr>`;

  return page('Attribution', base, `
    ${banner}
    <form class="new" method="post" action="${base}/new">
      <input name="company" placeholder="Company" required autocomplete="off">
      <input name="role" placeholder="Role (optional)" autocomplete="off">
      <input name="channel" placeholder="Sent via (optional)" autocomplete="off">
      <button type="submit">Create link</button>
    </form>

    <p class="summary">${links.length} link${links.length === 1 ? '' : 's'}, ${opened} opened.</p>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Company</th><th>Code</th><th class="num">Opens</th>
            <th>First open</th><th>Last open</th><th class="num">Pages</th>
            <th class="num" title="scanner traffic, excluded from opens">Bot</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

async function renderDetail(env, url, base, code) {
  if (!isCode(code)) return redirect(base);
  const site = env.SITE_ORIGIN || url.origin;

  const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
  if (!link) return redirect(base);

  const { results } = await env.DB.prepare(
    'SELECT kind, path, ts, country, device, ua, is_bot FROM events WHERE code = ? ORDER BY ts DESC LIMIT 200'
  ).bind(code).all();

  const events = results || [];
  const rows = events.length ? events.map((e) => `
    <tr class="${e.is_bot ? 'is-bot' : ''}">
      <td>${time(e.ts)}</td>
      <td><span class="pill pill-${e.is_bot ? 'bot' : e.kind}">${e.is_bot ? 'scanner' : e.kind === 'view' ? 'read' : 'click'}</span></td>
      <td><code>${esc(e.path || '')}</code></td>
      <td>${esc(e.country || '')}</td>
      <td>${esc(e.device || '')}</td>
      <td class="ua" title="${esc(e.ua || '')}">${esc((e.ua || '').slice(0, 44))}</td>
    </tr>`).join('') : `
    <tr><td colspan="6" class="empty">Nothing yet.</td></tr>`;

  return page(link.company, base, `
    <p class="back"><a href="${base}/">&larr; All links</a></p>
    <div class="minted">
      <div class="minted-row">
        <code id="mintedUrl">${esc(site)}/${esc(link.code)}</code>
        <button type="button" class="copy" data-copy="mintedUrl">Copy</button>
      </div>
    </div>

    <form class="edit" method="post" action="${base}/update">
      <input type="hidden" name="code" value="${esc(link.code)}">
      <label>Company<input name="company" value="${esc(link.company)}"></label>
      <label>Role<input name="role" value="${esc(link.role || '')}"></label>
      <label>Sent via<input name="channel" value="${esc(link.channel || '')}"></label>
      <label>Notes<textarea name="notes" rows="3">${esc(link.notes || '')}</textarea></label>
      <div class="edit-actions">
        <button type="submit">Save</button>
        <button type="submit" class="ghost" formaction="${base}/archive">
          ${link.archived ? 'Restore' : 'Archive'}
        </button>
      </div>
    </form>

    <h2>Activity</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>When</th><th>What</th><th>Page</th><th>Country</th><th>Device</th><th>Client</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

// ---------------------------------------------------------------- page shell

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Stored UTC, shown in whatever timezone you are reading from.
function time(iso) {
  return `<time datetime="${esc(iso)}">${esc(iso.slice(0, 16).replace('T', ' '))}</time>`;
}

function page(title, base, body) {
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} — attribution</title>
<style>
:root {
  --bg:#fcfcfa; --surface:#ffffff; --fg:#10191c; --muted:#6a7276;
  --rule:#e3e2db; --accent:#14655a; --accent-soft:#e9f0ee; --on-accent:#fff;
  --sans:"IBM Plex Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#0e1315; --surface:#141a1c; --fg:#e4e8e7; --muted:#8e9997;
          --rule:#242c2e; --accent:#5cbfad; --accent-soft:#16262a; --on-accent:#0e1315; }
}
*,*::before,*::after { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--sans);
       font-size:15px; line-height:1.6; -webkit-font-smoothing:antialiased; }
.wrap { max-width:64rem; margin:0 auto; padding:2.5rem 1.5rem 5rem; }
h1 { font-size:1.05rem; font-weight:600; letter-spacing:-0.01em; margin:0 0 1.75rem;
     padding-bottom:0.85rem; border-bottom:1px solid var(--rule); }
h2 { font-size:0.82rem; font-weight:600; text-transform:uppercase; letter-spacing:0.07em;
     color:var(--muted); margin:2.75rem 0 0.85rem; }
a { color:var(--accent); }
code { font-family:var(--mono); font-size:0.86em; }
.back { margin:0 0 1.25rem; font-size:0.88rem; }
.back a { text-decoration:none; color:var(--muted); }
.back a:hover { color:var(--accent); }

form.new { display:flex; flex-wrap:wrap; gap:0.5rem; margin:0 0 1.5rem; }
form.new input { flex:1 1 10rem; }
input, textarea {
  font:inherit; color:var(--fg); background:var(--surface);
  border:1px solid var(--rule); border-radius:5px; padding:0.5rem 0.7rem; width:100%;
}
input:focus, textarea:focus { outline:2px solid var(--accent); outline-offset:-1px; border-color:transparent; }
button {
  font:inherit; font-weight:500; cursor:pointer; white-space:nowrap;
  background:var(--accent); color:var(--on-accent);
  border:1px solid var(--accent); border-radius:5px; padding:0.5rem 1rem;
}
button.ghost { background:transparent; color:var(--muted); border-color:var(--rule); }
button:hover { filter:brightness(1.08); }

.minted { background:var(--accent-soft); border:1px solid var(--rule);
          border-radius:6px; padding:0.9rem 1rem; margin:0 0 1.5rem; }
.minted-label { margin:0 0 0.5rem; font-size:0.78rem; text-transform:uppercase;
                letter-spacing:0.07em; color:var(--muted); }
.minted-row { display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; }
.minted-row code { font-size:1.02rem; font-weight:500; }

.summary { color:var(--muted); font-size:0.86rem; margin:0 0 0.6rem; }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:0.88rem; }
th { text-align:left; font-weight:500; color:var(--muted); font-size:0.76rem;
     text-transform:uppercase; letter-spacing:0.06em;
     border-bottom:1px solid var(--rule); padding:0 0.7rem 0.5rem; white-space:nowrap; }
td { border-bottom:1px solid var(--rule); padding:0.7rem; vertical-align:top; }
th:first-child, td:first-child { padding-left:0; }
th:last-child, td:last-child { padding-right:0; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.company { font-weight:600; text-decoration:none; color:var(--fg); }
.company:hover { color:var(--accent); }
.sub { display:block; color:var(--muted); font-size:0.84em; }
.dash, .bots { color:var(--muted); }
.empty { color:var(--muted); text-align:center; padding:2.5rem 0; }
tr.is-open .company { color:var(--accent); }
tr.is-archived { opacity:0.45; }
tr.is-bot { opacity:0.5; }

.pill { display:inline-block; font-size:0.72rem; font-weight:500; letter-spacing:0.04em;
        text-transform:uppercase; padding:0.12rem 0.5rem; border-radius:99px;
        border:1px solid var(--rule); color:var(--muted); }
.pill-view { background:var(--accent-soft); color:var(--accent); border-color:transparent; }
.ua { color:var(--muted); font-family:var(--mono); font-size:0.76rem; }

form.edit { margin:1.5rem 0 0; display:grid; gap:0.85rem; max-width:32rem; }
form.edit label { display:block; font-size:0.78rem; text-transform:uppercase;
                  letter-spacing:0.06em; color:var(--muted); }
form.edit label input, form.edit label textarea { margin-top:0.3rem; }
.edit-actions { display:flex; gap:0.5rem; }
</style>
</head>
<body>
<div class="wrap">
<h1><a href="${base}/" style="text-decoration:none;color:inherit">Attribution</a></h1>
${body}
</div>
<script>
document.querySelectorAll('time[datetime]').forEach(function (el) {
  var d = new Date(el.getAttribute('datetime'));
  if (!isNaN(d)) el.textContent = d.toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
});
document.querySelectorAll('.copy').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var src = document.getElementById(btn.dataset.copy);
    navigator.clipboard.writeText(src.textContent).then(function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
    });
  });
});
</script>
</body>
</html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
