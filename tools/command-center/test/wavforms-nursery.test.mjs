import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  classifyWavFormState,
  createWavFormsNurseryObserver,
  projectMaterialAnatomy
} from '../wavforms-nursery.mjs';

const roots = [];
const hash = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wavforms-nursery-'));
  roots.push(root);
  return root;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, json(value));
}

function token(id) {
  const edition = String(id).padStart(4, '0');
  const slug = `${edition}-fixture-signal-wavform-genesis-v1`;
  return {
    artifacts: {
      poster: `assets/campaigns/music/quantum-quil/artwork/drafts/wavforms-genesis-555-v1/${slug}.png`,
      video: `content/video/remotion/drafts/quantum-quil/wavforms-genesis-555-v1/${slug}.mp4`
    },
    bodyPlan: 'Balanced Lattice',
    edition,
    epithet: 'Fixture',
    filamentRows: 100,
    fingerprints: {
      propsSha256: 'A'.repeat(64),
      materialSha256: 'B'.repeat(64),
      phenotypeSha256: 'C'.repeat(64)
    },
    form: 'pulse-orb',
    id,
    palette: { id: 'living-aqua', name: 'Living Aqua Phosphor', frequencyBand: 'foundational' },
    propsPath: `props/${slug}.json`,
    role: 'Signal',
    seed: `quantum-quil:wavforms:genesis:555:v1:${edition}:fixture`,
    slug,
    timing: { effectiveBpm: 120, nominalBpm: 120, frames: 180, seconds: 6, loopBeats: 12, band: 'medium' },
    title: `Fixture Signal ${edition}`
  };
}

function materialProps(materialFingerprint = 'F'.repeat(64)) {
  return {
    accent: '#76f3df',
    analogAmount: 0.8,
    background: '#02090b',
    highlight: '#efffff',
    secondary: '#236a73',
    edition: 1,
    form: 'pulse-orb',
    organism: {
      asymmetry: 0.5, filamentDensity: 0.7, membraneTension: 0.6,
      memory: 0.7, nervousness: 0.4
    },
    signal: { collapse: 0.4, dropout: 0.5, hold: 0.6, interruption: 0.7 },
    seed: 'must-never-be-projected',
    privateSentinel: 'must-never-be-projected',
    anatomy: {
      version: 'material-v1',
      fingerprint: materialFingerprint,
      body: {
        family: 'ovoid', scale: 0.96, aspect: 0.9, rotation: 0.2,
        harmonics: [
          { order: 2, amplitude: 0.02, phase: 0.1 },
          { order: 3, amplitude: 0.03, phase: 0.2 },
          { order: 4, amplitude: 0.01, phase: 0.3 },
          { order: 5, amplitude: 0.02, phase: 0.4 }
        ],
        lobes: [{ angle: 0.5, amplitude: 0.08, concentration: 5.2 }]
      },
      cavities: [{
        bridgePorosity: 0.2, center: { x: -0.2, y: 0.1 }, irregularity: 0.1,
        phase3: 1.1, phase5: 2.2, radii: { x: 0.16, y: 0.09 }, rotation: 0.3,
        sourceStrength: 0.8
      }],
      nodes: [{ center: { x: 0.3, y: -0.2 }, polarity: -1, radius: 0.1, strength: 0.7 }],
      bands: [
        { from: { kind: 'cavity', index: 0 }, to: { kind: 'node', index: 0 }, bend: 0.1, width: 0.05, strength: 0.6 },
        { from: { kind: 'node', index: 0 }, to: { kind: 'cavity', index: 0 }, bend: -0.08, width: 0.04, strength: 0.5 },
        { from: { kind: 'cavity', index: 0 }, to: { kind: 'node', index: 0 }, bend: 0, width: 0.06, strength: 0.7 }
      ]
    }
  };
}

async function trustedArtifact(workspaceRoot, relativePath, contents) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  const bytes = Buffer.byteLength(contents);
  const sha256 = hash(contents);
  return {
    attempts: [{ status: 'verified-promoted', verification: { passed: true, sha256 } }],
    bytes,
    passed: true,
    path: relativePath,
    sha256,
    status: 'verified'
  };
}

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('WavForms Nursery observer', () => {
  it('projects committed material anatomy into deterministic pre-filter display geometry', () => {
    const entry = token(1);
    const props = materialProps();
    const bytes = Buffer.from(json(props));
    entry.fingerprints.propsSha256 = hash(bytes);
    entry.fingerprints.materialSha256 = props.anatomy.fingerprint;
    const first = projectMaterialAnatomy(props, entry, bytes);
    const second = projectMaterialAnatomy(props, entry, bytes);

    assert.deepEqual(first, second);
    assert.equal(first.available, true);
    assert.deepEqual(first.counts, { lobes: 1, cavities: 1, bands: 3, nodes: 1 });
    assert.equal(first.map.frameTracked, false);
    assert.equal(first.map.bodyOutline.length, 97);
    assert.deepEqual(first.map.bands[0].points[0], first.map.cavities[0].center);
    assert.deepEqual(first.map.bands[0].points.at(-1), first.map.nodes[0].center);
    for (const point of [
      ...first.map.bodyOutline,
      ...first.map.cavities[0].outline,
      ...first.map.bands[0].points,
      ...first.map.nodes[0].outline,
      ...first.map.lobes[0].points
    ]) {
      assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= 100);
      assert.ok(Number.isFinite(point.y) && point.y >= 0 && point.y <= 100);
    }
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes('must-never-be-projected'), false);
    assert.equal(serialized.includes('phase3'), false);
    assert.equal(serialized.includes('phase5'), false);
  });

  it('fails anatomy projection closed when props or material identity drifts', () => {
    const entry = token(1);
    const props = materialProps();
    const bytes = Buffer.from(json(props));
    entry.fingerprints.propsSha256 = hash(bytes);
    entry.fingerprints.materialSha256 = props.anatomy.fingerprint;

    assert.equal(projectMaterialAnatomy(props, entry, Buffer.from(`${bytes} `)).reason, 'props-hash-mismatch');
    assert.equal(projectMaterialAnatomy({ ...props, anatomy: { ...props.anatomy, fingerprint: '0'.repeat(64) } }, entry, bytes).reason, 'material-fingerprint-mismatch');
    const invalid = structuredClone(props);
    invalid.anatomy.bands[0].to.index = 7;
    const invalidBytes = Buffer.from(json(invalid));
    entry.fingerprints.propsSha256 = hash(invalidBytes);
    assert.equal(projectMaterialAnatomy(invalid, entry, invalidBytes).reason, 'invalid-material-v1');
    assert.equal(projectMaterialAnatomy(null, entry, null).reason, 'missing-props');
  });

  it('classifies production and QA stages without implying canon approval', () => {
    assert.equal(classifyWavFormState({}), 'planned');
    assert.equal(classifyWavFormState({ activeBatch: true, queueLive: true }), 'queued');
    assert.equal(classifyWavFormState({ receipt: { status: 'processing', poster: { available: false } } }), 'spawning');
    assert.equal(classifyWavFormState({ receipt: { status: 'processing', poster: { available: true } } }), 'incubating');
    assert.equal(classifyWavFormState({ receipt: { trustedPair: true } }), 'incubating');
    assert.equal(classifyWavFormState({ audit: { qualified: true, adjudicated: false } }), 'verified');
    assert.equal(classifyWavFormState({ audit: { qualified: true, adjudicated: true } }), 'adjudicated');
    assert.equal(classifyWavFormState({ receipt: { status: 'failed' } }), 'failed');
  });

  it('stays optional and creates nothing when the collection pack is absent', async () => {
    const root = await tempRoot();
    const observer = createWavFormsNurseryObserver({ workspaceRoot: root });
    const before = await readdir(root);
    const result = await observer.observe();
    const afterFiles = await readdir(root);
    assert.equal(result.available, false);
    assert.deepEqual(result.organisms, []);
    assert.deepEqual(afterFiles, before);
  });

  it('projects a trusted fixture into verified, incubating, queued, and planned states', async () => {
    const root = await tempRoot();
    const jobRoot = path.join(root, 'tools', 'oxquan-remotion', 'jobs', 'quantum-quil', 'wavforms-genesis-555-v1');
    const productionRoot = path.join(jobRoot, 'production-state');
    const tokens = Array.from({ length: 555 }, (_, index) => token(index + 1));
    const committedProps = materialProps(tokens[0].fingerprints.materialSha256);
    const committedPropsText = json(committedProps);
    tokens[0].fingerprints.propsSha256 = hash(committedPropsText);
    committedProps.anatomy.fingerprint = tokens[0].fingerprints.materialSha256;
    const plan = {
      schema: 'quantum-quil-wavforms-genesis/1.0.0',
      collection: {
        name: 'Quantum QUIL — WavForms Genesis', symbol: 'WAV', supply: 555,
        root: 'quantum-quil:wavforms:genesis:555:v1', rootSha256: 'D'.repeat(64),
        lore: 'In the beginning was the wav and the wav was GOd.',
        engine: 'quantum-quil-generative-organism-material-v1',
        composition: 'QuantumQuilGenerativeOrganism', approval: { scope: 'none', approvalInheritance: false }
      },
      collectionSha256: 'E'.repeat(64),
      outputRoots: {
        artwork: 'assets/campaigns/music/quantum-quil/artwork/drafts/wavforms-genesis-555-v1',
        video: 'content/video/remotion/drafts/quantum-quil/wavforms-genesis-555-v1'
      },
      tokens
    };
    const planText = json(plan);
    await mkdir(jobRoot, { recursive: true });
    await writeFile(path.join(jobRoot, 'collection-plan.json'), planText);
    await writeJson(path.join(jobRoot, tokens[0].propsPath), committedProps);
    const planSha256 = hash(planText);

    const onePoster = await trustedArtifact(root, tokens[0].artifacts.poster, 'poster-one');
    const oneVideo = await trustedArtifact(root, tokens[0].artifacts.video, 'video-one');
    const twoPoster = await trustedArtifact(root, tokens[1].artifacts.poster, 'poster-two');
    const receiptBase = (entry) => ({
      schema: 'quantum-quil-wavforms-render-receipt/1.0',
      id: entry.id,
      edition: entry.edition,
      slug: entry.slug,
      seed: entry.seed,
      collectionSha256: plan.collectionSha256,
      planSha256,
      props: {
        path: `tools/oxquan-remotion/jobs/quantum-quil/wavforms-genesis-555-v1/${entry.propsPath}`,
        sha256: entry.fingerprints.propsSha256
      },
      engine: { id: plan.collection.engine, composition: plan.collection.composition },
      startedAt: '2026-08-11T00:00:00.000Z',
      failures: []
    });
    await writeJson(path.join(productionRoot, 'receipts', '0001.json'), {
      ...receiptBase(tokens[0]), status: 'verified-local-render', completedAt: '2026-08-11T00:01:00.000Z',
      artifacts: { poster: onePoster, video: oneVideo }
    });
    await writeJson(path.join(productionRoot, 'receipts', '0002.json'), {
      ...receiptBase(tokens[1]), status: 'processing', completedAt: null,
      artifacts: { poster: twoPoster, video: { attempts: [], status: 'unrendered' } }
    });
    await writeJson(path.join(jobRoot, 'audits', 'fixture.json'), {
      schema: 'quantum-quil-wavforms-audit/1.0', planSha256, collectionSha256: plan.collectionSha256,
      passed: true, rawPassed: true, status: 'audit-passed', finishedAt: '2026-08-11T00:02:00.000Z',
      artifactAudit: {
        records: [{
          id: 1, edition: '0001', slug: tokens[0].slug,
          artifacts: Object.fromEntries([['poster', onePoster], ['video', oneVideo]].map(([kind, artifact]) => [kind, {
            effectiveTechnicalPassed: true,
            humanAdjudication: null,
            provenance: { passed: true, trustedSha256: artifact.sha256 },
            technical: { passed: true, path: tokens[0].artifacts[kind], sha256: artifact.sha256, bytes: artifact.bytes }
          }]))
        }]
      }
    });
    await writeJson(path.join(productionRoot, 'last-collection-run.json'), {
      schema: 'quantum-quil-wavforms-collection-run/1.0', queueId: `fixture-${process.pid}`,
      planSha256, collectionSha256: plan.collectionSha256, status: 'running', finishedAt: null,
      startedAt: '2026-08-11T00:00:00.000Z', batches: [{ start: 2, count: 2, status: 'rendering' }]
    });
    await writeJson(path.join(productionRoot, 'collection-render.lock'), {
      schema: 'quantum-quil-wavforms-collection-lock/1.0', pid: process.pid,
      acquiredAt: '2026-08-11T00:00:00.000Z', token: 'must-never-leak'
    });

    const result = await createWavFormsNurseryObserver({ workspaceRoot: root }).observe();
    assert.equal(result.available, true);
    assert.equal(result.schema, 'quantum-quil-wavforms-nursery/1.1');
    assert.equal(result.organisms.length, 555);
    assert.equal(result.organisms[0].state, 'verified');
    assert.equal(result.organisms[1].state, 'incubating');
    assert.equal(result.organisms[2].state, 'queued');
    assert.equal(result.organisms[3].state, 'planned');
    assert.deepEqual(result.counts, {
      planned: 552, queued: 1, spawning: 0, incubating: 1, verified: 1, adjudicated: 0, failed: 0
    });
    assert.equal(result.organisms[0].approval.canon, false);
    assert.equal(result.boundaries.companionImplemented, false);
    assert.equal(result.organisms[0].anatomy.available, true);
    assert.equal(result.organisms[0].anatomy.map, undefined);
    const anatomyInspection = await createWavFormsNurseryObserver({ workspaceRoot: root }).inspectAnatomy('0001');
    assert.equal(anatomyInspection.schema, 'quantum-quil-wavforms-anatomy-inspection/1.0');
    assert.equal(anatomyInspection.anatomy.map.frameTracked, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('must-never-leak'), false);
    assert.equal(serialized.includes('environment'), false);
    assert.equal(serialized.includes('command'), false);
    assert.equal(serialized.includes(root), false);
  });
});
