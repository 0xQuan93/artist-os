# ArtistOS Remotion pack

Optional deterministic renderer used by Asset Forge. Install it separately:

```bash
npm install
npm run typecheck
npm run build
```

The Command Center invokes only `scripts/render-asset-forge.mjs` with a fixed,
validated job contract. The Remotion Studio is a developer tool and is never
embedded in or linked from the ArtistOS product UI.
