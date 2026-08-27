import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  createQuilLiveGateway,
  quilLiveConfig,
  QuilLiveError,
  validateQuilLiveObservation
} from '../quil-live.mjs';

const roots = [];
const token = 'fixture-private-token-with-32-characters-minimum';

function observation(overrides = {}) {
  return {
    schema: 'quil-live-observation/1.0',
    effect: 'observation-only',
    eventId: 'fixture:event:1',
    sequence: 1,
    observedAt: '2026-08-15T03:00:00.000Z',
    source: { id: 'fixture-source', label: 'Fixture source', kind: 'custom' },
    subject: { kind: 'artist-wavid', id: 'wavewarz:audius:fixture' },
    signals: [{ channel: 'presence', value: 0.75, confidence: 1, semantic: 'Normalized fixture presence.' }],
    provenance: { retrieval: 'local', uri: 'https://example.test/public', recordId: 'record-1' },
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('QUIL LIVE gateway', () => {
  it('stays disabled by default and exposes no configured token', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quil-live-'));
    roots.push(root);
    const gateway = createQuilLiveGateway({ workspaceRoot: root, config: quilLiveConfig({}) });
    const status = await gateway.status();
    assert.equal(status.state, 'disabled');
    assert.equal(status.accepting, false);
    assert.equal(JSON.stringify(status).includes(token), false);
    await assert.rejects(() => gateway.ingest(observation(), token), (error) => error instanceof QuilLiveError && error.status === 503);
  });

  it('accepts one authenticated bounded observation and rejects replay or order drift', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quil-live-'));
    roots.push(root);
    const fixed = new Date('2026-08-15T03:00:02.000Z');
    const gateway = createQuilLiveGateway({
      workspaceRoot: root,
      now: () => fixed,
      config: { enabled: true, configured: true, token, maxPacketAgeSeconds: 300, maxEventsPerMinute: 20 }
    });
    await assert.rejects(() => gateway.ingest(observation(), 'wrong-token-with-at-least-32-characters'), (error) => error.status === 401);
    const receipt = await gateway.ingest(observation(), token);
    assert.equal(receipt.accepted, true);
    assert.equal(receipt.effect, 'observation-only');
    const status = await gateway.status();
    assert.equal(status.state, 'active');
    assert.equal(status.freshObservations, 1);
    assert.equal(status.subjects[0].id, 'wavewarz:audius:fixture');
    assert.equal(status.subjects[0].signals[0].value, 0.75);
    await assert.rejects(() => gateway.ingest(observation(), token), (error) => error.status === 409);
    await assert.rejects(() => gateway.ingest(observation({ eventId: 'fixture:event:2' }), token), (error) => error.status === 409);
    const state = await readFile(path.join(root, 'catalog', 'operations', 'quil-live', 'state.json'), 'utf8');
    assert.equal(state.includes(token), false);
    assert.equal(state.includes('anatomy'), false);
  });

  it('fails closed on identity mutation fields, stale packets, unsafe URLs, and invalid Genesis IDs', () => {
    const options = { now: new Date('2026-08-15T03:00:02.000Z'), maxPacketAgeSeconds: 300 };
    assert.throws(() => validateQuilLiveObservation(observation({ anatomy: {} }), options), /cannot enter/);
    assert.throws(() => validateQuilLiveObservation(observation({ undocumented: true }), options), /not part/);
    assert.throws(() => validateQuilLiveObservation(observation({ observedAt: '2026-08-15T02:00:00.000Z' }), options), /too old/);
    assert.throws(() => validateQuilLiveObservation(observation({ provenance: { retrieval: 'poll', uri: 'https://user:pass@example.test' } }), options), /credential-free/);
    assert.throws(() => validateQuilLiveObservation(observation({ subject: { kind: 'genesis-wavform', id: '0556' } }), options), /0001 through 0555/);
  });

  it('expires observations from the read projection without rewriting history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quil-live-'));
    roots.push(root);
    let tick = Date.parse('2026-08-15T03:00:02.000Z');
    const gateway = createQuilLiveGateway({
      workspaceRoot: root,
      now: () => new Date(tick),
      config: { enabled: true, configured: true, token, maxPacketAgeSeconds: 5, maxEventsPerMinute: 20 }
    });
    await gateway.ingest(observation(), token);
    tick += 6_000;
    const status = await gateway.status();
    assert.equal(status.state, 'armed');
    assert.equal(status.freshObservations, 0);
    assert.deepEqual(status.subjects, []);
  });
});
