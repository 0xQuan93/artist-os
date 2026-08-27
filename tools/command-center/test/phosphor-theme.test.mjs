import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  hexToRgbChannels,
  normalizeThemeName,
  resolvePhosphorTheme,
  sanitizeWavIdMood
} from '../public/phosphor-theme.js';

describe('glass phosphor themes', () => {
  it('uses a sanitized active WavID palette in automatic mode', () => {
    const theme = resolvePhosphorTheme('auto', {
      accent: '#A9D9DE', secondary: '#42575D', highlight: '#F2FFFF', background: '#010405'
    });
    assert.equal(theme.source, 'wavid');
    assert.equal(theme.accent, '#a9d9de');
    assert.equal(hexToRgbChannels(theme.accent), '169 217 222');
  });

  it('rejects CSS-shaped values and falls back to a known preset', () => {
    assert.equal(sanitizeWavIdMood({ accent: 'red; color: white' }), null);
    assert.equal(normalizeThemeName('unknown-theme'), 'auto');
    assert.equal(resolvePhosphorTheme('auto', { accent: 'var(--danger)' }).source, 'preset');
  });
});
