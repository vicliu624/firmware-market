# Vendor Libraries

Place offline JS bundles here so Web Flash can use them without CDN access.

Recommended paths:

- `site/vendor/esptool-js/esptool.min.js`
- `site/vendor/webdfu/index.js`
- `site/vendor/webdfu/nanoevents.js`

To follow the latest upstream versions, run:

```
python scripts/update_vendor.py
```

Web Flash will automatically enable the adapters in `site/vendor/flashers.js`
via an import map.
