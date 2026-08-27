import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCreativeToolSurface, CreativeToolError } from '../creative-tools.mjs';

const EXPECTED_IDS = [
  'music-maker',
  'visual-maker',
  'asset-forge',
  'content-gallery',
  'quil',
  'music-lab',
  'release-journey',
  'approval-room',
  'content-forge',
  'signal-ledger'
];

const EXPECTED_ACTIONS = {
  'music-maker': { kind: 'navigate', view: 'music-maker', label: 'Enter Music Maker' },
  'visual-maker': { kind: 'navigate', view: 'visual-maker', label: 'Enter Visual Maker' },
  'asset-forge': { kind: 'navigate', view: 'asset-forge', label: 'Enter Forge' },
  'content-gallery': { kind: 'navigate', view: 'gallery', label: 'Open Gallery' },
  quil: { kind: 'navigate', view: 'incubator', label: 'Open QUIL' },
  'music-lab': { kind: 'navigate', view: 'music', label: 'Open Music Lab' },
  'release-journey': { kind: 'navigate', view: 'journey', label: 'Open Journey' },
  'approval-room': { kind: 'navigate', view: 'approvals', label: 'Open Approvals' },
  'content-forge': { kind: 'navigate', view: 'publishing', label: 'Open Pipeline' },
  'signal-ledger': { kind: 'navigate', view: 'metrics', label: 'Open Metrics' }
};

const FORBIDDEN_TOOL_FIELDS = [
  'url',
  'embedUrl',
  'embedView',
  'engine',
  'runtimeOrigin',
  'launchable',
  'launchMessage',
  'startedAt',
  'exitCode',
  'pid',
  'command',
  'args',
  'cwd',
  'prerequisitePaths'
];

describe('first-party creative tool surface', () => {
  it('publishes the exact ArtistOS navigation catalog with every surface online', async () => {
    const observed = await createCreativeToolSurface().observe();

    assert.equal(observed.schema, 'artistos-creative-tools/1.2');
    assert.equal(observed.mode, 'ARTISTOS_NATIVE_SURFACES');
    assert.deepEqual(observed.tools.map((tool) => tool.id), EXPECTED_IDS);
    assert.deepEqual(observed.counts, {
      total: 10,
      ready: 10,
      online: 10,
      needsSetup: 0
    });
    assert.deepEqual(observed.boundaries, {
      arbitraryCommands: false,
      nativeGuiEmbedding: false,
      engineLaunchRequiresConfirmation: true,
      loopbackEnginesOnly: true,
      publishing: false,
      approvalInheritance: false,
      coreRequiresOptionalTools: false
    });
    assert.deepEqual(
      observed.tools.find((tool) => tool.id === 'music-maker').capabilities,
      ['Text2music', 'Cover', 'Candidate receipts']
    );

    for (const tool of observed.tools) {
      assert.equal(tool.type, 'command-center');
      assert.equal(tool.status, 'online');
      assert.equal(tool.available, true);
      assert.equal(tool.online, true);
      assert.deepEqual(tool.action, EXPECTED_ACTIONS[tool.id]);
      for (const field of FORBIDDEN_TOOL_FIELDS) {
        assert.equal(Object.hasOwn(tool, field), false, `${tool.id} must not expose ${field}`);
      }
    }
  });

  it('never exposes a native launch path from the catalog', async () => {
    const surface = createCreativeToolSurface();
    const attempts = [
      () => surface.launch(),
      () => surface.launch({ id: 'music-maker' }),
      () => surface.launch({ id: 'music-maker', confirmed: true }),
      () => surface.launch({ id: 'visual-maker', confirmed: true }),
      () => surface.launch({ id: 'not-a-tool', confirmed: true })
    ];

    for (const attempt of attempts) {
      await assert.rejects(
        attempt,
        (error) => error instanceof CreativeToolError
          && error.status === 404
          && /Native application launch is not exposed by ArtistOS/.test(error.message)
      );
    }
  });
});
