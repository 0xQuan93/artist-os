# QUIL LIVE Integration Contract

QUIL LIVE is a local ingestion boundary for time-bounded observations that may
inform a WavForm's separate live layer. It does not rewrite the WavForm's frozen
anatomy, genome, source checkpoint, render receipt, approval, canon,
publication, mint, or utility state.

The gateway uses Node.js built-ins, binds through the existing loopback Command
Center, makes no outbound request, and is disabled by default. The rest of
ArtistOS works normally when QUIL LIVE is absent or disabled.

## Shareable integration surface

These files form the portable integration kit and may be shared without the
OxQuan catalog, private operational state, rendered media, or credentials:

- `contracts/quil-live-observation.schema.json` — versioned JSON contract;
- `examples/quil-live-adapter.mjs` — dependency-free POST example;
- `quil-live.env.example` — safe configuration names and defaults;
- `quil-live.mjs` — validation, authentication, replay protection, freshness,
  rate limiting, persistence, and read-only projection;
- this document.

This kit is integration-ready. The complete private OxQuan repository is not a
public distribution package until its separate privacy, rights, licensing,
dependency, and brand-deidentification gates pass.

## Activate one local session

Use a unique secret of at least 32 characters. Keep it outside Git and pass the
same value only to the Command Center process and approved local adapter.

```powershell
$env:ARTISTOS_ENABLE_QUIL_LIVE='1'
$env:ARTISTOS_QUIL_LIVE_TOKEN='<private-random-token-at-least-32-characters>'
npm start
```

Or launch on Windows with `Start-CommandCenter.ps1 -ConfigureQuilLive`; the
launcher requests the token as hidden input and keeps it process-only.

Optional controls:

```text
ARTISTOS_QUIL_LIVE_MAX_AGE_SECONDS=300
ARTISTOS_QUIL_LIVE_MAX_EVENTS_PER_MINUTE=120
```

The allowed age range is 5–86400 seconds. The allowed source rate is 1–500
events per minute. Invalid values fall back to the safe defaults above.

## Send an observation

POST JSON to `http://127.0.0.1:8989/api/quil/live/observations` with either:

```text
Authorization: Bearer <token>
```

or:

```text
X-QUIL-Live-Token: <token>
```

Minimal body:

```json
{
  "schema": "quil-live-observation/1.0",
  "effect": "observation-only",
  "eventId": "wavewarz:artist:oxquan:1042",
  "sequence": 1042,
  "observedAt": "2026-08-15T03:00:00.000Z",
  "source": {
    "id": "wavewarz-public-adapter",
    "label": "WaveWarz public adapter",
    "kind": "wavewarz"
  },
  "subject": {
    "kind": "artist-wavid",
    "id": "wavewarz:audius:oxquan"
  },
  "signals": [
    {
      "channel": "battle-pressure",
      "value": 0.64,
      "confidence": 1,
      "semantic": "Normalized completed-battle activity in the adapter window."
    }
  ],
  "provenance": {
    "retrieval": "poll",
    "uri": "https://example.test/public-source",
    "recordId": "public-record-1042"
  }
}
```

Every channel value and confidence is normalized from 0 to 1. Each channel
requires a short semantic definition so visual mapping never outruns what the
source actually proves. QUIL does not assign meaning to channel names.

Use `subject.kind: "genesis-wavform"` with an edition ID from `0001` through
`0555` for Genesis observations. Use the stable artist key stored by QUIL for
an Artist WavID. A known frozen-definition SHA-256 may be supplied as
`subject.bindingSha256` when the adapter can defend that binding.

Run the included example from `tools/command-center/` after replacing its
placeholder subject ID:

```powershell
node examples/quil-live-adapter.mjs
```

## Read status

`GET /api/quil/live` needs no token and returns only the sanitized gateway
state, fresh source/subject observations, contract limits, and safety
boundaries. It never returns the configured token, raw upstream payloads,
environment data, or expired observations.

Gateway states:

- `disabled` — default; ingestion returns 503 and creates no state;
- `misconfigured` — explicitly enabled without a valid token;
- `armed` — authenticated ingestion is ready, with no fresh packet;
- `active` — one or more unexpired observations are visible to QUIL.

Accepted observations are stored in
`catalog/operations/quil-live/state.json`. Retention is bounded to the latest
500 sanitized observations. Source/event replay, non-increasing stream
sequence, stale or future timestamps, unsafe URLs, unsupported subjects,
unbounded values, and forbidden identity/approval fields fail closed.

## Adapter requirements

An integration is ready when it:

1. maps one external subject to a stable QUIL subject ID;
2. documents each normalized channel and sampling window;
3. preserves source timestamp, record ID, and credential-free source URI;
4. increments sequence monotonically for each source/subject stream;
5. retries only with a new event ID when source evidence genuinely changes;
6. treats HTTP 409 as replay/order rejection and HTTP 429 as backpressure;
7. keeps API credentials and the QUIL token outside packets, logs, and Git;
8. passes contract fixtures without network access;
9. never maps color or motion to health, injury, rank, rarity, price, support,
   ownership, artist value, or human worth;
10. never claims that observation creates canon, publication, mint, payment,
    utility, awareness, or a new frozen identity.

Downstream visual mappings remain a separately approved layer. The current
gateway receives and displays live observations; it does not yet drive organism
anatomy or render output.
