import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { AssetForgeError, createAssetForge } from '../asset-forge.mjs';

const cleanupRoots = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function aceSettings(overrides = {}) {
  return {
    task: 'text2music',
    model: 'acestep-v15-turbo',
    caption: 'Deterministic ArtistOS session',
    lyrics: '',
    durationSeconds: 30,
    bpm: 120,
    key: 'F minor',
    timeSignature: 4,
    seed: 89,
    sourceAudioPath: '',
    repaintStart: 0,
    repaintEnd: 10,
    ...overrides
  };
}

describe('Asset Forge website boundary', () => {
  it('rejects fractional BPM before persisting an ACE session', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'artistos-forge-bpm-'));
    cleanupRoots.push(root);
    const forge = createAssetForge({ workspaceRoot: root });
    await assert.rejects(
      () => forge.save({ engine: 'ace', title: 'Fractional BPM', settings: aceSettings({ bpm: 120.5 }) }),
      (error) => error instanceof AssetForgeError && /whole number/.test(error.message)
    );
  });

  it('rejects a media path that traverses a symlink or junction', async (context) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'artistos-forge-root-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'artistos-forge-outside-'));
    cleanupRoots.push(root, outside);
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(outside, 'outside.png'), Buffer.from('not-a-real-png'));
    const linked = path.join(root, 'assets', 'linked');
    try {
      await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        context.skip(`Symlinks are unavailable in this environment (${error.code})`);
        return;
      }
      throw error;
    }
    const forge = createAssetForge({ workspaceRoot: root });
    await assert.rejects(
      () => forge.save({
        engine: 'visual',
        title: 'Escaping background',
        settings: { headline: 'NO ESCAPE', backgroundPath: 'assets/linked/outside.png' }
      }),
      (error) => error instanceof AssetForgeError && /symbolic links/.test(error.message)
    );
  });
});
