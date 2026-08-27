const endpoint = String(process.env.QUIL_LIVE_URL || 'http://127.0.0.1:8989').replace(/\/$/, '');
const token = String(process.env.ARTISTOS_QUIL_LIVE_TOKEN || '').trim();

if (token.length < 32) {
  throw new Error('Set ARTISTOS_QUIL_LIVE_TOKEN to the same 32+ character token used by the Command Center.');
}

const sequence = Number(process.argv[2] || Date.now());
const observation = {
  schema: 'quil-live-observation/1.0',
  effect: 'observation-only',
  eventId: `example:${sequence}`,
  sequence,
  observedAt: new Date().toISOString(),
  source: {
    id: 'example-adapter',
    label: 'Example local adapter',
    kind: 'custom'
  },
  subject: {
    kind: 'artist-wavid',
    id: 'wavewarz:audius:replace-with-artist-key'
  },
  signals: [
    {
      channel: 'presence',
      value: 0.72,
      confidence: 1,
      semantic: 'Normalized source presence within the adapter sampling window.'
    }
  ],
  provenance: {
    retrieval: 'local',
    recordId: `example:${sequence}`
  }
};

const response = await fetch(`${endpoint}/api/quil/live/observations`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(observation)
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || `QUIL LIVE returned HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));
