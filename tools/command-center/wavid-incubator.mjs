import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, link, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildWavIdProductionDefinition, projectWavIdAnatomyEncoding } from './wavid-production-definition.mjs';
import { projectMaterialAnatomy } from './wavforms-nursery.mjs';

const API_BASE = 'https://wavewarz.info/api/public';
const ROSTER_SCHEMA = 'artistos-wavewarz-wavid-roster/1.0';
const STATE_SCHEMA = 'artistos-wavid-incubator-state/1.1';
const BIRTH_SCHEMA = 'quantum-quil-artist-wavid-birth/0.2.0';
const MIN_SYNC_INTERVAL_MS = 30_000;
const MAX_RESPONSE_BYTES = 8_000_000;
const REVISION_AUTHORITY = Symbol('wavid-revision-authority');

const DEFAULT_STATE = {
  schema: STATE_SCHEMA,
  updatedAt: null,
  lastRosterSync: null,
  births: []
};

export class WavIdIncubatorError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'WavIdIncubatorError';
    this.status = status;
  }
}

const text = (value) => String(value ?? '').trim();
const key = (value) => text(value).toLocaleLowerCase('en-US');
const number = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const integer = (value) => Math.max(0, Math.trunc(number(value)));
const round = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
const slash = (value) => value.replaceAll('\\', '/');
const safeHex = (value) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value).toLowerCase() : null;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((entry) => [entry, canonicalize(value[entry])]));
  }
  return value;
}

export const canonicalStringify = (value) => JSON.stringify(canonicalize(value));
export const canonicalSha256 = (value) => createHash('sha256').update(canonicalStringify(value)).digest('hex').toUpperCase();
const bytesSha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();

function safeSlug(value) {
  const candidate = text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return candidate || `artist-${canonicalSha256(text(value)).slice(0, 10).toLowerCase()}`;
}

function isWithin(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, filePath);
  return { bytes: Buffer.byteLength(content), sha256: bytesSha256(content) };
}

async function writeJsonSetOnce(entries) {
  const tag = `${process.pid}-${randomUUID()}`;
  const prepared = [];
  try {
    for (const entry of entries) {
      const content = `${JSON.stringify(entry.value, null, 2)}\n`;
      await mkdir(path.dirname(entry.path), { recursive: true });
      try {
        const existing = await readFile(entry.path, 'utf8');
        if (existing !== content) throw new WavIdIncubatorError(`Refusing divergent WavID birth overwrite: ${slash(entry.path)}`, 409);
        prepared.push({ ...entry, staged: null });
      } catch (error) {
        if (error instanceof WavIdIncubatorError) throw error;
        if (error.code !== 'ENOENT') throw error;
        const staged = path.join(path.dirname(entry.path), `.partial-${tag}-${path.basename(entry.path)}`);
        await writeFile(staged, content, { encoding: 'utf8', flag: 'wx' });
        prepared.push({ ...entry, staged });
      }
    }
  } catch (error) {
    for (const entry of prepared) {
      if (!entry.staged) continue;
      try { await unlink(entry.staged); } catch {}
    }
    throw error;
  }
  const promoted = [];
  try {
    for (const entry of prepared) {
      if (!entry.staged) continue;
      await link(entry.staged, entry.path);
      promoted.push(entry.path);
    }
  } catch (error) {
    for (const created of promoted.reverse()) {
      try { await unlink(created); } catch {}
    }
    throw error;
  } finally {
    for (const entry of prepared) {
      if (!entry.staged) continue;
      try { await unlink(entry.staged); } catch {}
    }
  }
}

function audiusIdentity(musicLink) {
  try {
    const url = new URL(text(musicLink));
    if (url.protocol !== 'https:' || key(url.hostname) !== 'audius.co') return null;
    const handle = url.pathname.split('/').filter(Boolean)[0];
    if (!handle) return null;
    return { handle, normalizedHandle: key(handle) };
  } catch {
    return null;
  }
}

function chooseDisplayName(songs, fallback) {
  const counts = new Map();
  for (const song of songs) {
    const name = text(song.artistName);
    if (!name) continue;
    const normalized = key(name);
    const current = counts.get(normalized) || { name, count: 0 };
    current.count += 1;
    counts.set(normalized, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0]?.name || fallback;
}

function normalizedSong(song) {
  const countFieldsValid = ['battles', 'wins', 'losses', 'totalUniqueTraders']
    .every((field) => Number.isInteger(Number(song?.[field] ?? 0)) && Number(song?.[field] ?? 0) >= 0);
  const measureFieldsValid = ['winRate', 'totalVolumeSol']
    .every((field) => Number.isFinite(Number(song?.[field] ?? 0)) && Number(song?.[field] ?? 0) >= 0);
  return {
    songTitle: text(song?.songTitle),
    artistName: text(song?.artistName) || null,
    musicLink: text(song?.musicLink),
    genre: text(song?.genre) || 'Unspecified',
    artUrl: text(song?.artUrl) || null,
    battles: integer(song?.battles),
    wins: integer(song?.wins),
    losses: integer(song?.losses),
    winRate: number(song?.winRate),
    totalVolumeSol: round(number(song?.totalVolumeSol)),
    totalUniqueTraders: integer(song?.totalUniqueTraders),
    lastPlayed: text(song?.lastPlayed) || null,
    sourceValid: countFieldsValid && measureFieldsValid
  };
}

function normalizedMainArtist(artist) {
  return {
    wallet: text(artist?.wallet) || null,
    name: text(artist?.name),
    wins: integer(artist?.wins),
    losses: integer(artist?.losses),
    draws: integer(artist?.draws),
    battles: integer(artist?.battles),
    winRate: number(artist?.winRate),
    totalVolumeSol: round(number(artist?.totalVolumeSol)),
    totalEarningsSol: round(number(artist?.totalEarningsSol)),
    pfpUrl: text(artist?.pfpUrl) || null,
    xHandle: text(artist?.twitterHandle) || null
  };
}

function mainArtistScore(group, artist) {
  const names = new Set(group.songs.map((song) => key(song.artistName)).filter(Boolean));
  if (names.has(key(artist.name))) return 3;
  if (key(group.handle) === key(artist.name)) return 2;
  return 0;
}

export function buildRosterSnapshot({ artistsPayload, songsPayload, retrievedAt = new Date().toISOString() }) {
  const artistRows = Array.isArray(artistsPayload?.artists) ? artistsPayload.artists.map(normalizedMainArtist) : [];
  const songRows = Array.isArray(songsPayload?.songs) ? songsPayload.songs.map(normalizedSong) : [];
  const groups = new Map();
  const unresolvedSongs = [];

  for (const song of songRows) {
    const identity = audiusIdentity(song.musicLink);
    if (!identity) {
      unresolvedSongs.push(song);
      continue;
    }
    const artistKey = `wavewarz:audius:${identity.normalizedHandle}`;
    const group = groups.get(artistKey) || {
      artistKey,
      handle: identity.handle,
      normalizedHandle: identity.normalizedHandle,
      songs: []
    };
    group.songs.push(song);
    groups.set(artistKey, group);
  }

  const matchedMainArtists = new Set();
  const roster = [...groups.values()].map((group) => {
    group.songs.sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
    const displayName = chooseDisplayName(group.songs, group.handle);
    const matches = artistRows
      .map((artist, index) => ({ artist, index, score: mainArtistScore(group, artist) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.artist.battles - a.artist.battles);
    const main = matches[0]?.artist || null;
    if (matches[0]) matchedMainArtists.add(matches[0].index);
    const quickBattle = {
      indexedSongs: group.songs.length,
      battles: group.songs.reduce((sum, song) => sum + song.battles, 0),
      wins: group.songs.reduce((sum, song) => sum + song.wins, 0),
      losses: group.songs.reduce((sum, song) => sum + song.losses, 0),
      totalVolumeSol: round(group.songs.reduce((sum, song) => sum + song.totalVolumeSol, 0)),
      summedSongLevelTraderSlots: group.songs.reduce((sum, song) => sum + song.totalUniqueTraders, 0),
      lastPlayed: group.songs.map((song) => song.lastPlayed).filter(Boolean).sort().at(-1) || null
    };
    quickBattle.winRate = quickBattle.battles ? round((quickBattle.wins / quickBattle.battles) * 100, 1) : 0;
    const sourceValid = group.songs.every((song) => song.sourceValid);
    const reconciled = sourceValid && group.songs.every((song) => song.battles === song.wins + song.losses)
      && quickBattle.battles === quickBattle.wins + quickBattle.losses;
    return {
      artistKey: group.artistKey,
      displayName,
      identity: {
        audiusHandle: group.handle,
        xHandle: main?.xHandle || null,
        wallet: main?.wallet || null,
        claimStatus: 'public-roster-observation; artist control not cryptographically proven'
      },
      eligibility: {
        canBirth: reconciled && group.songs.length > 0,
        reason: reconciled
          ? 'stable Audius identity and reconciled Quick Battle record'
          : sourceValid ? 'Quick Battle record does not reconcile' : 'Quick Battle record contains invalid numeric data'
      },
      quickBattle,
      mainEvent: main
        ? { status: 'matched-by-public-name', ...main }
        : { status: 'unobserved', record: null },
      profile: {
        imageUrl: main?.pfpUrl || group.songs.find((song) => song.artUrl)?.artUrl || null
      },
      songs: group.songs
    };
  });

  for (const [index, artist] of artistRows.entries()) {
    if (matchedMainArtists.has(index)) continue;
    const stablePart = artist.wallet ? `wallet:${key(artist.wallet)}` : `name:${safeSlug(artist.name)}`;
    roster.push({
      artistKey: `wavewarz:${stablePart}`,
      displayName: artist.name || 'Unresolved artist',
      identity: { audiusHandle: null, xHandle: artist.xHandle, wallet: artist.wallet, claimStatus: 'public-roster-observation; Audius identity unresolved' },
      eligibility: { canBirth: false, reason: 'no stable Audius song identity in the current song roster' },
      quickBattle: { indexedSongs: 0, battles: 0, wins: 0, losses: 0, winRate: 0, totalVolumeSol: 0, summedSongLevelTraderSlots: 0, lastPlayed: null },
      mainEvent: { status: 'observed', ...artist },
      profile: { imageUrl: artist.pfpUrl },
      songs: []
    });
  }

  roster.sort((a, b) => Number(b.eligibility.canBirth) - Number(a.eligibility.canBirth)
    || b.quickBattle.battles - a.quickBattle.battles
    || a.displayName.localeCompare(b.displayName));

  const payload = {
    schema: ROSTER_SCHEMA,
    checkedAt: retrievedAt,
    sources: [
      {
        uri: `${API_BASE}/leaderboards/artists?limit=500`,
        freshness: 'fresh',
        retrievedAt,
        apiUpdatedAt: text(artistsPayload?.updatedAt) || null
      },
      {
        uri: `${API_BASE}/leaderboards/songs?sort=volume&limit=500`,
        freshness: 'fresh',
        retrievedAt,
        apiUpdatedAt: text(songsPayload?.updatedAt) || null
      }
    ],
    counts: {
      artistLeaderboardRows: artistRows.length,
      songLeaderboardRows: songRows.length,
      rosterArtists: roster.length,
      birthEligible: roster.filter((artist) => artist.eligibility.canBirth).length,
      unresolvedSongs: unresolvedSongs.length
    },
    artists: roster,
    unresolvedSongs
  };
  return { ...payload, snapshotSha256: canonicalSha256(payload) };
}

async function fetchApiJson(fetchImpl, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ArtistOS-WavID-Incubator/1.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new WavIdIncubatorError(`WaveWarz returned HTTP ${response.status}`, 502);
    const raw = await response.arrayBuffer();
    if (raw.byteLength > MAX_RESPONSE_BYTES) throw new WavIdIncubatorError('WaveWarz response exceeded the local safety limit', 502);
    return JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch (error) {
    if (error instanceof WavIdIncubatorError) throw error;
    if (error.name === 'AbortError') throw new WavIdIncubatorError('WaveWarz roster request timed out', 504);
    throw new WavIdIncubatorError(`WaveWarz roster request failed: ${error.message}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeState(candidate) {
  const births = Array.isArray(candidate?.births) ? candidate.births.filter((birth) => birth && typeof birth === 'object') : [];
  return {
    schema: STATE_SCHEMA,
    updatedAt: text(candidate?.updatedAt) || null,
    lastRosterSync: candidate?.lastRosterSync && typeof candidate.lastRosterSync === 'object' ? candidate.lastRosterSync : null,
    births
  };
}

function publicBirth(birth) {
  return {
    id: birth.id,
    artistKey: birth.artistKey,
    displayName: birth.displayName,
    audiusHandle: birth.audiusHandle,
    status: birth.status,
    phase: birth.phase,
    bornAt: birth.bornAt,
    updatedAt: birth.updatedAt,
    source: birth.source,
    facts: birth.facts,
    note: birth.note || '',
    job: birth.job || null,
    incubation: birth.incubation || null,
    mood: birth.mood || null,
    current: birth.current !== false && !['retired', 'superseded'].includes(birth.status),
    lineage: birth.lineage || { revision: 1, predecessorBirthId: null, supersededByBirthId: null },
    boundaries: birth.boundaries
  };
}

function isCurrentBirth(birth) {
  return birth?.current !== false && !['retired', 'superseded'].includes(birth?.status);
}

function safeWorkspaceMediaPath(workspaceRoot, candidate) {
  const relative = text(candidate);
  if (!relative || path.isAbsolute(relative)) return null;
  const normalized = slash(relative);
  if (!normalized.startsWith('assets/') && !normalized.startsWith('content/')) return null;
  const resolved = path.resolve(workspaceRoot, normalized);
  return isWithin(workspaceRoot, resolved) ? normalized : null;
}

function deriveJobStatus({ manifest, receipt, poster, video, completion }) {
  if (/failed|quarantined/i.test(text(receipt?.status) || text(manifest?.status))) return 'quarantined';
  const receiptVerified = /technically.*verified|mechanically.*verified|\bpassed\b/i.test(text(receipt?.status));
  if (poster && video && receipt && (completion || receiptVerified)) return 'technically-verified';
  if (poster || video || receipt) return 'incubating';
  return manifest ? 'defined' : 'unknown';
}

export class WavIdIncubator {
  constructor({ workspaceRoot, productionSourceRoot = workspaceRoot, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
    if (!workspaceRoot) throw new Error('workspaceRoot is required');
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.productionSourceRoot = path.resolve(productionSourceRoot);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.statePath = path.join(this.workspaceRoot, 'catalog', 'operations', 'wavid-incubator-state.json');
    this.rosterRoot = path.join(this.workspaceRoot, 'catalog', 'wavewarz', 'api-snapshots', 'wavid-roster');
    this.latestRosterPath = path.join(this.rosterRoot, 'latest.json');
    this.birthRoot = path.join(this.workspaceRoot, 'catalog', 'operations', 'wavid-incubator', 'births');
    this.jobsRoot = path.join(this.workspaceRoot, 'tools', 'oxquan-remotion', 'jobs', 'quantum-quil', 'wavids', 'artist');
    this.syncing = false;
    this.activeRender = null;
  }

  async #readState() {
    return normalizeState(await readJson(this.statePath, DEFAULT_STATE));
  }

  async #saveState(state) {
    const normalized = normalizeState({ ...state, updatedAt: this.now().toISOString() });
    await writeJsonAtomic(this.statePath, normalized);
    return normalized;
  }

  async roster() {
    return readJson(this.latestRosterPath, null);
  }

  async syncRoster() {
    if (typeof this.fetchImpl !== 'function') throw new WavIdIncubatorError('Network fetch is unavailable in this runtime', 503);
    if (this.syncing) throw new WavIdIncubatorError('A roster sync is already running', 409);
    this.syncing = true;
    try {
      const state = await this.#readState();
      const now = this.now();
      const last = Date.parse(state.lastRosterSync?.checkedAt || '');
      if (Number.isFinite(last) && now.getTime() - last < MIN_SYNC_INTERVAL_MS) {
        throw new WavIdIncubatorError('Roster sync is rate-limited to once every 30 seconds', 429);
      }
      const retrievedAt = now.toISOString();
      const [artistsPayload, songsPayload] = await Promise.all([
        fetchApiJson(this.fetchImpl, `${API_BASE}/leaderboards/artists?limit=500`),
        fetchApiJson(this.fetchImpl, `${API_BASE}/leaderboards/songs?sort=volume&limit=500`)
      ]);
      const roster = buildRosterSnapshot({ artistsPayload, songsPayload, retrievedAt });
      const dateFolder = retrievedAt.slice(0, 10);
      const stamp = retrievedAt.replace(/[-:.]/g, '');
      const immutablePath = path.join(this.rosterRoot, dateFolder, `roster-${stamp}.json`);
      const [immutableWrite] = await Promise.all([
        writeJsonAtomic(immutablePath, roster),
        writeJsonAtomic(this.latestRosterPath, roster)
      ]);
      state.lastRosterSync = {
        checkedAt: retrievedAt,
        snapshotSha256: roster.snapshotSha256,
        path: slash(path.relative(this.workspaceRoot, immutablePath)),
        bytesSha256: immutableWrite.sha256,
        counts: roster.counts
      };
      await this.#saveState(state);
      return roster;
    } finally {
      this.syncing = false;
    }
  }

  async #assertRenderLaneAvailable() {
    if (this.activeRender && this.activeRender.child?.exitCode == null) {
      throw new WavIdIncubatorError(`Another WavID render is active: ${this.activeRender.id}`, 409);
    }
    const script = path.join(this.workspaceRoot, 'tools', 'oxquan-remotion', 'scripts', 'render-wavid-production.mjs');
    if (!await exists(script)) throw new WavIdIncubatorError('The local WavID production renderer is unavailable', 503);
    const productionLock = await readJson(path.join(this.jobsRoot, 'production-render.lock'), null);
    if (Number.isInteger(productionLock?.pid) && productionLock.pid > 0) {
      try {
        process.kill(productionLock.pid, 0);
        throw new WavIdIncubatorError(`Another WavID render owns the production lock: ${productionLock.jobId || 'unknown'}`, 409);
      } catch (error) {
        if (error instanceof WavIdIncubatorError) throw error;
      }
    }
    return script;
  }

  async #readTrustedBirthSource(birth) {
    const sourceCandidate = text(birth?.source?.path);
    const sourcePath = sourceCandidate && !path.isAbsolute(sourceCandidate)
      ? path.resolve(this.workspaceRoot, sourceCandidate)
      : null;
    if (!sourcePath || !isWithin(this.birthRoot, sourcePath)) {
      throw new WavIdIncubatorError('The current WavID source path is not trusted', 409);
    }
    const source = await readJson(sourcePath, null);
    if (!source || canonicalSha256(source) !== text(birth?.source?.canonicalSha256).toUpperCase()) {
      throw new WavIdIncubatorError('The current WavID source capsule failed its hash check', 409);
    }
    return source;
  }

  #restoreRevisionPredecessor(state, revision, at, reason = '') {
    if (!revision?.lineage?.predecessorBirthId) return;
    revision.current = false;
    revision.status = 'failed';
    revision.phase = 'update-failed';
    revision.updatedAt = at;
    revision.note = reason ? `Update failed: ${text(reason).slice(0, 240)}` : revision.note || '';
    const predecessor = state.births.find((birth) => birth.id === revision.lineage.predecessorBirthId);
    if (!predecessor) return;
    const prior = predecessor.lifecycleBeforeSupersession;
    predecessor.current = true;
    predecessor.status = prior?.status || 'incubating';
    predecessor.phase = prior?.phase || 'private-review';
    predecessor.updatedAt = at;
    predecessor.lineage = { ...(predecessor.lineage || {}), supersededByBirthId: null };
    delete predecessor.lifecycleBeforeSupersession;
  }

  async birth(options = {}) {
    const { artistKey, confirmed = false, requireFresh = true } = options;
    const supersedeBirthId = options[REVISION_AUTHORITY] === true ? text(options.supersedeBirthId) : '';
    if (!confirmed) throw new WavIdIncubatorError('Explicit private-birth confirmation is required', 400);
    let roster = await this.roster();
    const rosterAge = this.now().getTime() - Date.parse(roster?.checkedAt || '');
    if (requireFresh && (!roster || !Number.isFinite(rosterAge) || rosterAge > 300_000)) {
      roster = await this.syncRoster();
    }
    if (!roster) throw new WavIdIncubatorError('Sync the WaveWarz roster before birthing a WavID', 409);
    const artist = roster.artists.find((entry) => entry.artistKey === text(artistKey));
    if (!artist) throw new WavIdIncubatorError('Artist was not found in the current roster snapshot', 404);
    if (!artist.eligibility?.canBirth) throw new WavIdIncubatorError(artist.eligibility?.reason || 'Artist is not eligible for birth', 409);

    const state = await this.#readState();
    const activeBirth = state.births.find((birth) => birth.artistKey === artist.artistKey && isCurrentBirth(birth));
    if (activeBirth && activeBirth.id !== supersedeBirthId) return { created: false, birth: publicBirth(activeBirth) };
    if (supersedeBirthId && activeBirth?.id !== supersedeBirthId) {
      throw new WavIdIncubatorError('The WavID revision predecessor is no longer current', 409);
    }
    const revision = supersedeBirthId
      ? Math.max(1, ...state.births.filter((birth) => birth.artistKey === artist.artistKey).map((birth) => integer(birth.lineage?.revision) || 1)) + 1
      : 1;

    const artistSource = {
      schema: 'artistos-wavid-birth-source/0.1.0',
      rosterSnapshotSha256: roster.snapshotSha256,
      rosterCheckedAt: roster.checkedAt,
      sources: roster.sources,
      artist
    };
    const artistSourceSha256 = canonicalSha256(artistSource);
    const slug = safeSlug(artist.identity.audiusHandle || artist.displayName);
    const baseId = `wavid-${slug}-${artistSourceSha256.slice(0, 12).toLowerCase()}`;
    let id = baseId;
    const existing = state.births.find((birth) => birth.id === baseId);
    let birthAttempt = 1;
    if (existing?.status === 'retired') {
      birthAttempt = state.births.filter((birth) => birth.id === baseId || birth.id.startsWith(`${baseId}-attempt-`)).length + 1;
      id = `${baseId}-attempt-${birthAttempt}`;
    } else if (existing) {
      return { created: false, birth: publicBirth(existing) };
    }

    const bornAt = this.now().toISOString();
    const relativeRoot = slash(path.join('catalog', 'operations', 'wavid-incubator', 'births', id));
    const sourcePath = `${relativeRoot}/source.json`;
    const recordPath = `${relativeRoot}/birth-record.json`;
    const birthPayload = {
      schema: BIRTH_SCHEMA,
      id,
      root: `quantum-quil:wavid:artist:${key(artist.identity.audiusHandle)}:birth:${artistSourceSha256.slice(0, 16).toLowerCase()}:attempt:${birthAttempt}`,
      objectType: 'artist-wavid',
      publicProductName: 'Artist WavID',
      status: 'source-bound-incubating',
      phase: 'source-bound',
      birthAttempt,
      bornAt,
      lineage: {
        revision,
        predecessorBirthId: supersedeBirthId || null,
        immutablePriorAssets: true
      },
      identity: {
        artistKey: artist.artistKey,
        displayName: artist.displayName,
        audiusHandle: artist.identity.audiusHandle,
        xHandle: artist.identity.xHandle,
        identitySeed: `quantum-quil:wavid:artist:v1:${artist.artistKey}`,
        claimStatus: artist.identity.claimStatus
      },
      source: {
        path: sourcePath,
        canonicalSha256: artistSourceSha256,
        rosterSnapshotSha256: roster.snapshotSha256,
        checkedAt: roster.checkedAt,
        freshness: roster.sources.every((source) => source.freshness === 'fresh') ? 'fresh-at-birth' : 'mixed-at-birth'
      },
      facts: {
        quickBattle: artist.quickBattle,
        mainEvent: artist.mainEvent,
        songCount: artist.songs.length
      },
      incubation: {
        sourceBound: true,
        identitySeeded: true,
        anatomyGenerated: true,
        posterRendered: false,
        loopRendered: false,
        technicalQaPassed: false,
        artistApproved: false
      },
      boundaries: {
        privateReviewOnly: true,
        artistControlProven: false,
        canon: false,
        publication: false,
        mint: false,
        utility: false,
        approvalInheritance: false
      },
      interpretation: {
        volume: 'Quick Battle trading volume is not artist income, direct support, donation, rarity, rank, or value.',
        traders: 'Song-level trader slots are not deduplicated people or supporters.',
        mainEvent: 'Main Event and Quick Battle records remain separate.'
      }
    };
    const provisionalBirthRecord = { ...birthPayload, birthSha256: canonicalSha256(birthPayload) };
    const definition = buildWavIdProductionDefinition({ birthRecord: provisionalBirthRecord, source: artistSource });
    const rendererSourcePaths = [
      'tools/oxquan-remotion/src/compositions/quantum-quil-generative-organism.tsx',
      'tools/oxquan-remotion/src/compositions/quantum-quil.tsx',
      'tools/oxquan-remotion/src/wavid-production-root.tsx',
      'tools/oxquan-remotion/src/wavid-production-entry.ts',
      'tools/oxquan-remotion/remotion.config.ts',
      'tools/oxquan-remotion/package.json',
      'tools/oxquan-remotion/package-lock.json',
      'tools/oxquan-remotion/scripts/render-wavid-production.mjs'
    ];
    const pipelineSourcePaths = [
      'tools/command-center/wavid-production-definition.mjs',
      'tools/command-center/wavid-incubator.mjs'
    ];
    const sourceRecord = async (relativePath) => {
      const bytes = await readFile(path.resolve(this.productionSourceRoot, relativePath));
      return { path: relativePath, sha256: bytesSha256(bytes), bytes: bytes.length };
    };
    definition.manifest.renderer.sourceFiles = await Promise.all(rendererSourcePaths.map(sourceRecord));
    definition.manifest.renderer.sourceClosureSha256 = canonicalSha256(definition.manifest.renderer.sourceFiles);
    definition.manifest.pipeline = {
      sourceFiles: await Promise.all(pipelineSourcePaths.map(sourceRecord))
    };
    definition.manifest.pipeline.sourceClosureSha256 = canonicalSha256(definition.manifest.pipeline.sourceFiles);
    delete definition.manifest.manifestSha256;
    definition.manifest.manifestSha256 = canonicalSha256(definition.manifest);
    const finalBirthPayload = {
      ...provisionalBirthRecord,
      phase: 'defined',
      status: 'defined-private-production-birth',
      production: {
        jobId: definition.jobId,
        jobRoot: definition.paths.jobRoot,
        manifestPath: definition.paths.manifest,
        mapping: definition.manifest.mapping,
        renderer: definition.manifest.renderer,
        approvalInheritance: false
      }
    };
    delete finalBirthPayload.birthSha256;
    const birthRecord = { ...finalBirthPayload, birthSha256: canonicalSha256(finalBirthPayload) };
    const absoluteRoot = path.resolve(this.workspaceRoot, relativeRoot);
    if (!isWithin(this.birthRoot, absoluteRoot)) throw new WavIdIncubatorError('Birth path escaped the incubator root', 400);
    await mkdir(absoluteRoot, { recursive: true });
    const jobRoot = path.resolve(this.workspaceRoot, definition.paths.jobRoot);
    if (!isWithin(this.jobsRoot, jobRoot)) throw new WavIdIncubatorError('Production job path escaped the WavID jobs root', 400);
    await writeJsonSetOnce([
      { path: path.join(absoluteRoot, 'source.json'), value: artistSource },
      { path: path.join(absoluteRoot, 'birth-record.json'), value: birthRecord },
      { path: path.resolve(this.workspaceRoot, definition.paths.props), value: definition.props },
      { path: path.resolve(this.workspaceRoot, definition.paths.genome), value: definition.genome },
      { path: path.resolve(this.workspaceRoot, definition.paths.sourceReference), value: definition.sourceReference },
      { path: path.resolve(this.workspaceRoot, definition.paths.metadata), value: definition.metadata },
      { path: path.resolve(this.workspaceRoot, definition.paths.manifest), value: definition.manifest }
    ]);

    const stateBirth = {
      id,
      artistKey: artist.artistKey,
      displayName: artist.displayName,
      audiusHandle: artist.identity.audiusHandle,
      status: supersedeBirthId ? 'revision-defined' : 'incubating',
      phase: 'defined',
      current: !supersedeBirthId,
      bornAt,
      updatedAt: bornAt,
      source: birthRecord.source,
      facts: birthRecord.facts,
      recordPath,
      note: '',
      job: {
        id: definition.jobId,
        root: definition.paths.jobRoot,
        manifestPath: definition.paths.manifest
      },
      incubation: birthRecord.incubation,
      lineage: {
        revision,
        predecessorBirthId: supersedeBirthId || null,
        supersededByBirthId: null,
        immutablePriorAssets: true
      },
      boundaries: birthRecord.boundaries
    };
    state.births.unshift(stateBirth);
    await this.#saveState(state);
    return { created: true, birth: publicBirth(stateBirth) };
  }

  async refreshBirth({ id, confirmed = false } = {}) {
    if (!confirmed) throw new WavIdIncubatorError('Explicit WavID update confirmation is required', 400);
    await this.#assertRenderLaneAvailable();
    const before = await this.#readState();
    const predecessor = before.births.find((birth) => birth.id === text(id));
    if (!predecessor) throw new WavIdIncubatorError('WavID birth was not found', 404);
    if (!isCurrentBirth(predecessor)) throw new WavIdIncubatorError('Only the current WavID revision can be updated', 409);
    if (predecessor.status === 'paused') throw new WavIdIncubatorError('Resume this WavID before updating it', 409);
    const previousSource = await this.#readTrustedBirthSource(predecessor);

    const roster = await this.syncRoster();
    const artist = roster.artists.find((entry) => entry.artistKey === predecessor.artistKey);
    if (!artist) throw new WavIdIncubatorError('The artist is no longer present in the current WaveWarz roster', 404);
    if (!artist.eligibility?.canBirth) throw new WavIdIncubatorError(artist.eligibility?.reason || 'The refreshed artist record is not eligible', 409);
    if (canonicalSha256(previousSource.artist) === canonicalSha256(artist)) {
      return {
        updated: false,
        reason: 'source-unchanged',
        checkedAt: roster.checkedAt,
        birth: publicBirth(predecessor)
      };
    }

    const revision = await this.birth({
      artistKey: predecessor.artistKey,
      confirmed: true,
      requireFresh: false,
      supersedeBirthId: predecessor.id,
      [REVISION_AUTHORITY]: true
    });
    const revisionId = revision.birth.id;
    try {
      const launched = await this.startRender({
        id: revisionId,
        confirmed: true,
        activateRevisionOf: predecessor.id,
        [REVISION_AUTHORITY]: true
      });
      return {
        updated: true,
        checkedAt: roster.checkedAt,
        predecessorBirthId: predecessor.id,
        birth: launched
      };
    } catch (error) {
      const state = await this.#readState();
      const failedRevision = state.births.find((birth) => birth.id === revisionId);
      if (failedRevision) {
        this.#restoreRevisionPredecessor(state, failedRevision, this.now().toISOString(), error.message);
        await this.#saveState(state);
      }
      throw error;
    }
  }

  async updateBirth({ id, action, note = '' } = {}) {
    const state = await this.#readState();
    const birth = state.births.find((entry) => entry.id === text(id));
    if (!birth) throw new WavIdIncubatorError('Birth record was not found', 404);
    if (action === 'pause' && this.activeRender?.id === birth.id && this.activeRender.child?.exitCode == null) {
      throw new WavIdIncubatorError('An active render cannot be interrupted between transactional phases; pause after it reaches private review', 409);
    }
    const actions = {
      pause: { status: 'paused', phase: birth.phase },
      resume: { status: 'incubating', phase: birth.phase },
      retire: { status: 'retired', phase: 'closed' }
    };
    if (!actions[action]) throw new WavIdIncubatorError('Unsupported incubator action', 400);
    Object.assign(birth, actions[action], { note: text(note) || birth.note || '', updatedAt: this.now().toISOString() });
    await this.#saveState(state);
    return publicBirth(birth);
  }

  async startRender(options = {}) {
    const { id, confirmed = false } = options;
    const activateRevisionOf = options[REVISION_AUTHORITY] === true ? text(options.activateRevisionOf) : '';
    if (!confirmed) throw new WavIdIncubatorError('Explicit local-render confirmation is required', 400);
    const state = await this.#readState();
    const birth = state.births.find((entry) => entry.id === text(id));
    if (!birth) throw new WavIdIncubatorError('Birth record was not found', 404);
    if (birth.status === 'retired') throw new WavIdIncubatorError('Retired births cannot render', 409);
    if (birth.status === 'paused') throw new WavIdIncubatorError('Resume this birth before rendering', 409);
    if (!birth.job?.id) throw new WavIdIncubatorError('This birth has no production definition', 409);
    const script = await this.#assertRenderLaneAvailable();
    const predecessor = activateRevisionOf
      ? state.births.find((entry) => entry.id === activateRevisionOf)
      : null;
    if (activateRevisionOf && (!predecessor || !isCurrentBirth(predecessor) || birth.lineage?.predecessorBirthId !== predecessor.id)) {
      throw new WavIdIncubatorError('The WavID revision predecessor changed before rendering began', 409);
    }
    const child = spawn(process.execPath, [script, '--job-id', birth.job.id], {
      cwd: path.join(this.workspaceRoot, 'tools', 'oxquan-remotion'),
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    try {
      await new Promise((resolveSpawn, rejectSpawn) => {
        child.once('spawn', resolveSpawn);
        child.once('error', rejectSpawn);
      });
    } catch (error) {
      throw new WavIdIncubatorError(`The local WavID renderer could not start: ${error.message}`, 503);
    }
    child.unref();
    birth.status = 'incubating';
    birth.phase = 'render-starting';
    birth.current = true;
    birth.updatedAt = this.now().toISOString();
    birth.render = { pid: child.pid, startedAt: birth.updatedAt, status: 'running' };
    if (predecessor) {
      predecessor.lifecycleBeforeSupersession = { status: predecessor.status, phase: predecessor.phase };
      predecessor.current = false;
      predecessor.status = 'superseded';
      predecessor.phase = 'closed';
      predecessor.updatedAt = birth.updatedAt;
      predecessor.lineage = { ...(predecessor.lineage || {}), revision: integer(predecessor.lineage?.revision) || 1, supersededByBirthId: birth.id };
    }
    await this.#saveState(state);
    this.activeRender = { id: birth.id, child };
    child.once('exit', async (code, signal) => {
      try {
        const current = await this.#readState();
        const record = current.births.find((entry) => entry.id === birth.id);
        if (record) {
          record.render = { ...record.render, finishedAt: this.now().toISOString(), status: code === 0 ? 'completed' : 'failed', code, signal };
          record.phase = code === 0 ? 'private-review' : 'render-failed';
          record.status = code === 0 ? 'incubating' : 'failed';
          record.updatedAt = record.render.finishedAt;
          if (code !== 0) this.#restoreRevisionPredecessor(current, record, record.updatedAt, `renderer exited with code ${code}${signal ? ` (${signal})` : ''}`);
          await this.#saveState(current);
        }
      } catch {}
      if (this.activeRender?.id === birth.id) this.activeRender = null;
    });
    return publicBirth(birth);
  }

  async #observeJobs() {
    let directories;
    try {
      directories = await readdir(this.jobsRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const jobs = await Promise.all(directories.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const root = path.join(this.jobsRoot, entry.name);
      const [manifest, receipt, completion, runState, genome, sourceReference] = await Promise.all([
        readJson(path.join(root, 'manifest.json'), null),
        readJson(path.join(root, 'render-receipt.json'), null),
        exists(path.join(root, 'production-state', 'commit-complete.json')),
        readJson(path.join(root, 'production-state', 'run-state.json'), null),
        readJson(path.join(root, 'genome.json'), null),
        readJson(path.join(root, 'source-reference.json'), null)
      ]);
      if (!manifest) return null;
      const propsCandidate = text(manifest?.files?.props?.path);
      const propsPath = propsCandidate && !path.isAbsolute(propsCandidate)
        ? path.resolve(this.workspaceRoot, propsCandidate)
        : null;
      let props = null;
      let propsBytes = null;
      if (propsPath && isWithin(root, propsPath)) {
        try {
          propsBytes = await readFile(propsPath);
          props = JSON.parse(propsBytes.toString('utf8'));
        } catch {}
      }
      const genomeBound = Boolean(genome
        && canonicalSha256(genome) === text(manifest?.files?.genome?.canonicalSha256).toUpperCase());
      const sourceReferenceBound = Boolean(sourceReference
        && canonicalSha256(sourceReference) === text(manifest?.files?.sourceReference?.canonicalSha256).toUpperCase());
      const sourceCandidate = sourceReferenceBound ? text(sourceReference?.source?.path) : '';
      const sourcePath = sourceCandidate && !path.isAbsolute(sourceCandidate)
        ? path.resolve(this.workspaceRoot, sourceCandidate)
        : null;
      const source = sourcePath && isWithin(this.birthRoot, sourcePath)
        ? await readJson(sourcePath, null)
        : null;
      const sourceBound = Boolean(source
        && canonicalSha256(source) === text(sourceReference?.source?.canonicalSha256).toUpperCase());
      const propsBound = Boolean(props
        && canonicalSha256(props) === text(manifest?.files?.props?.canonicalSha256).toUpperCase()
        && genomeBound
        && text(props?.anatomy?.fingerprint).toUpperCase() === text(genome?.checkpoint?.materialSha256).toUpperCase());
      const projectedAnatomy = propsBound && propsBytes
        ? projectMaterialAnatomy(props, {
            fingerprints: {
              propsSha256: bytesSha256(propsBytes),
              materialSha256: text(genome?.checkpoint?.materialSha256).toUpperCase()
            }
          }, propsBytes)
        : { available: false, reason: 'untrusted-props', family: 'unresolved', counts: null, map: null };
      const anatomy = sourceBound && sourceReferenceBound
        ? projectWavIdAnatomyEncoding({ anatomy: projectedAnatomy, genome, props, source, sourceReference }) || projectedAnatomy
        : projectedAnatomy;
      const posterPath = safeWorkspaceMediaPath(this.workspaceRoot, receipt?.artifacts?.poster?.path || manifest?.files?.poster?.path);
      const videoPath = safeWorkspaceMediaPath(this.workspaceRoot, receipt?.artifacts?.video?.path || manifest?.files?.video?.path);
      const [poster, video] = await Promise.all([
        posterPath ? exists(path.resolve(this.workspaceRoot, posterPath)) : false,
        videoPath ? exists(path.resolve(this.workspaceRoot, videoPath)) : false
      ]);
      return {
        id: `job:${entry.name}`,
        title: text(manifest.title) || entry.name,
        objectType: text(manifest.objectType) || 'artist-wavid',
        status: runState?.status === 'failed' ? 'quarantined' : runState?.status === 'running' ? 'incubating' : deriveJobStatus({ manifest, receipt, poster, video, completion }),
        phase: runState?.phase || (poster && video ? 'private-review' : receipt ? 'technical-review' : 'definition'),
        schema: manifest.schema,
        receiptStatus: text(receipt?.status) || null,
        mood: props ? {
          accent: safeHex(props.accent),
          secondary: safeHex(props.secondary),
          highlight: safeHex(props.highlight),
          background: safeHex(props.background)
        } : null,
        anatomy,
        artifacts: {
          poster: { available: poster, path: posterPath || null, url: poster ? `/workspace-file?path=${encodeURIComponent(posterPath)}` : null },
          video: { available: video, path: videoPath || null, url: video ? `/workspace-file?path=${encodeURIComponent(videoPath)}` : null }
        },
        approval: {
          exactArtifact: manifest?.approval?.exactArtifact === true,
          canon: manifest?.approval?.canon === true,
          publication: manifest?.approval?.publication === true,
          mint: manifest?.approval?.mint === true
        }
      };
    }));
    return jobs.filter(Boolean);
  }

  async observe() {
    const [state, roster, jobs] = await Promise.all([this.#readState(), this.roster(), this.#observeJobs()]);
    let recoveredFailedRevision = false;
    for (const revision of state.births.filter((birth) => birth.current !== false && birth.lineage?.predecessorBirthId)) {
      const job = jobs.find((entry) => entry.id === `job:${revision.job?.id}`);
      if (job?.status !== 'quarantined') continue;
      this.#restoreRevisionPredecessor(state, revision, this.now().toISOString(), 'renderer reported a terminal failure');
      recoveredFailedRevision = true;
    }
    if (recoveredFailedRevision) await this.#saveState(state);
    const births = state.births.map((birth) => {
      const job = jobs.find((entry) => entry.id === `job:${birth.job?.id}`);
      if (!job) return publicBirth(birth);
      return publicBirth({
        ...birth,
        phase: job.phase,
        status: job.status === 'quarantined' ? 'failed' : birth.status,
        incubation: {
          ...(birth.incubation || {}),
          posterRendered: job.artifacts.poster.available,
          loopRendered: job.artifacts.video.available,
          technicalQaPassed: job.status === 'technically-verified'
        },
        mood: job.mood
      });
    });
    const counts = {
      roster: roster?.counts?.rosterArtists || 0,
      eligible: roster?.counts?.birthEligible || 0,
      incubating: births.filter((birth) => birth.status === 'incubating').length,
      paused: births.filter((birth) => birth.status === 'paused').length,
      retired: births.filter((birth) => birth.status === 'retired').length,
      existingJobs: jobs.length,
      technicallyVerified: jobs.filter((job) => job.status === 'technically-verified').length
    };
    return {
      schema: 'artistos-wavid-incubator/1.0',
      mode: 'LOCAL_OPERATIONS_EXPLICIT_NETWORK',
      generatedAt: this.now().toISOString(),
      roster: roster
        ? {
            available: true,
            checkedAt: roster.checkedAt,
            freshness: roster.sources.every((source) => source.freshness === 'fresh') ? 'fresh-at-capture' : 'mixed',
            snapshotSha256: roster.snapshotSha256,
            sources: roster.sources,
            counts: roster.counts,
            artists: roster.artists.map((artist) => ({
              artistKey: artist.artistKey,
              displayName: artist.displayName,
              identity: artist.identity,
              eligibility: artist.eligibility,
              quickBattle: artist.quickBattle,
              mainEvent: artist.mainEvent,
              profile: artist.profile,
              birthId: births.find((birth) => birth.artistKey === artist.artistKey && birth.current !== false && !['retired', 'superseded'].includes(birth.status))?.id || null
            }))
          }
        : { available: false, checkedAt: null, freshness: 'unavailable', snapshotSha256: null, sources: [], counts: {}, artists: [] },
      births,
      jobs,
      counts,
      boundaries: {
        networkOnExplicitSyncOnly: true,
        aiRequired: false,
        tokenRequired: false,
        privateReviewOnly: true,
        renderControlImplemented: true,
        refreshAndRenderImplemented: true,
        immutableRevisionLineage: true,
        publishControlImplemented: false,
        mintControlImplemented: false
      }
    };
  }
}

export function createWavIdIncubator(options) {
  return new WavIdIncubator(options);
}
