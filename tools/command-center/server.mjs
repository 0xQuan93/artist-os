import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPostizPayload, PostizClient, PostizError, postizConfig } from './postiz-adapter.mjs';
import { createAccessControl, AccessControlError } from './access-control.mjs';
import { createAssetForge, AssetForgeError } from './asset-forge.mjs';
import { createContentGallery } from './content-gallery.mjs';
import { createCreativeToolSurface } from './creative-tools.mjs';
import { createMusicMaker, MusicMakerError } from './music-maker.mjs';
import { createQuilLiveGateway, QuilLiveError } from './quil-live.mjs';
import { createWavFormsNurseryObserver } from './wavforms-nursery.mjs';
import { createWavIdIncubator, WavIdIncubatorError } from './wavid-incubator.mjs';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.resolve(APP_ROOT, '..', '..');
export const WORKSPACE_ROOT = path.resolve(
  String(process.env.ARTISTOS_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT)
);
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const STATE_PATH = path.join(WORKSPACE_ROOT, 'catalog', 'operations', 'command-center-state.json');
const JOURNEY_PATH = path.join(WORKSPACE_ROOT, 'assets', 'campaigns', 'music', 'release-journey.json');
const REGISTRY_PATH = path.join(WORKSPACE_ROOT, 'artist-profile', 'asset-registry.md');
const SNAPSHOT_ROOT = path.join(WORKSPACE_ROOT, 'catalog', 'wavewarz', 'api-snapshots');
const MUSIC_REVIEW_PATH = path.join(
  WORKSPACE_ROOT,
  'catalog',
  'audio',
  'music-review.json'
);
const WAVFORMS_PLAN_PATH = path.join(
  WORKSPACE_ROOT,
  'tools',
  'artistos-remotion',
  'jobs',
  'quantum-quil',
  'wavforms-genesis-555-v1',
  'collection-plan.json'
);
const QUIL_LIVE_CONTRACT_PATH = path.join(APP_ROOT, 'contracts', 'quil-live-observation.schema.json');
const wavformsNursery = createWavFormsNurseryObserver({ workspaceRoot: WORKSPACE_ROOT });
const wavidIncubator = createWavIdIncubator({ workspaceRoot: WORKSPACE_ROOT });
const quilLive = createQuilLiveGateway({ workspaceRoot: WORKSPACE_ROOT });
const creativeTools = createCreativeToolSurface({ workspaceRoot: WORKSPACE_ROOT });
const assetForge = createAssetForge({ workspaceRoot: WORKSPACE_ROOT });
const contentGallery = createContentGallery({ workspaceRoot: WORKSPACE_ROOT });

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.flac', 'audio/flac'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.aac', 'audio/aac']
]);

const ALLOWED_MEDIA_ROOTS = [
  path.join(WORKSPACE_ROOT, 'assets'),
  path.join(WORKSPACE_ROOT, 'content'),
  path.join(WORKSPACE_ROOT, 'catalog', 'audio')
];
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.aac', '.avif', '.flac', '.gif', '.jpeg', '.jpg', '.m4a', '.mov', '.mp3',
  '.mp4', '.ogg', '.png', '.svg', '.wav', '.webm', '.webp'
]);
const DEFAULT_STATE = {
  schemaVersion: 2,
  updatedAt: null,
  decisionOverrides: {},
  approvals: {},
  musicReviews: {},
  contentPipeline: [],
  metrics: [],
  activity: []
};
const DEFAULT_MUSIC_REVIEW = {
  title: 'Local Music Lab',
  reviewMode: 'not-configured',
  introTitle: 'MUSIC LAB // no review pack configured',
  introText: 'Add a local music-review manifest when a record is ready for artist review.',
  approvalMeaning: 'No music decision is pending.',
  assemblyStatus: 'not configured',
  assemblyReason: 'The local core does not require an audio or AI production system.',
  scoreDimensions: [],
  minimumApprovalScore: 4,
  items: []
};

function cleanCell(value) {
  return value.replaceAll('`', '').trim();
}

function assetId(assetPath) {
  return createHash('sha1').update(assetPath).digest('hex').slice(0, 12);
}

export function parseAssetRegistry(markdown) {
  const assets = [];
  let section = '';
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      continue;
    }
    if (!['Event Campaign Review Graphics', 'Motion Drafts'].includes(section)) continue;
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const cells = line.slice(1, -1).split('|').map(cleanCell);
    if (cells[0] === 'Asset') continue;

    const isGraphic = section === 'Event Campaign Review Graphics';
    const assetPath = isGraphic ? cells[4] : cells[4];
    if (!assetPath || !assetPath.startsWith(isGraphic ? 'assets/' : 'content/')) continue;
    const sourceStatus = isGraphic ? 'Review graphic' : cells[1];
    const normalized = sourceStatus.toLowerCase();
    const inferredStatus = normalized.includes('approved')
      ? 'approved'
      : normalized.includes('superseded')
        ? 'superseded'
        : 'pending';

    assets.push({
      id: assetId(assetPath),
      name: cells[0],
      campaign: isGraphic ? cells[1] : 'Motion',
      sourceStatus,
      role: isGraphic ? cells[2] : cells[2],
      specs: isGraphic ? cells[3] : cells[3],
      path: assetPath,
      mediaType: isGraphic ? 'image' : 'video',
      inferredStatus
    });
  }
  return assets;
}

function isWithin(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveWorkspaceMedia(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Invalid workspace path');
  const normalized = relativePath.replaceAll('\\', '/');
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);
  if (!isWithin(WORKSPACE_ROOT, resolved)) throw new Error('Path traversal rejected');
  if (!ALLOWED_MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error('Invalid workspace media type');
  }
  if (!ALLOWED_MEDIA_ROOTS.some((root) => isWithin(root, resolved))) {
    throw new Error('Path is outside media roots');
  }
  return resolved;
}

function sanitizeMusicCandidate(candidate) {
  const musicalAnalysis = candidate?.musicalAnalysis;
  return {
    label: candidate?.label,
    audioPath: candidate?.audioPath,
    ...(musicalAnalysis && typeof musicalAnalysis === 'object'
      ? {
          musicalAnalysis: {
            overallPassed: musicalAnalysis.overallPassed,
            artistResolutionRequired: Array.isArray(musicalAnalysis.artistResolutionRequired)
              ? musicalAnalysis.artistResolutionRequired
              : []
          }
        }
      : {})
  };
}

function sanitizeMusicReview(musicReview, musicItems) {
  const {
    architectureBinding: _architectureBinding,
    rawAceExclusion,
    reviewPack,
    sourceReviewSheet: _sourceReviewSheet,
    ...publicReview
  } = musicReview;
  const safeReviewPack = reviewPack && typeof reviewPack === 'object'
    ? {
        activeRmsTargetDbfs: reviewPack.activeRmsTargetDbfs,
        gainMatched: reviewPack.gainMatched,
        mastered: reviewPack.mastered
      }
    : undefined;
  return {
    ...publicReview,
    ...(safeReviewPack ? { reviewPack: safeReviewPack } : {}),
    rawAceExcluded: rawAceExclusion?.excluded === true,
    items: musicItems.map((item) => ({
      ...item,
      ...(Array.isArray(item.candidates)
        ? { candidates: item.candidates.map(sanitizeMusicCandidate) }
        : {})
    }))
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

async function readText(filePath, fallback = '') {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function normalizeState(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('State must be an object');
  }
  const legacyQueue = Array.isArray(candidate.publishingQueue)
    ? candidate.publishingQueue.map((item) => ({
      ...item,
      status: item.status === 'published'
        ? 'posted'
        : ['scheduled', 'submitted'].includes(item.status)
          ? 'ready'
          : item.status,
      targetDate: item.targetDate || item.scheduledAt || null
    }))
    : [];
  const currentQueue = Array.isArray(candidate.contentPipeline)
    ? candidate.contentPipeline
    : [];
  const currentIds = new Set(currentQueue.map((item) => item.id));
  const state = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    decisionOverrides: candidate.decisionOverrides && typeof candidate.decisionOverrides === 'object'
      ? candidate.decisionOverrides
      : {},
    approvals: candidate.approvals && typeof candidate.approvals === 'object'
      ? candidate.approvals
      : {},
    musicReviews: candidate.musicReviews && typeof candidate.musicReviews === 'object'
      ? candidate.musicReviews
      : {},
    contentPipeline: [
      ...currentQueue,
      ...legacyQueue.filter((item) => !currentIds.has(item.id))
    ],
    metrics: Array.isArray(candidate.metrics) ? candidate.metrics : [],
    activity: Array.isArray(candidate.activity) ? candidate.activity.slice(0, 100) : []
  };
  const encoded = JSON.stringify(state);
  if (Buffer.byteLength(encoded) > 1_000_000) throw new Error('State exceeds 1 MB');
  return state;
}

async function saveState(candidate) {
  const state = normalizeState(candidate);
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  const temporary = `${STATE_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, STATE_PATH);
  return state;
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(fullPath);
      const details = await stat(fullPath);
      files.push({ fullPath, mtime: details.mtime.toISOString() });
    }));
  }
  await visit(root);
  return files;
}

async function fileCount(root, extensions) {
  const files = await walkFiles(root);
  return files.filter((entry) => extensions.has(path.extname(entry.fullPath).toLowerCase())).length;
}

function mergeDecisions(decisions, overrides) {
  return Object.entries(decisions).map(([key, sourceValue]) => {
    const override = overrides[key];
    const effectiveValue = override ?? sourceValue;
    const resolved = effectiveValue !== null && effectiveValue !== '' && effectiveValue !== undefined;
    return { key, sourceValue, override: override ?? null, effectiveValue, resolved };
  });
}

async function latestSnapshot() {
  const snapshots = (await walkFiles(SNAPSHOT_ROOT)).filter((entry) => entry.fullPath.endsWith('.json'));
  snapshots.sort((a, b) => b.mtime.localeCompare(a.mtime));
  if (!snapshots[0]) return null;
  let featuredArtist = null;
  for (const snapshot of snapshots) {
    try {
      const payload = JSON.parse(await readFile(snapshot.fullPath, 'utf8'));
      const totals = payload?.quickBattleTotals;
      if (!payload?.identity?.artistName || !totals) continue;
      featuredArtist = {
        name: payload.identity.artistName,
        record: `${totals.wins}-${totals.losses}`,
        wins: totals.wins,
        losses: totals.losses,
        winRate: totals.winRate,
        indexedSongs: totals.indexedSongs,
        battles: totals.battles,
        totalVolumeSol: totals.totalVolumeSol,
        checkedAt: payload.checkedAt || snapshot.mtime,
        freshness: (payload.sources || []).every((source) => source.freshness === 'fresh')
          ? 'fresh'
          : 'mixed',
        path: path.relative(WORKSPACE_ROOT, snapshot.fullPath).replaceAll('\\', '/')
      };
      break;
    } catch {
      // Ignore unrelated or malformed historical captures and keep looking.
    }
  }
  return {
    path: path.relative(WORKSPACE_ROOT, snapshots[0].fullPath).replaceAll('\\', '/'),
    updatedAt: snapshots[0].mtime,
    count: snapshots.length,
    featuredArtist
  };
}

async function buildDashboard() {
  const [journey, registry, musicReview, state, snapshot, approvedMasters, reviewVideos] = await Promise.all([
    readJson(JOURNEY_PATH, { chapters: [], decisionsNeeded: {} }),
    readText(REGISTRY_PATH),
    readJson(MUSIC_REVIEW_PATH, DEFAULT_MUSIC_REVIEW),
    readJson(STATE_PATH, DEFAULT_STATE),
    latestSnapshot(),
    fileCount(path.join(WORKSPACE_ROOT, 'content', 'video', 'remotion', 'masters'), new Set(['.mp4', '.mov'])),
    fileCount(path.join(WORKSPACE_ROOT, 'content', 'video', 'remotion', 'drafts'), new Set(['.mp4', '.mov']))
  ]);
  const normalizedState = normalizeState(state);
  const approvals = parseAssetRegistry(registry).map((asset) => {
    const decision = normalizedState.approvals?.[asset.path];
    return { ...asset, status: decision?.status || asset.inferredStatus, note: decision?.note || '', decidedAt: decision?.updatedAt || null };
  });
  const decisions = mergeDecisions(journey.decisionsNeeded || {}, normalizedState.decisionOverrides || {});
  const musicItems = (musicReview.items || []).map((item) => ({
    ...item,
    decision: normalizedState.musicReviews?.[item.id] || {
      status: 'pending',
      note: '',
      updatedAt: null
    }
  }));
  const chapters = (journey.chapters || []).map((chapter) => ({
    ...chapter,
    imageUrl: `/workspace-file?path=${encodeURIComponent(chapter.leadVisual)}`,
    masterExists: Boolean(chapter.approvedMaster)
  }));
  return {
    generatedAt: new Date().toISOString(),
    mode: 'LOCAL_PRIVATE',
    journey: { ...journey, chapters, decisions },
    approvals,
    musicLab: sanitizeMusicReview(musicReview, musicItems),
    state: normalizedState,
    system: {
      approvedMasters,
      reviewVideos,
      latestWaveWarzSnapshot: snapshot,
      pendingApprovals: approvals.filter((asset) => asset.status === 'pending').length,
      pendingMusicReviews: musicItems.filter(
        (item) => item.decision.status === 'pending'
          && (
            musicReview.reviewMode === 'diagnostic-comparison'
            || item.kind === 'movement'
          )
      ).length,
      pendingMusicExperiments: musicItems.filter(
        (item) => musicReview.reviewMode !== 'diagnostic-comparison'
          && item.kind === 'comparison'
          && item.decision.status === 'pending'
      ).length,
      openDecisions: decisions.filter((decision) => !decision.resolved).length,
      approvedChapters: chapters.filter((chapter) => chapter.status === 'approved').length
    }
  };
}

async function systemHealth() {
  const [publicApp, state, journey, registry, musicReview, wavformsGenesis, quilLiveContract, live, tools] = await Promise.all([
    exists(path.join(PUBLIC_ROOT, 'index.html')),
    exists(STATE_PATH),
    exists(JOURNEY_PATH),
    exists(REGISTRY_PATH),
    exists(MUSIC_REVIEW_PATH),
    exists(WAVFORMS_PLAN_PATH),
    exists(QUIL_LIVE_CONTRACT_PATH),
    quilLive.status(),
    creativeTools.observe()
  ]);
  const postiz = postizConfig();
  return {
    ok: publicApp,
    mode: 'LOCAL_PRIVATE',
    node: process.versions.node,
    workspaceRoot: WORKSPACE_ROOT,
    core: {
      publicApp,
      stateStorage: state ? 'existing' : 'created-on-first-save'
    },
    optionalSources: { journey, assetRegistry: registry, musicReview, wavformsGenesis, wavidIncubator: true, quilLiveContract, creativeTools: true, contentGallery: true },
    integrations: {
      postiz: postiz.configured ? 'enabled' : 'disabled',
      wavewarzRoster: 'manual-explicit-sync',
      quilLive: live.state,
      localCreativePacks: `${tools.counts.ready}/${tools.counts.total} ready`
    }
  };
}

async function postizStatus() {
  const config = postizConfig();
  if (!config.configured) {
    return {
      configured: false,
      connected: false,
      label: config.label,
      apiUrl: config.apiUrl,
      integrations: []
    };
  }
  const status = await new PostizClient(config).status();
  return { configured: true, label: config.label, apiUrl: config.apiUrl, ...status };
}

function remoteRecordIds(response) {
  const records = Array.isArray(response) ? response : response ? [response] : [];
  return records.map((record) => ({ id: record?.id || null, group: record?.group || null })).filter((record) => record.id || record.group);
}

async function handoffToPostiz(body) {
  const action = body?.action;
  if (!body?.confirmed) throw new PostizError('Explicit handoff confirmation is required', 400);
  const config = postizConfig();
  const client = new PostizClient(config);
  const state = await readJson(STATE_PATH, DEFAULT_STATE);
  const normalizedState = normalizeState(state);
  const item = normalizedState.contentPipeline.find((record) => record.id === body.queueId);
  if (!item) throw new PostizError('Content pipeline item not found', 404);
  if (item.approvalStatus !== 'approved') throw new PostizError('Artist approval is required before Postiz handoff', 409);
  if (item.postiz?.submittedAt && !body.force) throw new PostizError('This item already has a Postiz handoff record', 409);

  const integrations = await client.integrations();
  const integration = integrations.find((channel) => channel.id === item.integrationId);
  if (!integration || integration.disabled) throw new PostizError('Selected Postiz channel is unavailable', 409);

  let media = null;
  if (item.assetPath) media = await client.upload(resolveWorkspaceMedia(item.assetPath));
  const payload = buildPostizPayload({ item, action, integration, media });
  const result = await client.createPost(payload);
  const submittedAt = new Date().toISOString();
  item.postiz = {
    action,
    submittedAt,
    channelId: integration.id,
    channelName: integration.name,
    provider: integration.identifier,
    remoteRecords: remoteRecordIds(result)
  };
  item.status = action === 'schedule' ? 'scheduled' : action === 'now' ? 'submitted' : item.status;
  normalizedState.activity.unshift({
    id: randomUUID(),
    message: `${item.title} handed to Postiz as ${action}.`,
    type: 'publishing',
    timestamp: submittedAt
  });
  await saveState(normalizedState);
  return { ok: true, itemId: item.id, postiz: item.postiz };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readRequestJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new Error('Request exceeds 1 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function quilLiveToken(request) {
  const authorization = String(request.headers.authorization || '');
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return String(request.headers['x-quil-live-token'] || '').trim();
}

async function sendFile(response, filePath, { cache = true, rangeHeader = null } = {}) {
  const details = await stat(filePath);
  if (!details.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
  const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  const supportsRange = contentType.startsWith('audio/') || contentType.startsWith('video/');
  if (supportsRange && rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    if (!match || (!match[1] && !match[2])) {
      response.writeHead(416, {
        'Content-Range': `bytes */${details.size}`,
        'Cache-Control': 'no-store'
      });
      return response.end();
    }
    const suffixLength = match[1] ? null : Number(match[2]);
    const start = suffixLength === null
      ? Number(match[1])
      : Math.max(0, details.size - suffixLength);
    const requestedEnd = match[2] && suffixLength === null
      ? Number(match[2])
      : details.size - 1;
    const end = Math.min(requestedEnd, details.size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= details.size) {
      response.writeHead(416, {
        'Content-Range': `bytes */${details.size}`,
        'Cache-Control': 'no-store'
      });
      return response.end();
    }
    response.writeHead(206, {
      'Content-Type': contentType,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${details.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cache ? 'private, max-age=60' : 'no-store'
    });
    return await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end });
      stream.once('error', reject);
      response.once('finish', resolve);
      stream.pipe(response);
    });
  }
  const body = await readFile(filePath);
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    ...(supportsRange ? { 'Accept-Ranges': 'bytes' } : {}),
    'Cache-Control': cache ? 'private, max-age=60' : 'no-store'
  });
  response.end(body);
}

export function createCommandCenterServer({
  accessControl = createAccessControl({ env: process.env }),
  musicMaker = createMusicMaker({ workspaceRoot: WORKSPACE_ROOT })
} = {}) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const accessCredentials = {
        cookieHeader: request.headers.cookie,
        csrfToken: request.headers['x-artistos-csrf']
      };

      if (request.method === 'GET' && ['/api/access', '/api/access/status'].includes(requestUrl.pathname)) {
        return sendJson(response, 200, accessControl.status(accessCredentials));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/access/login') {
        const body = await readRequestJson(request);
        const result = accessControl.login({
          passcode: body.passcode,
          ip: request.socket.remoteAddress
        });
        if (result.setCookie) response.setHeader('Set-Cookie', result.setCookie);
        return sendJson(response, 200, result);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/access/logout') {
        const result = accessControl.logout(accessCredentials);
        if (result.setCookie) response.setHeader('Set-Cookie', result.setCookie);
        return sendJson(response, 200, result);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        return sendJson(response, 200, {
          ok: true,
          mode: 'LOCAL_PRIVATE',
          access: accessControl.publicStatus()
        });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/quil/live/observations') {
        const result = await quilLive.ingest(await readRequestJson(request), quilLiveToken(request));
        return sendJson(response, 202, result);
      }

      const protectedRequest = requestUrl.pathname.startsWith('/api/') || requestUrl.pathname === '/workspace-file';
      if (protectedRequest) {
        if (request.method === 'GET' || request.method === 'HEAD') {
          const session = accessControl.authenticate(accessCredentials);
          if (!session.authenticated) {
            throw new AccessControlError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
          }
        } else {
          accessControl.authorizeMutation(accessCredentials);
        }
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/dashboard') {
        return sendJson(response, 200, await buildDashboard());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/tools') {
        return sendJson(response, 200, await creativeTools.observe());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/forge') {
        return sendJson(response, 200, await assetForge.observe());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/music-maker') {
        return sendJson(response, 200, await musicMaker.observe());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/music-maker/launch') {
        return sendJson(response, 202, await musicMaker.launch(await readRequestJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/music-maker/jobs') {
        const body = await readRequestJson(request);
        return sendJson(response, 202, await musicMaker.generate(body));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/visual-maker') {
        const forge = await assetForge.observe();
        return sendJson(response, 200, {
          schema: 'artistos-visual-maker/1.0',
          mode: 'FIRST_PARTY_RENDER_DESK',
          engine: forge.engines.remotion,
          projects: forge.projects.filter((project) => project.engine === 'visual'),
          boundaries: {
            firstPartyUi: true,
            backgroundRenderOnly: true,
            nativeStudio: false,
            renderRequiresConfirmation: true,
            approvalInheritance: false,
            publishing: false
          }
        });
      }
      if (request.method === 'POST' && (
        (requestUrl.pathname.startsWith('/api/tools/') && requestUrl.pathname.endsWith('/launch'))
        || (requestUrl.pathname.startsWith('/api/forge/projects/') && requestUrl.pathname.endsWith('/studio'))
      )) return sendError(response, 404, 'Native GUI launch is not exposed by ArtistOS');

      if (request.method === 'GET' && requestUrl.pathname === '/api/gallery') {
        return sendJson(response, 200, await contentGallery.observe({ force: requestUrl.searchParams.get('refresh') === '1' }));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/forge/projects') {
        return sendJson(response, 201, await assetForge.save(await readRequestJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname.startsWith('/api/forge/projects/') && requestUrl.pathname.endsWith('/render')) {
        const encodedId = requestUrl.pathname.slice('/api/forge/projects/'.length, -'/render'.length);
        const id = decodeURIComponent(encodedId);
        return sendJson(response, 202, await assetForge.startRender({ id, ...await readRequestJson(request) }));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/wavforms') {
        const nursery = await wavformsNursery.observe();
        const etag = nursery.snapshot?.id ? `"${nursery.snapshot.id}"` : null;
        if (etag) response.setHeader('ETag', etag);
        if (etag && request.headers['if-none-match'] === etag) {
          response.writeHead(304, { 'Cache-Control': 'no-store' });
          return response.end();
        }
        return sendJson(response, 200, nursery);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/wavforms/anatomy') {
        const anatomy = await wavformsNursery.inspectAnatomy(requestUrl.searchParams.get('edition'));
        if (!anatomy) return sendError(response, 404, 'WavForm anatomy was not found');
        return sendJson(response, 200, anatomy);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/wavids') {
        return sendJson(response, 200, await wavidIncubator.observe());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/quil/live') {
        return sendJson(response, 200, await quilLive.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/wavids/roster-sync') {
        await wavidIncubator.syncRoster();
        return sendJson(response, 200, await wavidIncubator.observe());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/wavids/birth') {
        const result = await wavidIncubator.birth(await readRequestJson(request));
        return sendJson(response, result.created ? 201 : 200, result);
      }
      if (request.method === 'POST' && requestUrl.pathname.startsWith('/api/wavids/births/') && requestUrl.pathname.endsWith('/update')) {
        const encodedId = requestUrl.pathname.slice('/api/wavids/births/'.length, -'/update'.length);
        const id = decodeURIComponent(encodedId);
        return sendJson(response, 202, await wavidIncubator.refreshBirth({ id, ...await readRequestJson(request) }));
      }
      if (request.method === 'POST' && requestUrl.pathname.startsWith('/api/wavids/births/') && requestUrl.pathname.endsWith('/render')) {
        const encodedId = requestUrl.pathname.slice('/api/wavids/births/'.length, -'/render'.length);
        const id = decodeURIComponent(encodedId);
        return sendJson(response, 202, await wavidIncubator.startRender({ id, ...await readRequestJson(request) }));
      }
      if (request.method === 'PATCH' && requestUrl.pathname.startsWith('/api/wavids/births/')) {
        const id = decodeURIComponent(requestUrl.pathname.slice('/api/wavids/births/'.length));
        return sendJson(response, 200, await wavidIncubator.updateBirth({ id, ...await readRequestJson(request) }));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
        return sendJson(response, 200, await readJson(STATE_PATH, DEFAULT_STATE));
      }
      if (request.method === 'PUT' && requestUrl.pathname === '/api/state') {
        return sendJson(response, 200, await saveState(await readRequestJson(request)));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/postiz/status') {
        return sendJson(response, 200, await postizStatus());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/postiz/handoff') {
        return sendJson(response, 200, await handoffToPostiz(await readRequestJson(request)));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/workspace-file') {
        const mediaPath = resolveWorkspaceMedia(requestUrl.searchParams.get('path'));
        return await sendFile(response, mediaPath, { cache: false, rangeHeader: request.headers.range });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return sendError(response, 405, 'Method not allowed');
      }
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const staticPath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
      if (!isWithin(PUBLIC_ROOT, staticPath)) return sendError(response, 403, 'Forbidden');
      return await sendFile(response, staticPath, { cache: false });
    } catch (error) {
      if (error.code === 'ENOENT') return sendError(response, 404, 'Not found');
      if (error instanceof AccessControlError) {
        if (error.retryAfterSeconds) response.setHeader('Retry-After', String(error.retryAfterSeconds));
        return sendJson(response, error.status, { error: error.message, code: error.code });
      }
      if (error instanceof SyntaxError) return sendError(response, 400, 'Invalid JSON');
      if (error instanceof MusicMakerError) return sendError(response, error.status, error.message);
      if (error instanceof PostizError) return sendJson(response, error.status, { error: error.message, details: error.details });
      if (error instanceof AssetForgeError) return sendError(response, error.status, error.message);
      if (error instanceof QuilLiveError) return sendError(response, error.status, error.message);
      if (error instanceof WavIdIncubatorError) return sendError(response, error.status, error.message);
      const clientError = /Invalid|outside|traversal|exceeds|must be/.test(error.message);
      return sendError(response, clientError ? 400 : 500, clientError ? error.message : 'Internal server error');
    }
  });
}

export async function startServer({ host = String(process.env.ARTISTOS_BIND_HOST || process.env.ARTISTOS_HOST || '127.0.0.1'), port = Number(process.env.PORT || 8989) } = {}) {
  const accessControl = createAccessControl({ env: process.env, host });
  const server = createCommandCenterServer({ accessControl });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  const address = server.address();
  console.log(`ArtistOS // REGALIA Command Center online at http://${address.address}:${address.port}`);
  console.log(`Workspace: ${WORKSPACE_ROOT}`);
}
