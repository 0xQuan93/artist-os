import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PLAN_SCHEMA = 'quantum-quil-wavforms-genesis/1.0.0';
const RECEIPT_SCHEMA = 'quantum-quil-wavforms-render-receipt/1.0';
const AUDIT_SCHEMA = 'quantum-quil-wavforms-audit/1.0';
const COLLECTION_ROOT = 'quantum-quil:wavforms:genesis:555:v1';
const SUPPLY = 555;
const SHA256 = /^[A-F0-9]{64}$/;
const VERIFIED_ARTIFACT_STATUSES = new Set(['verified', 'verified-resume']);
const TERMINAL_RECEIPT_STATUSES = new Set(['verified-local-render']);
const ARTIFACT_STAT_TTL_MS = 30_000;
const EXPECTED_ARTWORK_ROOT = 'assets/campaigns/music/quantum-quil/artwork/drafts/wavforms-genesis-555-v1';
const EXPECTED_VIDEO_ROOT = 'content/video/remotion/drafts/quantum-quil/wavforms-genesis-555-v1';
const TAU = Math.PI * 2;
const BODY_RADIUS = 370;
const BODY_CENTER = 540;
const CANVAS_SIZE = 1080;
const COMPOSITION_SCALE = 1.012;
const SILHOUETTE_SAMPLES = 192;
const BODY_FAMILIES = new Set(['ovoid', 'bilobed', 'trilobed', 'mantled', 'compressed', 'fronded']);

const PALETTE_FALLBACKS = {
  'living-aqua': ['#76f3df', '#236a73', '#efffff', '#02090b'],
  'oxide-amber': ['#f2a74b', '#9b482e', '#fff0ce', '#090503'],
  'bruised-violet': ['#a78cff', '#d43f81', '#f5eaff', '#030006'],
  'viridian-archive': ['#8bdd72', '#307a67', '#efffe9', '#030805'],
  'cerulean-static': ['#62b8df', '#3e67a5', '#e6f8ff', '#020609'],
  'rose-cathode': ['#e97a9b', '#8f4ad0', '#ffeaf2', '#080205'],
  'sodium-ghost': ['#e5c25a', '#aa7140', '#fff7d8', '#080703'],
  'sulfur-bloom': ['#c8e65a', '#5a933d', '#f8ffd9', '#050801'],
  'ice-filament': ['#a9d9de', '#507b92', '#f3ffff', '#030708'],
  'bone-phosphor': ['#d6cfad', '#887e68', '#fffdf0', '#080704'],
  'carmine-fault': ['#e0525f', '#8c2549', '#ffe9e7', '#090203'],
  'ultraviolet-ash': ['#8372d9', '#594069', '#f0ebff', '#040306']
};

const slash = (value = '') => String(value).replaceAll('\\', '/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback;
    throw error;
  }
}

async function readPropsFile(filePath) {
  try {
    const bytes = await readFile(filePath);
    try {
      return { bytes, props: JSON.parse(bytes.toString('utf8')) };
    } catch {
      return { bytes, props: null };
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { bytes: null, props: null };
    throw error;
  }
}

async function fileStat(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const finitePoint = (point) => point && finite(point.x) && finite(point.y);
const within = (value, minimum, maximum) => finite(value) && value >= minimum && value <= maximum;
const roundMap = (value) => Math.round(value * 1000) / 1000;

function rotatePoint(point, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine
  };
}

function resolveAnchor(anchor, anatomy) {
  if (finitePoint(anchor)) return { point: anchor, label: 'Free point' };
  if (!anchor || !['cavity', 'node'].includes(anchor.kind) || !Number.isInteger(anchor.index)) return null;
  const source = anchor.kind === 'cavity' ? anatomy.cavities : anatomy.nodes;
  const point = source[anchor.index]?.center;
  if (!finitePoint(point)) return null;
  return {
    point,
    label: `${anchor.kind === 'cavity' ? 'C' : 'N'}${anchor.index + 1}`
  };
}

function validateMaterialAnatomy(anatomy) {
  if (!anatomy || anatomy.version !== 'material-v1' || !anatomy.body) return false;
  const { body } = anatomy;
  if (!BODY_FAMILIES.has(body.family)
    || !within(body.scale, 0.5, 1.5)
    || !within(body.aspect, 0.5, 1.6)
    || !finite(body.rotation)
    || !Array.isArray(body.harmonics)
    || body.harmonics.length < 1
    || body.harmonics.length > 6
    || !body.harmonics.every((harmonic) => [2, 3, 4, 5].includes(harmonic?.order)
      && within(harmonic.amplitude, -0.2, 0.2)
      && finite(harmonic.phase))
    || !Array.isArray(body.lobes)
    || body.lobes.length < 1
    || body.lobes.length > 3
    || !body.lobes.every((lobe) => finite(lobe?.angle)
      && within(lobe.amplitude, 0, 0.2)
      && within(lobe.concentration, 1, 12))) return false;

  if (!Array.isArray(anatomy.cavities)
    || anatomy.cavities.length < 1
    || anatomy.cavities.length > 3
    || !anatomy.cavities.every((cavity) => finitePoint(cavity?.center)
      && within(cavity.center.x, -1, 1)
      && within(cavity.center.y, -1, 1)
      && finitePoint(cavity.radii)
      && within(cavity.radii.x, 0.01, 0.5)
      && within(cavity.radii.y, 0.01, 0.5)
      && finite(cavity.rotation)
      && within(cavity.irregularity, 0, 0.25)
      && finite(cavity.phase3)
      && finite(cavity.phase5)
      && within(cavity.bridgePorosity, 0, 0.5)
      && within(cavity.sourceStrength, 0, 1)
      && (cavity.polarity === undefined || cavity.polarity === -1 || cavity.polarity === 1))) return false;

  if (!Array.isArray(anatomy.nodes)
    || anatomy.nodes.length < 1
    || anatomy.nodes.length > 3
    || !anatomy.nodes.every((node) => finitePoint(node?.center)
      && within(node.center.x, -1, 1)
      && within(node.center.y, -1, 1)
      && within(node.radius, 0.01, 0.4)
      && [-1, 1].includes(node.polarity)
      && within(node.strength, 0, 1))) return false;

  if (!Array.isArray(anatomy.bands)
    || anatomy.bands.length < 3
    || anatomy.bands.length > 8
    || !anatomy.bands.every((band) => resolveAnchor(band?.from, anatomy)
      && resolveAnchor(band?.to, anatomy)
      && (band.control === undefined || finitePoint(band.control))
      && (band.bend === undefined || within(band.bend, -0.3, 0.3))
      && within(band.width, 0.01, 0.15)
      && within(band.strength, 0, 1))) return false;
  return true;
}

function createStaticEmbedding(anatomy) {
  const harmonics = anatomy.body.harmonics.slice(0, 6);
  const lobes = anatomy.body.lobes.slice(0, 6);
  const lobeMeans = lobes.map((lobe) => Array.from({ length: SILHOUETTE_SAMPLES }, (_, index) => {
    const angle = index / SILHOUETTE_SAMPLES * TAU;
    return Math.exp(clamp(lobe.concentration, 1.5, 10) * (Math.cos(angle - lobe.angle) - 1));
  }).reduce((sum, value) => sum + value, 0) / SILHOUETTE_SAMPLES);
  const rawRadiusAt = (angle) => {
    const harmonicRadius = harmonics.reduce((sum, harmonic) => (
      sum + clamp(harmonic.amplitude, -0.14, 0.14) * Math.cos(harmonic.order * angle + harmonic.phase)
    ), 0);
    const lobeRadius = lobes.reduce((sum, lobe, index) => {
      const bump = Math.exp(clamp(lobe.concentration, 1.5, 10) * (Math.cos(angle - lobe.angle) - 1));
      return sum + clamp(lobe.amplitude, 0, 0.16) * (bump - lobeMeans[index]);
    }, 0);
    return Math.max(0.62, 1 + harmonicRadius + lobeRadius);
  };
  const areaNormalization = Math.sqrt(Array.from({ length: SILHOUETTE_SAMPLES }, (_, index) => {
    const radius = rawRadiusAt(index / SILHOUETTE_SAMPLES * TAU);
    return radius * radius;
  }).reduce((sum, value) => sum + value, 0) / SILHOUETTE_SAMPLES);
  const aspect = clamp(anatomy.body.aspect, 0.72, 1.38);
  const aspectX = Math.sqrt(aspect);
  const aspectY = 1 / aspectX;
  const bodyScale = clamp(anatomy.body.scale, 0.86, 1.08);
  return (point) => {
    const radius = Math.hypot(point.x, point.y);
    const angle = Math.atan2(point.y, point.x);
    const edgeRadius = clamp(rawRadiusAt(angle) / areaNormalization, 0.72, 1.3);
    const shaped = {
      x: Math.cos(angle) * radius * edgeRadius * aspectX,
      y: Math.sin(angle) * radius * edgeRadius * aspectY
    };
    const rotated = rotatePoint(shaped, anatomy.body.rotation);
    return { x: rotated.x * bodyScale, y: rotated.y * bodyScale };
  };
}

function toDisplayPoint(embed, point) {
  const mapped = embed(point);
  const display = {
    x: roundMap((BODY_CENTER + mapped.x * BODY_RADIUS * COMPOSITION_SCALE) / CANVAS_SIZE * 100),
    y: roundMap((BODY_CENTER + mapped.y * BODY_RADIUS * COMPOSITION_SCALE) / CANVAS_SIZE * 100)
  };
  if (!within(display.x, 0, 100) || !within(display.y, 0, 100)) throw new Error('material map leaves display bounds');
  return display;
}

function sampleClosedOutline(count, pointAt) {
  return Array.from({ length: count + 1 }, (_, index) => pointAt(index / count * TAU));
}

function quadraticPoint(from, control, to, amount) {
  const inverse = 1 - amount;
  return {
    x: inverse * inverse * from.x + 2 * inverse * amount * control.x + amount * amount * to.x,
    y: inverse * inverse * from.y + 2 * inverse * amount * control.y + amount * amount * to.y
  };
}

export function projectMaterialAnatomy(props, token, propsBytes = null) {
  if (!propsBytes) return { available: false, reason: 'missing-props', family: 'unresolved', counts: null, map: null };
  const propsSha256 = sha256(propsBytes);
  if (propsSha256 !== token?.fingerprints?.propsSha256) {
    return { available: false, reason: 'props-hash-mismatch', family: 'unresolved', counts: null, map: null };
  }
  const anatomy = props?.anatomy;
  if (!validateMaterialAnatomy(anatomy)) {
    return { available: false, reason: 'invalid-material-v1', family: 'unresolved', counts: null, map: null };
  }
  if (anatomy.fingerprint !== token?.fingerprints?.materialSha256) {
    return { available: false, reason: 'material-fingerprint-mismatch', family: 'unresolved', counts: null, map: null };
  }

  try {
    const embed = createStaticEmbedding(anatomy);
    const bodyOutline = sampleClosedOutline(96, (angle) => toDisplayPoint(embed, { x: Math.cos(angle), y: Math.sin(angle) }));
    const cavities = anatomy.cavities.map((cavity, index) => {
      const outline = sampleClosedOutline(36, (angle) => {
        const boundary = 1 + clamp(cavity.irregularity, 0, 0.18) * (
          0.68 * Math.sin(angle * 3 + cavity.phase3) + 0.32 * Math.sin(angle * 5 + cavity.phase5)
        );
        const local = rotatePoint({
          x: Math.cos(angle) * boundary * cavity.radii.x,
          y: Math.sin(angle) * boundary * cavity.radii.y
        }, cavity.rotation);
        return toDisplayPoint(embed, { x: cavity.center.x + local.x, y: cavity.center.y + local.y });
      });
      return {
        id: `cavity-${index + 1}`,
        label: `C${index + 1}`,
        center: toDisplayPoint(embed, cavity.center),
        outline,
        bridgePorosity: roundMap(cavity.bridgePorosity),
        polarity: cavity.polarity ?? (index % 2 === 0 ? 1 : -1),
        strength: roundMap(cavity.sourceStrength)
      };
    });
    const nodes = anatomy.nodes.map((node, index) => ({
      id: `node-${index + 1}`,
      label: `N${index + 1}`,
      center: toDisplayPoint(embed, node.center),
      outline: sampleClosedOutline(30, (angle) => toDisplayPoint(embed, {
        x: node.center.x + Math.cos(angle) * node.radius,
        y: node.center.y + Math.sin(angle) * node.radius
      })),
      polarity: node.polarity,
      radius: roundMap(node.radius),
      strength: roundMap(node.strength)
    }));
    const bands = anatomy.bands.slice(0, 8).map((band, index) => {
      const from = resolveAnchor(band.from, anatomy);
      const to = resolveAnchor(band.to, anatomy);
      const direction = { x: to.point.x - from.point.x, y: to.point.y - from.point.y };
      const length = Math.max(0.0001, Math.hypot(direction.x, direction.y));
      const perpendicular = { x: -direction.y / length, y: direction.x / length };
      const bend = clamp(band.bend ?? 0, -0.24, 0.24);
      const control = band.control ?? {
        x: (from.point.x + to.point.x) * 0.5 + perpendicular.x * bend,
        y: (from.point.y + to.point.y) * 0.5 + perpendicular.y * bend
      };
      const points = Array.from({ length: 17 }, (_, pointIndex) => (
        toDisplayPoint(embed, quadraticPoint(from.point, control, to.point, pointIndex / 16))
      ));
      return {
        id: `band-${index + 1}`,
        label: `B${index + 1}`,
        from: from.label,
        to: to.label,
        center: points[8],
        points,
        strength: roundMap(band.strength),
        width: roundMap(band.width)
      };
    });
    const lobes = anatomy.body.lobes.map((lobe, index) => {
      const halfSpan = clamp(1.35 / Math.sqrt(lobe.concentration), 0.34, 0.82);
      const points = Array.from({ length: 17 }, (_, pointIndex) => {
        const angle = lobe.angle - halfSpan + halfSpan * 2 * pointIndex / 16;
        return toDisplayPoint(embed, { x: Math.cos(angle), y: Math.sin(angle) });
      });
      return {
        id: `lobe-${index + 1}`,
        label: `L${index + 1}`,
        center: toDisplayPoint(embed, { x: Math.cos(lobe.angle), y: Math.sin(lobe.angle) }),
        points,
        amplitude: roundMap(lobe.amplitude),
        concentration: roundMap(lobe.concentration)
      };
    });
    return {
      available: true,
      reason: null,
      version: 'material-v1',
      family: anatomy.body.family,
      fingerprint: anatomy.fingerprint.slice(0, 16),
      counts: { lobes: lobes.length, cavities: cavities.length, bands: bands.length, nodes: nodes.length },
      map: {
        coordinateSpace: 'static-material-embedding-v1',
        frameTracked: false,
        note: 'Static material coordinates; moving traces and acquisition faults can displace the visible feature during a loop.',
        bodyOutline,
        cavities,
        bands,
        nodes,
        lobes
      }
    };
  } catch {
    return { available: false, reason: 'invalid-display-projection', family: 'unresolved', counts: null, map: null };
  }
}

function safeArtifactPath(plan, token, kind) {
  const extension = kind === 'poster' ? '.png' : '.mp4';
  const rootKey = kind === 'poster' ? 'artwork' : 'video';
  const expectedRoot = `${slash(plan.outputRoots?.[rootKey]).replace(/\/$/, '')}/`;
  const declared = slash(token.artifacts?.[kind]);
  if (!expectedRoot || !declared.startsWith(expectedRoot)) return null;
  if (path.posix.basename(declared) !== `${token.slug}${extension}`) return null;
  if (declared.includes('../') || declared.startsWith('/')) return null;
  return declared;
}

function expectedPropsSuffix(token) {
  return `/jobs/quantum-quil/wavforms-genesis-555-v1/${slash(token.propsPath)}`;
}

function artifactAttemptIsBound(artifact) {
  return Array.isArray(artifact?.attempts) && artifact.attempts.some((attempt) => (
    attempt?.status === 'verified-promoted'
    && attempt?.verification?.passed === true
    && attempt?.verification?.sha256 === artifact.sha256
  ));
}

export function classifyWavFormState({ audit, receipt, activeBatch = false, queueLive = false } = {}) {
  if (audit?.qualified) return audit.adjudicated ? 'adjudicated' : 'verified';
  if (receipt?.status === 'failed' && !(activeBatch && queueLive)) return 'failed';
  if (receipt?.trustedPair) return 'incubating';
  if (receipt?.status === 'processing') {
    return receipt.poster?.available ? 'incubating' : 'spawning';
  }
  if (activeBatch && queueLive) return 'queued';
  return 'planned';
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function projectLock(lock, expectedSchema) {
  if (!lock) return { present: false, readable: false, pid: null, acquiredAt: null, processObserved: false };
  const readable = lock.schema === expectedSchema && Number.isInteger(lock.pid);
  return {
    present: true,
    readable,
    pid: readable ? lock.pid : null,
    acquiredAt: readable && typeof lock.acquiredAt === 'string' ? lock.acquiredAt : null,
    processObserved: readable ? processExists(lock.pid) : false
  };
}

async function collectJsonFiles(root, depth = 0) {
  if (depth > 4) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(fullPath, depth + 1);
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  }));
  return nested.flat().sort((a, b) => a.localeCompare(b));
}

function compactProps(props, token, propsBytes) {
  const fallback = PALETTE_FALLBACKS[token.palette?.id] || ['#8a5cff', '#53deff', '#f4f1f7', '#07070a'];
  const propsTrusted = Boolean(propsBytes) && sha256(propsBytes) === token.fingerprints?.propsSha256;
  const anatomy = projectMaterialAnatomy(props, token, propsBytes);
  const organism = propsTrusted ? props?.organism || {} : {};
  const signal = propsTrusted ? props?.signal || {} : {};
  return {
    colors: {
      accent: propsTrusted ? props?.accent || fallback[0] : fallback[0],
      secondary: propsTrusted ? props?.secondary || fallback[1] : fallback[1],
      highlight: propsTrusted ? props?.highlight || fallback[2] : fallback[2],
      background: propsTrusted ? props?.background || fallback[3] : fallback[3]
    },
    anatomy: {
      ...anatomy,
      lobes: anatomy.counts?.lobes ?? null,
      cavities: anatomy.counts?.cavities ?? null,
      bands: anatomy.counts?.bands ?? null,
      nodes: anatomy.counts?.nodes ?? null
    },
    traits: {
      analogAmount: propsTrusted ? props?.analogAmount ?? null : null,
      asymmetry: organism.asymmetry ?? null,
      filamentDensity: organism.filamentDensity ?? null,
      membraneTension: organism.membraneTension ?? null,
      memory: organism.memory ?? null,
      nervousness: organism.nervousness ?? null,
      collapse: signal.collapse ?? null,
      dropout: signal.dropout ?? null,
      hold: signal.hold ?? null,
      interruption: signal.interruption ?? null
    }
  };
}

export class WavFormsNurseryObserver {
  constructor({ workspaceRoot }) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.remotionRoot = path.join(this.workspaceRoot, 'tools', 'oxquan-remotion');
    this.jobRoot = path.join(this.remotionRoot, 'jobs', 'quantum-quil', 'wavforms-genesis-555-v1');
    this.planPath = path.join(this.jobRoot, 'collection-plan.json');
    this.productionRoot = path.join(this.jobRoot, 'production-state');
    this.receiptsRoot = path.join(this.productionRoot, 'receipts');
    this.auditsRoot = path.join(this.jobRoot, 'audits');
    this.planCache = null;
    this.receiptCache = new Map();
    this.auditCache = new Map();
    this.artifactStatCache = new Map();
    this.lastGood = null;
  }

  async #loadPlan() {
    const details = await fileStat(this.planPath);
    if (!details) return null;
    const stamp = `${details.size}:${details.mtimeMs}`;
    if (this.planCache?.stamp === stamp) return this.planCache;

    const bytes = await readFile(this.planPath);
    const plan = JSON.parse(bytes.toString('utf8'));
    if (plan.schema !== PLAN_SCHEMA) throw new Error('WavForms plan schema is not supported');
    if (plan.collection?.root !== COLLECTION_ROOT || plan.collection?.supply !== SUPPLY) {
      throw new Error('WavForms collection identity does not match the Nursery contract');
    }
    if (slash(plan.outputRoots?.artwork) !== EXPECTED_ARTWORK_ROOT
      || slash(plan.outputRoots?.video) !== EXPECTED_VIDEO_ROOT) {
      throw new Error('WavForms artifact roots do not match the Nursery contract');
    }
    if (!Array.isArray(plan.tokens) || plan.tokens.length !== SUPPLY) {
      throw new Error('WavForms plan must define exactly 555 organisms');
    }
    plan.tokens.forEach((token, index) => {
      const edition = String(index + 1).padStart(4, '0');
      if (token.id !== index + 1 || token.edition !== edition) {
        throw new Error(`WavForms plan has an invalid edition at ${edition}`);
      }
      if (!safeArtifactPath(plan, token, 'poster') || !safeArtifactPath(plan, token, 'video')) {
        throw new Error(`WavForms ${edition} has an unsafe artifact declaration`);
      }
    });

    const propFiles = plan.tokens.map((token) => path.join(this.jobRoot, slash(token.propsPath)));
    const props = await mapLimit(propFiles, 24, (filePath) => readPropsFile(filePath));
    const bases = plan.tokens.map((token, index) => {
      const compact = compactProps(props[index].props, token, props[index].bytes);
      return {
        id: token.id,
        edition: token.edition,
        slug: token.slug,
        title: token.title,
        name: `WavForm #${token.edition} — ${token.title}`,
        epithet: token.epithet,
        role: token.role,
        bodyPlan: token.bodyPlan,
        form: token.form,
        filamentRows: token.filamentRows,
        palette: {
          id: token.palette?.id,
          name: token.palette?.name,
          frequencyBand: token.palette?.frequencyBand,
          ...compact.colors
        },
        timing: {
          effectiveBpm: token.timing?.effectiveBpm,
          nominalBpm: token.timing?.nominalBpm,
          frames: token.timing?.frames,
          seconds: token.timing?.seconds,
          loopBeats: token.timing?.loopBeats,
          band: token.timing?.band
        },
        anatomy: { ...compact.anatomy, map: undefined },
        traits: compact.traits,
        fingerprints: {
          props: token.fingerprints?.propsSha256?.slice(0, 16) || null,
          material: token.fingerprints?.materialSha256?.slice(0, 16) || null,
          phenotype: token.fingerprints?.phenotypeSha256?.slice(0, 16) || null
        },
        _plan: token,
        _anatomyMap: compact.anatomy.map
      };
    });
    this.planCache = {
      stamp,
      bytesSha256: sha256(bytes),
      plan,
      bases,
      byEdition: new Map(bases.map((item) => [item.edition, item]))
    };
    this.receiptCache.clear();
    this.auditCache.clear();
    this.artifactStatCache.clear();
    return this.planCache;
  }

  async #artifactStat(relativePath) {
    const absolutePath = path.resolve(this.workspaceRoot, relativePath);
    const expectedRoot = `${this.workspaceRoot}${path.sep}`.toLowerCase();
    if (!absolutePath.toLowerCase().startsWith(expectedRoot)) return null;
    const now = Date.now();
    const cached = this.artifactStatCache.get(absolutePath);
    if (cached && now - cached.checkedAt < ARTIFACT_STAT_TTL_MS) return cached.details;
    const details = await fileStat(absolutePath);
    this.artifactStatCache.set(absolutePath, { checkedAt: now, details });
    return details;
  }

  async #projectReceipt(raw, base, planCache) {
    if (!raw || raw.schema !== RECEIPT_SCHEMA) return null;
    const token = base._plan;
    const identityPassed = raw.id === token.id
      && raw.edition === token.edition
      && raw.slug === token.slug
      && raw.seed === token.seed
      && raw.collectionSha256 === planCache.plan.collectionSha256
      && raw.planSha256 === planCache.bytesSha256
      && raw.props?.sha256 === token.fingerprints?.propsSha256
      && slash(raw.props?.path).endsWith(expectedPropsSuffix(token))
      && raw.engine?.id === planCache.plan.collection.engine
      && raw.engine?.composition === planCache.plan.collection.composition;

    const artifacts = {};
    for (const kind of ['poster', 'video']) {
      const declaredPath = safeArtifactPath(planCache.plan, token, kind);
      const artifact = raw.artifacts?.[kind];
      const statusTrusted = VERIFIED_ARTIFACT_STATUSES.has(artifact?.status);
      const hashTrusted = typeof artifact?.sha256 === 'string' && SHA256.test(artifact.sha256);
      const pathTrusted = slash(artifact?.path) === declaredPath;
      const attemptTrusted = artifactAttemptIsBound(artifact);
      const details = identityPassed && statusTrusted && hashTrusted && pathTrusted && attemptTrusted
        ? await this.#artifactStat(declaredPath)
        : null;
      const sizeTrusted = Boolean(details) && (!Number.isFinite(artifact?.bytes) || details.size === artifact.bytes);
      const available = identityPassed && statusTrusted && hashTrusted && pathTrusted && attemptTrusted && sizeTrusted;
      artifacts[kind] = {
        available,
        path: available ? declaredPath : null,
        url: available ? `/workspace-file?path=${encodeURIComponent(declaredPath)}` : null,
        status: artifact?.status || 'unrendered',
        bytes: available ? details.size : null,
        sha256: available ? artifact.sha256 : null
      };
    }
    return {
      status: raw.status,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
      completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
      failures: Array.isArray(raw.failures) ? raw.failures.length : 0,
      identityPassed,
      poster: artifacts.poster,
      video: artifacts.video,
      trustedPair: artifacts.poster.available && artifacts.video.available,
      _raw: raw
    };
  }

  async #loadReceipts(planCache) {
    let entries = [];
    try {
      entries = await readdir(this.receiptsRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const names = entries
      .filter((entry) => entry.isFile() && /^\d{4}\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const projected = await mapLimit(names, 24, async (name) => {
      const edition = name.slice(0, 4);
      const base = planCache.byEdition.get(edition);
      if (!base) return null;
      const filePath = path.join(this.receiptsRoot, name);
      const cached = this.receiptCache.get(name);
      if (cached && TERMINAL_RECEIPT_STATUSES.has(cached.raw?.status)) {
        return [edition, await this.#projectReceipt(cached.raw, base, planCache)];
      }
      const details = await fileStat(filePath);
      if (!details) return null;
      const stamp = `${details.size}:${details.mtimeMs}`;
      let raw = cached?.stamp === stamp ? cached.raw : await readJson(filePath, null);
      if (!raw) return null;
      this.receiptCache.set(name, { stamp, raw });
      return [edition, await this.#projectReceipt(raw, base, planCache)];
    });
    return new Map(projected.filter(Boolean));
  }

  async #loadAudits(planCache, receipts) {
    const files = await collectJsonFiles(this.auditsRoot);
    const reports = await mapLimit(files, 12, async (filePath) => {
      const details = await fileStat(filePath);
      if (!details) return null;
      const stamp = `${details.size}:${details.mtimeMs}`;
      const cached = this.auditCache.get(filePath);
      if (cached?.stamp === stamp) return cached.raw;
      const raw = await readJson(filePath, null);
      this.auditCache.set(filePath, { stamp, raw });
      return raw;
    });
    const qualified = new Map();
    for (const report of reports.filter(Boolean)) {
      if (report.schema !== AUDIT_SCHEMA
        || report.planSha256 !== planCache.bytesSha256
        || report.collectionSha256 !== planCache.plan.collectionSha256
        || report.passed !== true
        || !Array.isArray(report.artifactAudit?.records)) continue;
      const finished = Date.parse(report.finishedAt || '') || 0;
      for (const record of report.artifactAudit.records) {
        const base = planCache.byEdition.get(record.edition);
        const receipt = receipts.get(record.edition);
        if (!base || record.id !== base.id || record.slug !== base.slug || !receipt?.trustedPair) continue;
        let valid = true;
        let adjudicated = false;
        for (const kind of ['poster', 'video']) {
          const artifact = record.artifacts?.[kind];
          const receiptArtifact = receipt[kind];
          const effectivePassed = artifact?.effectiveTechnicalPassed === true
            || (artifact?.effectiveTechnicalPassed === undefined && artifact?.technical?.passed === true);
          if (!artifact
            || !effectivePassed
            || artifact.provenance?.passed !== true
            || artifact.technical?.sha256 !== artifact.provenance?.trustedSha256
            || artifact.technical?.sha256 !== receiptArtifact.sha256
            || slash(artifact.technical?.path) !== safeArtifactPath(planCache.plan, base._plan, kind)
            || artifact.technical?.bytes !== receiptArtifact.bytes) {
            valid = false;
            break;
          }
          adjudicated ||= artifact.humanAdjudication?.applied === true;
        }
        if (!valid) continue;
        const existing = qualified.get(record.edition);
        if (!existing || finished >= existing.finished) {
          qualified.set(record.edition, {
            qualified: true,
            adjudicated,
            status: report.status,
            rawPassed: report.rawPassed !== false,
            finishedAt: report.finishedAt || null,
            finished
          });
        }
      }
    }
    return qualified;
  }

  async #readLock(name, schema) {
    const filePath = path.join(this.productionRoot, name);
    const details = await fileStat(filePath);
    if (!details) return projectLock(null, schema);
    const raw = await readJson(filePath, {});
    return projectLock(raw, schema);
  }

  async #loadQueue(planCache) {
    const [queueRaw, runRaw, collectionLock, renderLock] = await Promise.all([
      readJson(path.join(this.productionRoot, 'last-collection-run.json'), null),
      readJson(path.join(this.productionRoot, 'last-run.json'), null),
      this.#readLock('collection-render.lock', 'quantum-quil-wavforms-collection-lock/1.0'),
      this.#readLock('render.lock', 'quantum-quil-wavforms-render-lock/1.0')
    ]);
    const queueIdentity = queueRaw?.schema === 'quantum-quil-wavforms-collection-run/1.0'
      && queueRaw.planSha256 === planCache.bytesSha256
      && queueRaw.collectionSha256 === planCache.plan.collectionSha256;
    const runIdentity = runRaw?.schema === 'quantum-quil-wavforms-render-run/1.0'
      && runRaw.planSha256 === planCache.bytesSha256
      && runRaw.collectionSha256 === planCache.plan.collectionSha256;
    const live = Boolean(queueIdentity
      && queueRaw.status === 'running'
      && queueRaw.finishedAt === null
      && collectionLock.readable
      && collectionLock.processObserved);
    const activeBatch = queueIdentity
      ? [...(queueRaw.batches || [])].reverse().find((batch) => ['rendering', 'auditing'].includes(batch.status)) || null
      : null;
    return {
      queueId: queueIdentity ? queueRaw.queueId : null,
      status: queueIdentity ? queueRaw.status : 'idle',
      startedAt: queueIdentity ? queueRaw.startedAt : null,
      finishedAt: queueIdentity ? queueRaw.finishedAt : null,
      phase: activeBatch?.status || (queueIdentity ? queueRaw.status : 'idle'),
      live,
      liveness: live ? 'observed' : queueRaw?.status === 'running' ? 'unknown' : 'idle',
      currentBatch: activeBatch ? {
        start: activeBatch.start,
        count: activeBatch.count,
        end: activeBatch.start + activeBatch.count - 1,
        status: activeBatch.status,
        startedAt: activeBatch.startedAt,
        finishedAt: activeBatch.finishedAt
      } : null,
      run: runIdentity ? {
        runId: runRaw.runId,
        status: runRaw.status,
        startedAt: runRaw.startedAt,
        finishedAt: runRaw.finishedAt,
        completed: runRaw.completed || 0,
        failed: runRaw.failed || 0,
        selectedIds: Array.isArray(runRaw.selectedIds) ? runRaw.selectedIds : []
      } : null,
      locks: { collection: collectionLock, render: renderLock }
    };
  }

  async #progress(receipt) {
    const raw = receipt?._raw;
    if (!raw || raw.status !== 'processing') return null;
    const kind = receipt.poster?.available ? 'video' : 'poster';
    const attempts = raw.artifacts?.[kind]?.attempts;
    const latest = Array.isArray(attempts) ? attempts.at(-1) : null;
    const relativeLog = slash(latest?.log);
    const safePrefix = 'tools/oxquan-remotion/jobs/quantum-quil/wavforms-genesis-555-v1/production-state/logs/';
    if (!relativeLog?.startsWith(safePrefix) || relativeLog.includes('../')) {
      return { kind, phase: kind === 'video' ? 'loop incubation' : 'poster formation', current: null, total: null, percent: null };
    }
    let contents = '';
    try {
      contents = await readFile(path.join(this.workspaceRoot, relativeLog), 'utf8');
    } catch {
      return { kind, phase: kind === 'video' ? 'loop incubation' : 'poster formation', current: null, total: null, percent: null };
    }
    const rendered = [...contents.matchAll(/Rendered\s+(\d+)\/(\d+)/g)].at(-1);
    const encoded = [...contents.matchAll(/Encoded\s+(\d+)\/(\d+)/g)].at(-1);
    const match = encoded || rendered;
    if (!match) return { kind, phase: kind === 'video' ? 'loop incubation' : 'poster formation', current: null, total: null, percent: null };
    const current = Number(match[1]);
    const total = Number(match[2]);
    return {
      kind,
      phase: encoded ? 'encoding loop' : kind === 'video' ? 'rendering loop' : 'forming poster',
      current,
      total,
      percent: total > 0 ? Math.min(100, Math.round((current / total) * 1000) / 10) : null
    };
  }

  async inspectAnatomy(edition) {
    const normalized = String(edition || '');
    if (!/^\d{4}$/.test(normalized)) return null;
    const planCache = await this.#loadPlan();
    const base = planCache?.byEdition.get(normalized);
    if (!base) return null;
    return {
      schema: 'quantum-quil-wavforms-anatomy-inspection/1.0',
      mode: 'READ_ONLY',
      edition: base.edition,
      materialFingerprint: base.fingerprints.material,
      anatomy: {
        ...base.anatomy,
        map: base._anatomyMap
      },
      boundary: {
        rendererTracked: false,
        bakedIntoArtwork: false,
        meaning: 'Pre-filter material anatomy map; visible traces can move away from these static coordinates.'
      }
    };
  }

  async observe() {
    try {
      const planCache = await this.#loadPlan();
      if (!planCache) {
        return {
          schema: 'quantum-quil-wavforms-nursery/1.1',
          mode: 'READ_ONLY',
          available: false,
          generatedAt: new Date().toISOString(),
          collection: null,
          counts: { planned: 0, queued: 0, spawning: 0, incubating: 0, verified: 0, adjudicated: 0, failed: 0 },
          queue: { status: 'not-installed', live: false, liveness: 'idle', currentBatch: null },
          organisms: []
        };
      }
      const [queue, receipts] = await Promise.all([
        this.#loadQueue(planCache),
        this.#loadReceipts(planCache)
      ]);
      const audits = await this.#loadAudits(planCache, receipts);
      const activeStart = queue.currentBatch?.start;
      const activeEnd = queue.currentBatch?.end;
      const organisms = planCache.bases.map((base) => {
        const receipt = receipts.get(base.edition) || null;
        const audit = audits.get(base.edition) || null;
        const activeBatch = Number.isInteger(activeStart) && base.id >= activeStart && base.id <= activeEnd;
        const state = classifyWavFormState({ audit, receipt, activeBatch, queueLive: queue.live });
        const reasons = audit?.qualified
          ? [audit.adjudicated ? 'exact-hash-seam-adjudication' : 'technical-audit-passed']
          : state === 'incubating'
            ? [receipt?.trustedPair ? 'awaiting-batch-audit' : 'poster-verified-loop-in-progress']
            : state === 'spawning'
              ? ['local-render-active']
              : state === 'queued'
                ? ['active-batch-position']
                : state === 'failed'
                  ? ['token-render-failed']
                  : ['deterministic-definition-locked'];
        return {
          ...Object.fromEntries(Object.entries(base).filter(([key]) => !key.startsWith('_'))),
          state,
          reasonCodes: reasons,
          production: {
            receiptStatus: receipt?.status || 'none',
            startedAt: receipt?.startedAt || null,
            completedAt: receipt?.completedAt || null,
            failureCount: receipt?.failures || 0
          },
          artifacts: {
            poster: receipt?.poster || { available: false, path: null, url: null, status: 'unrendered', bytes: null, sha256: null },
            video: receipt?.video || { available: false, path: null, url: null, status: 'unrendered', bytes: null, sha256: null }
          },
          qa: {
            status: audit?.status || (receipt?.trustedPair ? 'awaiting-audit' : 'untested'),
            rawPassed: audit?.rawPassed ?? null,
            adjudicated: Boolean(audit?.adjudicated),
            finishedAt: audit?.finishedAt || null
          },
          approval: {
            state: 'review-draft',
            canon: false,
            scope: 'none',
            approvalInheritance: false,
            publication: 'not-evaluated',
            mint: 'not-evaluated'
          }
        };
      });
      const counts = Object.fromEntries(['planned', 'queued', 'spawning', 'incubating', 'verified', 'adjudicated', 'failed'].map((state) => [
        state,
        organisms.filter((organism) => organism.state === state).length
      ]));
      const current = organisms.find((organism) => organism.production.receiptStatus === 'processing')
        || organisms.find((organism) => organism.state === 'queued')
        || null;
      const currentReceipt = current ? receipts.get(current.edition) : null;
      const progress = await this.#progress(currentReceipt);
      const stableProjection = {
        plan: planCache.bytesSha256,
        queue: {
          queueId: queue.queueId,
          status: queue.status,
          live: queue.live,
          phase: queue.phase,
          currentBatch: queue.currentBatch
        },
        counts,
        current: current ? { edition: current.edition, state: current.state, progress } : null,
        states: organisms.map((organism) => `${organism.edition}:${organism.state}:${organism.artifacts.poster.sha256 || ''}:${organism.artifacts.video.sha256 || ''}`)
      };
      const response = {
        schema: 'quantum-quil-wavforms-nursery/1.1',
        mode: 'READ_ONLY',
        available: true,
        generatedAt: new Date().toISOString(),
        snapshot: {
          id: sha256(JSON.stringify(stableProjection)),
          sourceHealth: 'healthy',
          consistent: true
        },
        collection: {
          name: planCache.plan.collection.name,
          symbol: planCache.plan.collection.symbol,
          root: planCache.plan.collection.root,
          rootSha256: planCache.plan.collection.rootSha256,
          planSha256: planCache.bytesSha256,
          collectionSha256: planCache.plan.collectionSha256,
          supply: planCache.plan.collection.supply,
          lore: planCache.plan.collection.lore,
          approval: { scope: 'none', approvalInheritance: false }
        },
        counts,
        totalTechnicallyPassed: counts.verified + counts.adjudicated,
        queue: {
          queueId: queue.queueId,
          status: queue.status,
          phase: queue.phase,
          live: queue.live,
          liveness: queue.liveness,
          startedAt: queue.startedAt,
          finishedAt: queue.finishedAt,
          currentBatch: queue.currentBatch,
          progress,
          currentEdition: current?.edition || null,
          locks: queue.locks
        },
        boundaries: {
          localPrivate: true,
          reviewDrafts: true,
          canonApproved: 0,
          published: 0,
          minted: 0,
          companionImplemented: false,
          bpmMeaning: 'loop-duration parameter only',
          occurrenceMeaning: 'aesthetic occurrence, not rarity'
        },
        organisms
      };
      this.lastGood = response;
      return response;
    } catch (error) {
      if (this.lastGood) {
        return {
          ...this.lastGood,
          generatedAt: new Date().toISOString(),
          snapshot: { ...this.lastGood.snapshot, sourceHealth: 'degraded', consistent: false },
          warning: 'A transient source read failed; showing the last consistent local observation.'
        };
      }
      throw error;
    }
  }
}

export function createWavFormsNurseryObserver(options) {
  return new WavFormsNurseryObserver(options);
}
