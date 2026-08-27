import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createContentGallery } from '../content-gallery.mjs';

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(relativePath, content = 'fixture') {
  const root = roots[0];
  const target = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

describe('Content gallery', () => {
  it('indexes existing local media by category without leaking absolute paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'artistos-gallery-'));
    roots.push(root);
    await fixture('assets/generated/asset-forge/drafts/proof.png');
    await fixture('assets/campaigns/wavewarz/main-event/approved/poster.webp');
    await fixture('content/video/remotion/drafts/branding/signal.mp4');
    await fixture('catalog/audio/candidates/song.wav');
    await fixture('assets/readme.txt');
    const gallery = await createContentGallery({ workspaceRoot: root }).observe();
    assert.equal(gallery.schema, 'artistos-content-gallery/1.0');
    assert.equal(gallery.mode, 'READ_ONLY_LOCAL_MEDIA');
    assert.equal(gallery.counts.total, 4);
    assert.equal(gallery.items.find((item) => item.path.endsWith('proof.png')).categoryId, 'asset-forge');
    assert.equal(gallery.items.find((item) => item.path.endsWith('poster.webp')).categoryId, 'wavewarz');
    assert.equal(gallery.items.find((item) => item.path.endsWith('poster.webp')).artifactState, 'approved-lane');
    assert.equal(gallery.items.find((item) => item.path.endsWith('signal.mp4')).categoryId, 'brand-system');
    assert.equal(gallery.items.find((item) => item.path.endsWith('song.wav')).mediaType, 'audio');
    assert.equal(gallery.boundaries.pathStateIsApproval, false);
    assert.equal(JSON.stringify(gallery).includes(root), false);
  });
});
