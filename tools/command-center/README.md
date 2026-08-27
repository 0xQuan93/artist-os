# ArtistOS // REGALIA Command Center

The dependency-free, local-first ArtistOS server and browser interface. It
provides the first-party Music Maker, Visual Maker, Asset Forge, Content Gallery,
QUIL, approvals, campaign state, metrics, and manual-delivery workflows without
embedding or linking to native engine GUIs.

## Run

```bash
npm run doctor
npm test
npm start
```

Open `http://127.0.0.1:8989`. Set `ARTISTOS_WORKSPACE_ROOT` to a writable artist
workspace. Missing data and optional packs appear unavailable; they do not stop
the core.

## Website mode

See [`WEBSITE-DEPLOYMENT.md`](WEBSITE-DEPLOYMENT.md). Use HTTPS, a strong
passcode hash, a persistent writable volume, and a trusted reverse proxy. The
browser never receives passcode hashes, engine credentials, or arbitrary command
execution.

## Creative engines

- Asset Forge uses `../artistos-remotion/` when installed.
- Music Maker can call a separately installed ACE-Step REST service through its
  authenticated server-side adapter.
- Saving a project does not render, generate, approve, or publish.
- Generated candidates and visual outputs remain drafts pending artist review.
