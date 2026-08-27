import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const QUIL_LIVE_SCHEMA = 'quil-live-observation/1.0';
const STATE_SCHEMA = 'artistos-quil-live-state/1.0';
const MAX_OBSERVATIONS = 500;
const SOURCE_KINDS = new Set(['wavewarz', 'stream', 'venue', 'sensor', 'social', 'custom']);
const SUBJECT_KINDS = new Set(['artist-wavid', 'genesis-wavform']);
const RETRIEVAL_MODES = new Set(['push', 'poll', 'webhook', 'local']);
const FORBIDDEN_FIELDS = new Set(['anatomy', 'approval', 'canon', 'publication', 'mint', 'utility', 'genome', 'seed']);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,179}$/;
const SAFE_CHANNEL = /^[a-z][a-z0-9._-]{0,47}$/;
const SHA256 = /^[A-F0-9]{64}$/;

const DEFAULT_STATE = {
  schema: STATE_SCHEMA,
  updatedAt: null,
  observations: []
};

export class QuilLiveError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'QuilLiveError';
    this.status = status;
  }
}

const text = (value) => String(value ?? '').trim();
const clampInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();

function rejectUnknownKeys(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new QuilLiveError(`${field} must be an object`, 422);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new QuilLiveError(`${field}.${unknown} is not part of ${QUIL_LIVE_SCHEMA}`, 422);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return structuredClone(fallback);
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, filePath);
}

export function quilLiveConfig(env = process.env) {
  const enabled = text(env.ARTISTOS_ENABLE_QUIL_LIVE) === '1';
  const token = text(env.ARTISTOS_QUIL_LIVE_TOKEN);
  return {
    enabled,
    configured: enabled && token.length >= 32,
    token,
    maxPacketAgeSeconds: clampInteger(env.ARTISTOS_QUIL_LIVE_MAX_AGE_SECONDS, 300, 5, 86_400),
    maxEventsPerMinute: clampInteger(env.ARTISTOS_QUIL_LIVE_MAX_EVENTS_PER_MINUTE, 120, 1, 500)
  };
}

function safeLabel(value, field, maximum = 96) {
  const candidate = text(value);
  if (!candidate || candidate.length > maximum || /[\u0000-\u001f\u007f]/.test(candidate)) {
    throw new QuilLiveError(`${field} must be plain text no longer than ${maximum} characters`, 422);
  }
  return candidate;
}

function safeOptionalUrl(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new QuilLiveError('provenance.uri must be an HTTP(S) URL', 422);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new QuilLiveError('provenance.uri must be a credential-free HTTP(S) URL', 422);
  }
  return parsed.toString();
}

function validateSubject(subject) {
  rejectUnknownKeys(subject, new Set(['kind', 'id', 'bindingSha256']), 'subject');
  const kind = text(subject?.kind);
  const id = text(subject?.id);
  if (!SUBJECT_KINDS.has(kind)) throw new QuilLiveError('subject.kind is unsupported', 422);
  if (!SAFE_ID.test(id)) throw new QuilLiveError('subject.id is invalid', 422);
  if (kind === 'genesis-wavform' && !/^0(?:00[1-9]|0[1-9]\d|[1-4]\d{2}|5[0-4]\d|55[0-5])$/.test(id)) {
    throw new QuilLiveError('Genesis subject IDs must be editions 0001 through 0555', 422);
  }
  const bindingSha256 = text(subject?.bindingSha256).toUpperCase() || null;
  if (bindingSha256 && !SHA256.test(bindingSha256)) throw new QuilLiveError('subject.bindingSha256 must be SHA-256', 422);
  return { kind, id, bindingSha256 };
}

function validateSignals(signals) {
  if (!Array.isArray(signals) || signals.length < 1 || signals.length > 16) {
    throw new QuilLiveError('signals must contain 1 to 16 normalized channels', 422);
  }
  const names = new Set();
  return signals.map((signal) => {
    rejectUnknownKeys(signal, new Set(['channel', 'value', 'confidence', 'semantic']), 'signal');
    const channel = text(signal?.channel).toLowerCase();
    if (!SAFE_CHANNEL.test(channel) || names.has(channel)) throw new QuilLiveError('signal channels must be unique safe IDs', 422);
    names.add(channel);
    const value = Number(signal?.value);
    const confidence = signal?.confidence === undefined ? 1 : Number(signal.confidence);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new QuilLiveError(`${channel} must be normalized from 0 to 1`, 422);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new QuilLiveError(`${channel} confidence must be normalized from 0 to 1`, 422);
    return {
      channel,
      value: Number(value.toFixed(6)),
      confidence: Number(confidence.toFixed(6)),
      semantic: safeLabel(signal?.semantic, `${channel} semantic`, 160)
    };
  });
}

export function validateQuilLiveObservation(input, { now = new Date(), maxPacketAgeSeconds = 300 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new QuilLiveError('Observation must be a JSON object', 422);
  for (const field of FORBIDDEN_FIELDS) {
    if (Object.hasOwn(input, field)) throw new QuilLiveError(`${field} cannot enter through the live observation layer`, 422);
  }
  rejectUnknownKeys(input, new Set(['schema', 'effect', 'eventId', 'sequence', 'observedAt', 'source', 'subject', 'signals', 'provenance']), 'observation');
  if (input.schema !== QUIL_LIVE_SCHEMA) throw new QuilLiveError(`schema must be ${QUIL_LIVE_SCHEMA}`, 422);
  if (input.effect !== 'observation-only') throw new QuilLiveError('effect must be observation-only', 422);
  const eventId = text(input.eventId);
  if (!SAFE_ID.test(eventId)) throw new QuilLiveError('eventId is invalid', 422);
  const sourceId = text(input.source?.id).toLowerCase();
  const sourceKind = text(input.source?.kind).toLowerCase();
  rejectUnknownKeys(input.source, new Set(['id', 'label', 'kind']), 'source');
  if (!SAFE_ID.test(sourceId)) throw new QuilLiveError('source.id is invalid', 422);
  if (!SOURCE_KINDS.has(sourceKind)) throw new QuilLiveError('source.kind is unsupported', 422);
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime())) throw new QuilLiveError('observedAt must be an ISO timestamp', 422);
  const ageMs = now.getTime() - observedAt.getTime();
  if (ageMs < -30_000) throw new QuilLiveError('observedAt is too far in the future', 422);
  if (ageMs > maxPacketAgeSeconds * 1000) throw new QuilLiveError('Observation is too old for the configured live window', 422);
  const sequence = Number(input.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new QuilLiveError('sequence must be a non-negative safe integer', 422);
  const retrieval = text(input.provenance?.retrieval).toLowerCase();
  rejectUnknownKeys(input.provenance, new Set(['retrieval', 'uri', 'recordId']), 'provenance');
  if (!RETRIEVAL_MODES.has(retrieval)) throw new QuilLiveError('provenance.retrieval is unsupported', 422);
  return {
    schema: QUIL_LIVE_SCHEMA,
    effect: 'observation-only',
    eventId,
    sequence,
    observedAt: observedAt.toISOString(),
    source: {
      id: sourceId,
      label: safeLabel(input.source?.label, 'source.label'),
      kind: sourceKind
    },
    subject: validateSubject(input.subject),
    signals: validateSignals(input.signals),
    provenance: {
      retrieval,
      uri: safeOptionalUrl(input.provenance?.uri),
      recordId: input.provenance?.recordId ? safeLabel(input.provenance.recordId, 'provenance.recordId', 128) : null
    }
  };
}

function tokenMatches(expected, supplied) {
  const expectedBytes = Buffer.from(text(expected));
  const suppliedBytes = Buffer.from(text(supplied));
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function newestFirst(a, b) {
  return String(b.observedAt).localeCompare(String(a.observedAt));
}

export class QuilLiveGateway {
  constructor({ workspaceRoot, config = quilLiveConfig(), now = () => new Date() }) {
    this.config = config;
    this.now = now;
    this.statePath = path.join(workspaceRoot, 'catalog', 'operations', 'quil-live', 'state.json');
    this.ingestQueue = Promise.resolve();
  }

  async status() {
    const now = this.now();
    const state = await readJson(this.statePath, DEFAULT_STATE);
    const fresh = state.observations.filter((item) => new Date(item.expiresAt).getTime() > now.getTime()).sort(newestFirst);
    const sourceMap = new Map();
    const subjectMap = new Map();
    for (const item of fresh) {
      if (!sourceMap.has(item.source.id)) sourceMap.set(item.source.id, {
        id: item.source.id,
        label: item.source.label,
        kind: item.source.kind,
        lastObservedAt: item.observedAt
      });
      const subjectKey = `${item.subject.kind}:${item.subject.id}`;
      if (!subjectMap.has(subjectKey)) subjectMap.set(subjectKey, {
        kind: item.subject.kind,
        id: item.subject.id,
        observedAt: item.observedAt,
        expiresAt: item.expiresAt,
        sourceId: item.source.id,
        signals: item.signals
      });
    }
    const sources = [...sourceMap.values()];
    const subjects = [...subjectMap.values()];
    return {
      schema: 'artistos-quil-live-status/1.0',
      enabled: this.config.enabled,
      configured: this.config.configured,
      accepting: this.config.configured,
      state: !this.config.enabled ? 'disabled' : this.config.configured ? (fresh.length ? 'active' : 'armed') : 'misconfigured',
      freshObservations: fresh.length,
      sources,
      subjects,
      contract: {
        observationSchema: QUIL_LIVE_SCHEMA,
        endpoint: '/api/quil/live/observations',
        authentication: 'Bearer token or X-QUIL-Live-Token header',
        maxPacketAgeSeconds: this.config.maxPacketAgeSeconds,
        maxEventsPerMinute: this.config.maxEventsPerMinute
      },
      boundaries: {
        observationOnly: true,
        mutatesAnatomy: false,
        mutatesApproval: false,
        publication: false,
        mint: false,
        utility: false
      }
    };
  }

  ingest(input, suppliedToken) {
    const task = this.ingestQueue.then(() => this.#ingest(input, suppliedToken));
    this.ingestQueue = task.catch(() => {});
    return task;
  }

  async #ingest(input, suppliedToken) {
    if (!this.config.enabled) throw new QuilLiveError('QUIL LIVE ingestion is disabled', 503);
    if (!this.config.configured) throw new QuilLiveError('QUIL LIVE is enabled without a valid server token', 503);
    if (!tokenMatches(this.config.token, suppliedToken)) throw new QuilLiveError('QUIL LIVE authentication failed', 401);
    const now = this.now();
    const observation = validateQuilLiveObservation(input, {
      now,
      maxPacketAgeSeconds: this.config.maxPacketAgeSeconds
    });
    const state = await readJson(this.statePath, DEFAULT_STATE);
    if (state.observations.some((item) => item.source.id === observation.source.id && item.eventId === observation.eventId)) {
      throw new QuilLiveError('Duplicate live event rejected', 409);
    }
    const streamKey = `${observation.source.id}:${observation.subject.kind}:${observation.subject.id}`;
    const latest = state.observations
      .filter((item) => item.streamKey === streamKey)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (latest && observation.sequence <= latest.sequence) throw new QuilLiveError('Out-of-order live sequence rejected', 409);
    const recentCount = state.observations.filter((item) => (
      item.source.id === observation.source.id
      && now.getTime() - new Date(item.receivedAt).getTime() < 60_000
    )).length;
    if (recentCount >= this.config.maxEventsPerMinute) throw new QuilLiveError('Live source rate limit reached', 429);
    const receivedAt = now.toISOString();
    const expiresAt = new Date(new Date(observation.observedAt).getTime() + this.config.maxPacketAgeSeconds * 1000).toISOString();
    const record = {
      ...observation,
      id: randomUUID(),
      streamKey,
      receivedAt,
      expiresAt,
      sha256: sha256(canonicalStringify(observation))
    };
    state.schema = STATE_SCHEMA;
    state.updatedAt = receivedAt;
    state.observations = [record, ...state.observations].slice(0, MAX_OBSERVATIONS);
    await writeJsonAtomic(this.statePath, state);
    return {
      accepted: true,
      id: record.id,
      eventId: record.eventId,
      receivedAt,
      expiresAt,
      sha256: record.sha256,
      effect: record.effect
    };
  }
}

export function createQuilLiveGateway(options) {
  return new QuilLiveGateway(options);
}
