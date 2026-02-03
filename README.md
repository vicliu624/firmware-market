# Firmware Market

A GitHub-driven firmware distribution index and static web site. Contributors submit manifest files through PRs; CI validates and aggregates them into a single `index.json` used by the site.

## Repo Structure

```
firmware-market/
  site/                  # Static web site (GitHub Pages)
  packages/              # Firmware manifests (one file per release)
  index.json             # Generated aggregate index
  schemas/               # JSON schemas and allowed value lists
  scripts/               # Build/validation utilities
  docs/                  # Flashing guides, governance, FAQ
  .github/workflows/     # CI validation + Pages deploy
```

## Local Development

1) Validate and generate `index.json`

```
python scripts/build_index.py
```

2) Build site output (copies site + index + docs into `dist/`)

```
python scripts/build_site.py
```

Open `dist/index.html` in a browser.

## Contributing Firmware

See `packages/README.md` for the manifest format and PR checklist.

## Governance / Trust

See `docs/governance.md` for trust tiers and review expectations.
