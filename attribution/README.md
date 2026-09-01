# Link attribution

Know which company opened your site, without a tracking-flavoured URL.

You send `ericgabbard.com/9kq5` instead of `ericgabbard.com/?utm_source=...`. A
Cloudflare Worker catches that path, records the open, and forwards to the real
page. The dashboard lists every company and when they looked.

```
recruiter clicks ericgabbard.com/9kq5
   │
   ├─ Worker logs a click, sets a 30-minute cookie
   └─ 302 → ericgabbard.com/           (nothing odd in the address bar)
        │
        └─ site.js confirms a real browser rendered it  → POST /e
```

## Why two events, not one

A click proves almost nothing. Corporate mail security — Defender, Proofpoint,
Mimecast — follows every link in every inbound email, often within seconds of
an application landing. Chat unfurlers do the same. If you count clicks you
will believe a company read your site four minutes after you applied, at 3am,
from a datacenter.

So a click is logged but never counted as an open. Only `site.js` — which
requires a real browser, a visible tab, and a second and a half of dwell —
promotes it to a **read**. Scanner traffic is kept, marked, and shown greyed
out, because "eleven scanner hits, zero reads" is itself worth knowing.

## What it stores

`company`, `role`, the code, and per event: timestamp, country, mobile/desktop,
user-agent, referrer. **No IP addresses** — country comes from Cloudflare's edge
and that is as far as it goes. The cookie is first-party, holds only the
4-character code, and expires in 30 minutes.

## Setup

You need the Cloudflare account that already owns this zone. Roughly 15 minutes.
Steps 1–6 are safe: they change nothing about the live site. Step 7 is the one
that puts Cloudflare in front of it.

**1. Log in**

```
cd attribution
npx wrangler login
```

**2. Create the database**

```
npx wrangler d1 create attribution
```

Copy the `database_id` it prints into `wrangler.toml`, replacing
`PASTE_THE_ID_FROM_D1_CREATE`.

**3. Create the tables**

```
npx wrangler d1 execute attribution --remote --file=schema.sql
```

**4. Pick a dashboard secret**

```
openssl rand -hex 16
```

This string is the only thing protecting the dashboard, so treat it like a
password. It never goes in the repo — this directory is public on GitHub.

**5. Store it**

```
npx wrangler secret put DASH_SECRET
```

Paste the string when prompted.

**6. Deploy and test**

```
npx wrangler deploy
```

Wrangler prints a `*.workers.dev` URL. Open
`https://<that-url>/x/<your-secret>` and you should get the dashboard. Create a
test link. The site is still untouched at this point — the route in
`wrangler.toml` stays inert while DNS is grey-clouded.

**7. Put Cloudflare in front of the site**

In the Cloudflare dashboard for `ericgabbard.com`:

- **DNS** → the four `A` records pointing at `185.199.10x.153`: switch each from
  grey cloud (DNS only) to **orange cloud (Proxied)**. Same for the `www` record
  if you have one.
- **SSL/TLS** → set the mode to **Full (strict)**.
  This matters. GitHub Pages already serves a valid certificate for your domain,
  so Full (strict) is correct — and **Flexible will put the site in an infinite
  redirect loop**.
- **Speed → Optimization** → make sure **Rocket Loader is off**. It defers and
  rewrites inline script, which is exactly what the homepage scroll animation
  and the beacon are.

Give it a minute, then check `curl -sI https://ericgabbard.com/` — the `server`
header should now say `cloudflare` rather than `GitHub.com`.

**8. Verify the whole path**

Open a real link from your phone (not a tab you have already been clicking in),
let the homepage settle, then reload the dashboard. You want a **read**, not
just a click.

## Rolling back

Flip the DNS records back to grey cloud. The Worker route stops matching
immediately and the site serves from GitHub Pages exactly as before. Nothing
else has to be undone, and the data is still there when you re-enable it.

## Everyday use

Go to `https://ericgabbard.com/x/<your-secret>`, type a company name, hit
**Create link**, copy the URL, paste it into the application. Click a company to
see its timeline, add notes, or archive it once the role closes.

Bookmark that URL. There is no way to recover the secret if you lose it — you
would set a new one with `wrangler secret put` and the old link stops working.

## Cost

Free, and not on a trial. Workers allow 100,000 requests/day and D1 gives 5GB;
a personal site uses a rounding error of both.

## Notes

- Codes are four characters from an alphabet with no `i`, `l`, `o`, `0` or `1`,
  and always contain a digit. The digit is load-bearing: it is what stops a real
  path like `/work` from being mistaken for a code.
- A wrong secret, an unknown code, and an archived code all return the ordinary
  site 404. Nothing advertises that any of this exists.
- Anything that throws in the Worker falls through to GitHub Pages. A bug here
  should never be able to take the site down.
- If you edit `site.js`, bump the `?v=` stamp on the eight `<script>` tags that
  reference it, the same way `sync-resume.sh` does for the PDF.
