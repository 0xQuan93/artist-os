import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction
} from 'remotion';

export type QuilAssetForgeProps = {
  projectId: string;
  title: string;
  template: 'event-poster' | 'announcement' | 'cover-card';
  outputKind: 'still' | 'motion';
  format: 'portrait' | 'story' | 'square' | 'landscape';
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  eyebrow: string;
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  backgroundPath: string;
  backgroundAsset: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
};

export const DEFAULT_QUIL_ASSET_FORGE_PROPS: QuilAssetForgeProps = {
  projectId: 'asset-forge-preview',
  title: 'Untitled transmission',
  template: 'event-poster',
  outputKind: 'still',
  format: 'portrait',
  width: 1080,
  height: 1350,
  fps: 30,
  durationSeconds: 8,
  eyebrow: 'ARTISTOS // LIVE SIGNAL',
  headline: 'MAKE THE SIGNAL YOURS',
  subheadline: 'Built by hand inside QUIL.',
  body: 'A deterministic visual instrument powered by local controls.',
  cta: 'ENTER THE STUDIO',
  backgroundPath: '',
  backgroundAsset: '',
  backgroundColor: '#05090A',
  accentColor: '#76F7E5',
  textColor: '#F0FFFF'
};

export const calculateQuilAssetForgeMetadata: CalculateMetadataFunction<QuilAssetForgeProps> = ({ props }) => ({
  width: Math.round(props.width),
  height: Math.round(props.height),
  fps: Math.round(props.fps),
  durationInFrames: props.outputKind === 'still'
    ? 1
    : Math.max(1, Math.round(props.durationSeconds * props.fps))
});

const fonts = "Inter, Arial, Helvetica, sans-serif";
const mono = "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";

export const QuilAssetForgeVisual: React.FC<QuilAssetForgeProps> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const scale = Math.min(width / 1080, height / 1350);
  const pad = Math.round(Math.max(58, Math.min(width, height) * 0.068));
  const motion = props.outputKind === 'motion';
  const entrance = motion ? interpolate(frame, [0, Math.min(24, durationInFrames - 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const drift = motion ? interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1.04, 1.12]) : 1.06;
  const scan = motion ? interpolate(frame % Math.max(1, props.fps * 3), [0, props.fps * 3], [-10, 110]) : 34;
  const centered = props.template === 'cover-card';
  const compact = props.template === 'announcement';

  return (
    <AbsoluteFill style={{ backgroundColor: props.backgroundColor, color: props.textColor, fontFamily: fonts, overflow: 'hidden' }}>
      {props.backgroundAsset ? (
        <Img
          src={staticFile(props.backgroundAsset)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${drift})`, opacity: 0.62 }}
        />
      ) : null}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 78% 16%, ${props.accentColor}38, transparent 34%), linear-gradient(135deg, ${props.backgroundColor}44, ${props.backgroundColor}F3 72%)` }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: `linear-gradient(${props.accentColor}22 1px, transparent 1px), linear-gradient(90deg, ${props.accentColor}16 1px, transparent 1px)`, backgroundSize: `${Math.max(34, 48 * scale)}px ${Math.max(34, 48 * scale)}px` }} />
      <div style={{ position: 'absolute', top: `${scan}%`, left: 0, right: 0, height: Math.max(1, 2 * scale), background: `linear-gradient(90deg, transparent, ${props.accentColor}99, transparent)`, boxShadow: `0 0 ${24 * scale}px ${props.accentColor}` }} />

      <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', justifyContent: centered ? 'center' : 'space-between', textAlign: centered ? 'center' : 'left', opacity: entrance, transform: `translateY(${(1 - entrance) * 34 * scale}px)` }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 * scale, marginBottom: centered ? 42 * scale : 0 }}>
          <span style={{ color: props.accentColor, fontFamily: mono, fontWeight: 800, fontSize: Math.max(15, 17 * scale), letterSpacing: '0.18em' }}>{props.eyebrow || 'QUIL // ASSET FORGE'}</span>
          <span style={{ padding: `${8 * scale}px ${12 * scale}px`, border: `1px solid ${props.accentColor}88`, borderRadius: 999, color: props.accentColor, fontFamily: mono, fontWeight: 800, fontSize: Math.max(11, 12 * scale), letterSpacing: '0.14em' }}>LOCAL // DRAFT</span>
        </header>

        <main style={{ maxWidth: centered ? '100%' : '88%', marginTop: compact ? 'auto' : undefined, marginBottom: compact ? 'auto' : undefined }}>
          <div style={{ width: centered ? 100 * scale : 74 * scale, height: 5 * scale, margin: centered ? `0 auto ${28 * scale}px` : `0 0 ${28 * scale}px`, background: props.accentColor, boxShadow: `0 0 ${24 * scale}px ${props.accentColor}88` }} />
          <h1 style={{ margin: 0, maxWidth: '100%', fontSize: Math.max(48, Math.min(width * 0.105, height * 0.092)), lineHeight: 0.88, letterSpacing: '-0.065em', fontWeight: 900, textTransform: 'uppercase', textWrap: 'balance' }}>{props.headline}</h1>
          {props.subheadline ? <h2 style={{ margin: `${24 * scale}px 0 0`, color: props.accentColor, fontSize: Math.max(22, 31 * scale), lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 650 }}>{props.subheadline}</h2> : null}
          {props.body ? <p style={{ margin: `${24 * scale}px ${centered ? 'auto' : 0} 0`, maxWidth: 720 * scale, color: `${props.textColor}B8`, fontSize: Math.max(17, 21 * scale), lineHeight: 1.45 }}>{props.body}</p> : null}
        </main>

        <footer style={{ display: 'flex', flexDirection: centered ? 'column' : 'row', justifyContent: 'space-between', alignItems: centered ? 'center' : 'flex-end', gap: 26 * scale, marginTop: centered ? 42 * scale : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 * scale }}>
            <div style={{ width: 46 * scale, height: 46 * scale, display: 'grid', placeItems: 'center', border: `1px solid ${props.accentColor}99`, color: props.accentColor, fontWeight: 900, fontSize: 13 * scale }}>89</div>
            <div style={{ display: 'grid', gap: 3 * scale, fontFamily: mono, fontWeight: 800, letterSpacing: '0.13em' }}><span style={{ fontSize: 14 * scale }}>REGALIA//89</span><small style={{ color: `${props.textColor}70`, fontSize: 10 * scale }}>ARTIST-CONTROLLED INSTRUMENT</small></div>
          </div>
          {props.cta ? <div style={{ padding: `${15 * scale}px ${20 * scale}px`, color: props.backgroundColor, background: props.accentColor, fontFamily: mono, fontSize: 14 * scale, fontWeight: 900, letterSpacing: '0.12em' }}>{props.cta}</div> : null}
        </footer>
      </div>
      <div style={{ position: 'absolute', inset: 24 * scale, border: `1px solid ${props.accentColor}44`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
