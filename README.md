# ArtistOS

ArtistOS is a local-first command center for artist operations, creative tools,
review, approvals, and manual delivery. Music Maker, Visual Maker, and Asset
Forge run through the first-party REGALIA//89 interface; optional engines stay
behind server-side adapters and their native GUIs are never exposed.

## Quick start

Requirements: Node.js 20+ and a current browser.

```bash
cd tools/command-center
npm run doctor
npm test
npm start
```

Open `http://127.0.0.1:8989`. No package install, AI model, GPU, cloud account,
or publishing account is required for the core.

To use another writable workspace:

```bash
ARTISTOS_WORKSPACE_ROOT=/path/to/artist-workspace npm start
```

The app starts safely with an empty workspace and creates operational state only
after the first intentional save.

## Website mode

ArtistOS can sit behind an HTTPS reverse proxy with passcode authentication.
Read [`tools/command-center/WEBSITE-DEPLOYMENT.md`](tools/command-center/WEBSITE-DEPLOYMENT.md).
This is a stateful Node service, so it is not a static Netlify site. Netlify may
front a separately hosted ArtistOS origin, but the server and writable workspace
must run on a persistent host.

## Optional creative packs

- Asset Forge renderer: `tools/artistos-remotion/`
- ACE-Step Music Maker adapter: disabled until explicitly configured
- WaveWarz/WavID: optional public-data integration
- QUIL LIVE: disabled-by-default observation gateway
- Postiz: dormant, explicit-opt-in delivery adapter

Optional packs may be absent without breaking the core. Generated work remains
a draft until the artist approves it; ArtistOS never publishes automatically.

## Public-release boundary

This repository contains reusable source, tests, schemas, examples, and docs.
It intentionally excludes OxQuan's private media, masters, campaigns, feedback,
analytics, credentials, operational state, model weights, caches, and generated
outputs. REGALIA//89 is product identity, not the artist or content author.

Licensed under MIT. See [`TRADEMARKS.md`](TRADEMARKS.md) for the separate brand
and trademark boundary.
