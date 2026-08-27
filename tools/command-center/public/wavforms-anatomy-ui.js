export const WAVFORM_ANATOMY_PARTS = Object.freeze(['cavities', 'bands', 'nodes', 'lobes']);

export function wavformAnatomyCacheKey(planSha256, edition) {
  return `${planSha256 || 'unbound'}:${edition || 'none'}`;
}

export function wavformArtifactSignature(organism, animate = false) {
  const poster = organism?.artifacts?.poster?.sha256 || 'no-poster';
  const video = organism?.artifacts?.video?.sha256 || 'no-video';
  return `${poster}:${video}:${animate ? 'motion' : 'still'}`;
}

export function normalizeWavformAnatomySelection({ part, featureId = null, map = null } = {}) {
  if (!WAVFORM_ANATOMY_PARTS.includes(part)) return { part: null, featureId: null };
  const features = Array.isArray(map?.[part]) ? map[part] : [];
  if (features.some((feature) => feature?.id === featureId)) return { part, featureId };
  return { part, featureId: features[0]?.id || null };
}

export function shouldPreserveWavformNurseryDom({
  renderedEdition,
  selectedEdition,
  renderedArtifactSignature,
  selectedArtifactSignature
} = {}) {
  return Boolean(renderedEdition)
    && renderedEdition === selectedEdition
    && renderedArtifactSignature === selectedArtifactSignature;
}

export function shouldPreviewWavformAnatomyOnPointer({ pointerType, fineHover } = {}) {
  return pointerType === 'mouse' && fineHover === true;
}
