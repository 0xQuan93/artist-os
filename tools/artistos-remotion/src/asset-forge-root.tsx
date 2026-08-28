import React from 'react';
import { Composition } from 'remotion';
import { ArtistOsRepositoryShowcase } from './compositions/artistos-repository-showcase';
import {
  DEFAULT_QUIL_ASSET_FORGE_PROPS,
  QuilAssetForgeVisual,
  calculateQuilAssetForgeMetadata
} from './compositions/quil-asset-forge';

export const AssetForgeRoot: React.FC = () => (
  <>
  <Composition
    id="QuilAssetForgeVisual"
    component={QuilAssetForgeVisual}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1350}
    defaultProps={DEFAULT_QUIL_ASSET_FORGE_PROPS}
    calculateMetadata={calculateQuilAssetForgeMetadata}
  />
  <Composition
    id="ArtistOsRepositoryShowcase"
    component={ArtistOsRepositoryShowcase}
    durationInFrames={150}
    fps={30}
    width={1200}
    height={630}
  />
  </>
);
