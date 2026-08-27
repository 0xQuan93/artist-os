import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  normalizeWavformAnatomySelection,
  shouldPreserveWavformNurseryDom,
  shouldPreviewWavformAnatomyOnPointer,
  wavformAnatomyCacheKey,
  wavformArtifactSignature
} from '../public/wavforms-anatomy-ui.js';

describe('WavForms anatomy UI state', () => {
  const map = {
    cavities: [{ id: 'cavity-1' }, { id: 'cavity-2' }],
    bands: [{ id: 'band-1' }],
    nodes: [{ id: 'node-1' }],
    lobes: [{ id: 'lobe-1' }]
  };

  it('selects the requested feature or the first valid feature and clears invalid parts', () => {
    assert.deepEqual(
      normalizeWavformAnatomySelection({ part: 'cavities', featureId: 'cavity-2', map }),
      { part: 'cavities', featureId: 'cavity-2' }
    );
    assert.deepEqual(
      normalizeWavformAnatomySelection({ part: 'cavities', featureId: 'wrong', map }),
      { part: 'cavities', featureId: 'cavity-1' }
    );
    assert.deepEqual(
      normalizeWavformAnatomySelection({ part: 'organs', featureId: 'cavity-1', map }),
      { part: null, featureId: null }
    );
    assert.deepEqual(
      normalizeWavformAnatomySelection({ part: null, map }),
      { part: null, featureId: null }
    );
  });

  it('isolates cached maps by committed plan identity and edition', () => {
    assert.equal(wavformAnatomyCacheKey('PLAN_A', '0001'), 'PLAN_A:0001');
    assert.notEqual(wavformAnatomyCacheKey('PLAN_A', '0001'), wavformAnatomyCacheKey('PLAN_B', '0001'));
    assert.notEqual(wavformAnatomyCacheKey('PLAN_A', '0001'), wavformAnatomyCacheKey('PLAN_A', '0002'));
  });

  it('preserves the existing media DOM only for the same edition and exact artifact mode', () => {
    const organism = {
      artifacts: {
        poster: { sha256: 'POSTER' },
        video: { sha256: 'VIDEO' }
      }
    };
    const motion = wavformArtifactSignature(organism, true);
    const still = wavformArtifactSignature(organism, false);
    assert.equal(shouldPreserveWavformNurseryDom({
      renderedEdition: '0001', selectedEdition: '0001',
      renderedArtifactSignature: motion, selectedArtifactSignature: motion
    }), true);
    assert.equal(shouldPreserveWavformNurseryDom({
      renderedEdition: '0001', selectedEdition: '0002',
      renderedArtifactSignature: motion, selectedArtifactSignature: motion
    }), false);
    assert.equal(shouldPreserveWavformNurseryDom({
      renderedEdition: '0001', selectedEdition: '0001',
      renderedArtifactSignature: motion, selectedArtifactSignature: still
    }), false);
    assert.equal(shouldPreserveWavformNurseryDom({
      renderedEdition: '0001', selectedEdition: '0001',
      renderedArtifactSignature: 'OLD', selectedArtifactSignature: motion
    }), false);
  });

  it('previews anatomy on fine mouse hover without treating touch or pen contact as hover', () => {
    assert.equal(shouldPreviewWavformAnatomyOnPointer({ pointerType: 'mouse', fineHover: true }), true);
    assert.equal(shouldPreviewWavformAnatomyOnPointer({ pointerType: 'touch', fineHover: true }), false);
    assert.equal(shouldPreviewWavformAnatomyOnPointer({ pointerType: 'pen', fineHover: true }), false);
    assert.equal(shouldPreviewWavformAnatomyOnPointer({ pointerType: 'mouse', fineHover: false }), false);
  });

  it('replaces the browser SVG-group focus capsule with the intentional marker ring', async () => {
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    assert.match(css, /\.nursery-anatomy-marker:focus\s*\{\s*outline:\s*none;/);
    assert.match(css, /\.nursery-anatomy-marker:focus-visible\s+\.marker-target\s*\{/);
    assert.doesNotMatch(css, /\.nursery-anatomy-marker\.selected\s+\.marker-core[^}]*transform:/s);
  });

  it('keeps the QUIL mode controls in document flow beneath the global sticky header', async () => {
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const blocks = [...css.matchAll(/\.quil-modebar\s*\{([^}]*)\}/gs)];
    const finalBlock = blocks.at(-1)?.[1] || '';
    assert.match(finalBlock, /position:\s*relative;/);
    assert.match(finalBlock, /top:\s*auto;/);
    assert.doesNotMatch(finalBlock, /position:\s*sticky;/);
  });
});
