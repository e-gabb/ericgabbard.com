# ericgabbard.com

Personal site. Static HTML/CSS, no build step, no dependencies.

## Structure

- `index.html` — homepage: positioning, projects, contact
- `ai.html` (served at `/ai`) — point of view on AI in product work + things built
- `projects/*.html` — case studies, listing at `projects/index.html` (served at `/projects`) (Problem / What I did / Tradeoffs / Outcome)
- `style.css` — single stylesheet, light + dark via `prefers-color-scheme`
- `resume.pdf` — downloadable résumé (a copy; see below)
- `site.js` — attribution beacon (see below)
- `attribution/` — the Cloudflare Worker behind per-company link tracking
- `CNAME` — custom domain for GitHub Pages

## Résumé

`resume.pdf` is a **copy** of the current build in `~/personal/job-hunt`. It does
not update itself when that résumé is regenerated. After rebuilding it there:

```
./sync-resume.sh
```

That copies the PDF in and bumps the `?v=` stamp on every link. The stamp matters
— browsers cache a PDF at an unchanged URL and will keep serving the old one.

## Attribution

Links of the form `ericgabbard.com/9kq5` identify which company opened the site,
without a UTM-laden URL. A Cloudflare Worker resolves the code, logs the open and
forwards to the real page; `site.js` confirms a human rather than a mail scanner
actually rendered it. The dashboard lives behind a secret path, not in this repo.

Setup and the runbook: [`attribution/README.md`](attribution/README.md).

## Local preview

```
python3 -m http.server 8321
```

Then open http://localhost:8321

## Deploy

Push to `main`. GitHub Pages serves the repo root.
