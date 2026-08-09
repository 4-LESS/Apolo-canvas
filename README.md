# Apolo Canvas (fka Obsidian Ink)

This plugin was originally named "Obsidian Ink" and has been renamed to **Apolo Canvas**.

Notes:
- Plugin id changed from `obsidian-ink` to `apolo-canvas` in `manifest.json`.
- Package name updated to `apolo-canvas` in `package.json`.
- Many internal paths and strings still reference `ObsidianInk/data/` and console tags like `[ObsidianInk]`. Those were not bulk-renamed in source code; search-and-replace may be required if you want to fully migrate internal identifiers and folder names.

Git / Deployment

1. Initialize git and add files:

```bash
git init
git add .
git commit -m "chore: rename plugin to Apolo Canvas and initial repo setup"
```

2. Add remote and push (replace with your auth method):

```bash
git remote add origin https://github.com/4-LESS/Apolo-canvas.git
git branch -M main
git push -u origin main
```

Development

- Build: `npm run build`
- Dev: `npm run dev`
- Tests: `npm test`
