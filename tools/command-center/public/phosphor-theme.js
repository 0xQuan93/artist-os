export const PHOSPHOR_THEMES = Object.freeze({
  auto: { label: 'WavID Auto', accent: '#76f3df', secondary: '#765cff', highlight: '#efffff', background: '#04080a' },
  aqua: { label: 'Aqua Signal', accent: '#76f3df', secondary: '#4474ff', highlight: '#efffff', background: '#04080a' },
  ultraviolet: { label: 'Ultraviolet', accent: '#ad7cff', secondary: '#7050ff', highlight: '#f6edff', background: '#08050d' },
  amber: { label: 'Solar Amber', accent: '#ffca62', secondary: '#ff7048', highlight: '#fff7d6', background: '#0c0703' },
  rose: { label: 'Rose Circuit', accent: '#ff709d', secondary: '#a967ff', highlight: '#fff0f5', background: '#0c0509' },
  ice: { label: 'Cryo Ice', accent: '#9bdbff', secondary: '#4e8ebf', highlight: '#f1fbff', background: '#03080c' }
});

export const isSafeHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function normalizeThemeName(value) {
  return Object.hasOwn(PHOSPHOR_THEMES, value) ? value : 'auto';
}

export function sanitizeWavIdMood(candidate) {
  if (!candidate || !isSafeHex(candidate.accent)) return null;
  return {
    accent: candidate.accent.toLowerCase(),
    secondary: isSafeHex(candidate.secondary) ? candidate.secondary.toLowerCase() : candidate.accent.toLowerCase(),
    highlight: isSafeHex(candidate.highlight) ? candidate.highlight.toLowerCase() : '#efffff',
    background: isSafeHex(candidate.background) ? candidate.background.toLowerCase() : '#04080a'
  };
}

export function resolvePhosphorTheme(preference, wavidMood = null) {
  const name = normalizeThemeName(preference);
  const sourceMood = name === 'auto' ? sanitizeWavIdMood(wavidMood) : null;
  return {
    name,
    label: sourceMood ? 'Active WavID' : PHOSPHOR_THEMES[name].label,
    source: sourceMood ? 'wavid' : 'preset',
    ...(sourceMood || PHOSPHOR_THEMES[name])
  };
}

export function hexToRgbChannels(value) {
  if (!isSafeHex(value)) return '118 243 223';
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)).join(' ');
}
