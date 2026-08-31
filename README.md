# ericgabbard.com

Personal site. Static HTML/CSS, no build step, no dependencies.

## Structure

- `index.html` — homepage: positioning, projects, contact
- `ai.html` — point of view on AI in product work + things built
- `work/*.html` — case studies (Problem / What I did / Tradeoffs / Outcome)
- `style.css` — single stylesheet, light + dark via `prefers-color-scheme`
- `resume.pdf` — downloadable résumé
- `CNAME` — custom domain for GitHub Pages

## Local preview

```
python3 -m http.server 8321
```

Then open http://localhost:8321

## Deploy

Push to `main`. GitHub Pages serves the repo root.
