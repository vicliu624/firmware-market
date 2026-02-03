# Firmware Manifests

Add one JSON file per release under `packages/`. The filename can be any unique slug, for example:

```
packages/mydevice-lorawan-v1.2.3.json
```

## Required Fields

- `id` (stable package id, lowercase slug)
- `name`
- `version`
- `boards` (array of `{ brand, model, label? }`)
- `regions` (array, optional for non-radio firmware)
- `features` (array)
- `tagline` (short marketing line)
- `release_channel` (`stable` | `preview`)
- `support` (`supported` | `deprecated`)
- `featured` (boolean)
- `poster` (hero + gallery)
- `story` (array of short paragraphs)
- `feature_sections` (array of feature modules)
- `trust` (`official` | `verified` | `community`)
- `publisher` (name, github, repo)
- `release` (date, notes)
- `artifacts` (array of files with url + sha256)
  - Optional `flash_url` for same-origin Web Flash (avoid CORS issues)

## Optional Fields

- `description`, `license`
- `mcu` (array)
- `regions` (omit if not applicable)
- `constraints`
- `links`

## Checklist (PR)

- Manifest validates against `schemas/manifest.schema.json`
- Fields comply with `schemas/allowed.json`
- Artifact URLs are reachable
- SHA256 values are correct
- No need to edit `manifests.json` (CI builds it)

## Example

```
{
  "id": "example.sensor",
  "name": "Example Sensor",
  "version": "1.0.0",
  "description": "Stable release for Example Sensor",
  "license": "MIT",
  "boards": [{ "brand": "lilygo", "model": "t-deck", "label": "T-Deck" }],
  "mcu": ["esp32"],
  "regions": ["US915"],
  "features": ["lorawan", "gps"],
  "tagline": "Reliable field firmware for quick deployments",
  "release_channel": "stable",
  "support": "supported",
  "featured": true,
  "trust": "community",
  "publisher": {
    "name": "Example Org",
    "github": "example",
    "repo": "https://github.com/example/repo"
  },
  "release": {
    "date": "2026-01-10",
    "notes": "https://github.com/example/repo/releases/tag/v1.0.0"
  },
  "artifacts": [
    {
      "file": "firmware.bin",
      "type": "bin",
      "url": "https://github.com/example/repo/releases/download/v1.0.0/firmware.bin",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "variant": "us915",
      "flash": { "offset": "0x0" }
    }
  ]
}
```
