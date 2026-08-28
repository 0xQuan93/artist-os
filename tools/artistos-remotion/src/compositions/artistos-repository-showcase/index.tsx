import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const tools = [
  { code: '01', name: 'MUSIC MAKER', note: 'Shape the record', color: '#76F7E5' },
  { code: '02', name: 'VISUAL MAKER', note: 'Direct the frame', color: '#B891FF' },
  { code: '03', name: 'ASSET FORGE', note: 'Build the signal', color: '#F0B45A' }
];

const glass = {
  background: 'linear-gradient(145deg, rgba(16, 27, 31, 0.8), rgba(5, 10, 13, 0.54))',
  border: '1px solid rgba(196, 255, 244, 0.13)',
  boxShadow: '0 28px 80px rgba(0, 0, 0, 0.38), inset 0 1px rgba(255, 255, 255, 0.05)'
};

const SignalGlyph: React.FC<{ color: string; index: number }> = ({ color, index }) => {
  if (index === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 26 }}>
      {[9, 18, 12, 24, 15, 21, 8].map((height, item) => <i key={item} style={{ width: 3, height, background: color, borderRadius: 4, opacity: 0.72 + item * 0.035 }} />)}
    </div>;
  }
  if (index === 1) {
    return <div style={{ width: 28, height: 28, border: `1px solid ${color}`, position: 'relative' }}>
      <i style={{ position: 'absolute', inset: 6, border: `1px solid ${color}`, rotate: '45deg' }} />
    </div>;
  }
  return <div style={{ width: 29, height: 29, position: 'relative' }}>
    <i style={{ position: 'absolute', left: 13, top: 0, width: 3, height: 29, background: color }} />
    <i style={{ position: 'absolute', left: 0, top: 13, width: 29, height: 3, background: color }} />
    <i style={{ position: 'absolute', left: 5, top: 5, width: 19, height: 19, border: `1px solid ${color}`, rotate: '45deg' }} />
  </div>;
};

export const ArtistOsRepositoryShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const loop = (frame / durationInFrames) * Math.PI * 2;
  const reveal = spring({ frame, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });

  return <AbsoluteFill style={{
    backgroundColor: '#030608',
    color: '#F2FFFC',
    fontFamily: 'Inter, Arial, Helvetica, sans-serif',
    overflow: 'hidden'
  }}>
    <AbsoluteFill style={{
      background: `radial-gradient(circle at ${74 + Math.sin(loop) * 3}% ${22 + Math.cos(loop) * 4}%, rgba(118, 247, 229, 0.18), transparent 26%), radial-gradient(circle at ${54 + Math.cos(loop) * 5}% 88%, rgba(132, 74, 255, 0.16), transparent 30%), linear-gradient(120deg, #020406 5%, #071013 52%, #030608 100%)`
    }} />
    <AbsoluteFill style={{
      opacity: 0.19,
      backgroundImage: 'linear-gradient(rgba(126, 255, 235, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(126, 255, 235, 0.12) 1px, transparent 1px)',
      backgroundSize: '44px 44px',
      translate: `${Math.sin(loop) * 8}px ${Math.cos(loop) * 6}px`,
      maskImage: 'linear-gradient(90deg, transparent 0%, black 44%, black 100%)'
    }} />
    <div style={{
      position: 'absolute',
      top: `${interpolate(frame, [0, durationInFrames], [-8, 108])}%`,
      left: 0,
      right: 0,
      height: 1,
      opacity: 0.28,
      background: 'linear-gradient(90deg, transparent 4%, #76F7E5 70%, transparent)'
    }} />

    <div style={{ position: 'absolute', inset: 54, display: 'grid', gridTemplateColumns: '0.92fr 1.08fr', gap: 58 }}>
      <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8px 0 10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: reveal }}>
            <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', border: '1px solid rgba(118,247,229,.54)', color: '#76F7E5', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>89</div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 3.1, color: '#76F7E5', fontWeight: 800 }}>REGALIA//89</div>
              <div style={{ marginTop: 5, fontSize: 10, letterSpacing: 2.1, color: 'rgba(224,255,249,.42)' }}>ARTISTOS // COMMAND ENVIRONMENT</div>
            </div>
          </div>

          <h1 style={{
            margin: '62px 0 0',
            width: 510,
            fontSize: 66,
            lineHeight: 0.91,
            letterSpacing: '-4.6px',
            fontWeight: 900,
            textTransform: 'uppercase',
            opacity: interpolate(frame, [5, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            translate: `0 ${interpolate(frame, [5, 28], [28, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`
          }}>Create without leaving your world.</h1>
          <p style={{
            margin: '27px 0 0',
            width: 465,
            color: 'rgba(226, 250, 246, 0.62)',
            fontSize: 17,
            lineHeight: 1.5,
            letterSpacing: '-0.2px',
            opacity: interpolate(frame, [14, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          }}>One artist-owned interface for music, visuals, assets, review, and deliberate delivery.</p>
        </div>

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', width: 480, opacity: interpolate(frame, [24, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          {['LOCAL-FIRST', 'PASSCODE READY', 'NO NATIVE GUIs'].map((label, index) => <span key={label} style={{
            padding: '10px 13px',
            border: '1px solid rgba(183, 255, 244, 0.14)',
            borderRadius: 999,
            background: 'rgba(8, 17, 20, 0.62)',
            color: index === 0 ? '#76F7E5' : 'rgba(225, 255, 250, 0.56)',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.5,
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}>{label}</span>)}
        </div>
      </section>

      <section style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <div style={{
          ...glass,
          width: 562,
          height: 475,
          borderRadius: 27,
          padding: 19,
          rotate: `${Math.sin(loop) * 0.55}deg`,
          translate: `${Math.cos(loop) * 4}px ${Math.sin(loop) * 5}px`,
          opacity: interpolate(frame, [10, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          scale: interpolate(frame, [10, 34], [0.965, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) })
        }}>
          <header style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 14px', borderBottom: '1px solid rgba(190,255,244,.1)' }}>
            <div><span style={{ color: '#76F7E5', fontSize: 10, fontWeight: 900, letterSpacing: 2.1 }}>CREATIVE STUDIO</span><strong style={{ display: 'block', marginTop: 5, fontSize: 14, letterSpacing: '-0.2px' }}>Your tools. One surface.</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(216,255,248,.46)', fontSize: 9, letterSpacing: 1.3 }}><i style={{ width: 6, height: 6, borderRadius: 99, background: '#76F7E5', boxShadow: '0 0 16px #76F7E5' }} /> CORE ONLINE</div>
          </header>

          <div style={{ marginTop: 16, display: 'grid', gap: 11 }}>
            {tools.map((tool, index) => <article key={tool.name} style={{
              position: 'relative',
              height: 84,
              borderRadius: 17,
              border: `1px solid ${tool.color}28`,
              background: `linear-gradient(110deg, ${tool.color}12, rgba(5, 11, 14, .74) 44%)`,
              display: 'grid',
              gridTemplateColumns: '54px 1fr auto',
              alignItems: 'center',
              gap: 15,
              padding: '0 18px',
              opacity: interpolate(frame, [18 + index * 8, 42 + index * 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) }),
              translate: `${interpolate(frame, [18 + index * 8, 42 + index * 8], [38, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) })}px ${Math.sin(loop + index * 1.8) * 1.8}px`
            }}>
              <div style={{ width: 50, height: 50, borderRadius: 13, display: 'grid', placeItems: 'center', background: `${tool.color}10`, border: `1px solid ${tool.color}2c` }}><SignalGlyph color={tool.color} index={index} /></div>
              <div><span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.8, color: `${tool.color}AA` }}>{tool.code} // INSTRUMENT</span><strong style={{ display: 'block', marginTop: 5, fontSize: 16, letterSpacing: '-0.3px' }}>{tool.name}</strong><small style={{ display: 'block', marginTop: 3, color: 'rgba(222,249,245,.42)', fontSize: 10 }}>{tool.note}</small></div>
              <span style={{ padding: '8px 10px', borderRadius: 999, border: `1px solid ${tool.color}30`, color: tool.color, fontSize: 8, fontWeight: 900, letterSpacing: 1.1 }}>READY</span>
            </article>)}
          </div>

          <div style={{ marginTop: 14, height: 58, borderRadius: 15, border: '1px solid rgba(118,247,229,.12)', background: 'rgba(2,7,9,.45)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 17px' }}>
            <div><span style={{ display: 'block', color: 'rgba(220,251,247,.38)', fontSize: 8, letterSpacing: 1.6 }}>ACTION BOUNDARY</span><strong style={{ display: 'block', marginTop: 5, fontSize: 11, letterSpacing: 0.3 }}>Drafts stay drafts until the artist decides.</strong></div>
            <div style={{ width: 76, height: 4, borderRadius: 99, background: 'rgba(118,247,229,.1)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${52 + Math.sin(loop) * 22}%`, background: '#76F7E5', boxShadow: '0 0 15px #76F7E5' }} /></div>
          </div>
        </div>

        <div style={{ position: 'absolute', right: -8, bottom: 10, color: 'rgba(155,255,238,.24)', fontSize: 9, letterSpacing: 2 }}>BUILD // CREATE // REVIEW // DELIVER</div>
      </section>
    </div>
  </AbsoluteFill>;
};
