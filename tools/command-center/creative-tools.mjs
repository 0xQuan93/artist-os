const SCHEMA = 'artistos-creative-tools/1.2';

export class CreativeToolError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CreativeToolError';
    this.status = status;
  }
}

const TOOLS = [
  {
    id: 'music-maker', category: 'make', label: 'Music Maker', kicker: 'ACE-STEP // ARTISTOS INSTRUMENT',
    description: 'Direct local ACE sessions, generate candidates, and monitor exact outputs without leaving ArtistOS.',
    capabilities: ['Text2music', 'Cover', 'Candidate receipts'], view: 'music-maker', actionLabel: 'Enter Music Maker',
    boundary: 'Structured controls only · candidates are not masters'
  },
  {
    id: 'visual-maker', category: 'make', label: 'Visual Maker', kicker: 'REMOTION // ARTISTOS RENDER DESK',
    description: 'Render and inspect QUIL visual blueprints through the owned ArtistOS workflow.',
    capabilities: ['Still drafts', 'Motion drafts', 'Render receipts'], view: 'visual-maker', actionLabel: 'Enter Visual Maker',
    boundary: 'Fixed renderer only · drafts are not approvals'
  },
  {
    id: 'asset-forge', category: 'make', label: 'Asset Forge', kicker: 'QUIL // OWNED CREATION',
    description: 'Build reusable visual blueprints and ACE sessions from direct controls without an LLM in the interface.',
    capabilities: ['Visual blueprints', 'ACE sessions', 'Local receipts'], view: 'asset-forge', actionLabel: 'Enter Forge',
    boundary: 'Save does not render or generate'
  },
  {
    id: 'content-gallery', category: 'review', label: 'Content Gallery', kicker: 'LIBRARY // LOCAL MEDIA',
    description: 'Browse existing image, motion, and audio artifacts by category without changing their approval state.',
    capabilities: ['Images', 'Motion', 'Audio'], view: 'gallery', actionLabel: 'Open Gallery',
    boundary: 'Read only · folders do not grant approval'
  },
  {
    id: 'quil', category: 'make', label: 'QUIL', kicker: 'WAVID FORGE',
    description: 'Birth, update, render, and inspect artist WavIDs from verified WaveWarz data.',
    capabilities: ['WavID birth', 'Poster + loop', 'Anatomy'], view: 'incubator', actionLabel: 'Open QUIL',
    boundary: 'Explicit network sync · private review'
  },
  {
    id: 'music-lab', category: 'review', label: 'Music Lab', kicker: 'LISTENING GATE',
    description: 'Play local candidates, score the record, and preserve artist decisions without promoting audio.',
    capabilities: ['Local playback', 'Scorecards', 'Decisions'], view: 'music', actionLabel: 'Open Music Lab',
    boundary: 'Artist decision only · no mastering'
  },
  {
    id: 'release-journey', category: 'plan', label: 'Release Journey', kicker: 'CAMPAIGN SEQUENCE',
    description: 'Read the canonical chapter order, campaign state, and unresolved release decisions.',
    capabilities: ['Chapters', 'Decisions', 'Campaign state'], view: 'journey', actionLabel: 'Open Journey',
    boundary: 'Canonical records remain unchanged'
  },
  {
    id: 'approval-room', category: 'review', label: 'Approval Room', kicker: 'EXACT ARTIFACT GATE',
    description: 'Review registered image and motion artifacts and record exact local decisions.',
    capabilities: ['Images', 'Motion', 'Decision ledger'], view: 'approvals', actionLabel: 'Open Approvals',
    boundary: 'Approval does not publish or move files'
  },
  {
    id: 'content-forge', category: 'operate', label: 'Content Forge', kicker: 'DELIVERY PACKAGES',
    description: 'Assemble hooks, captions, assets, calls to action, and manual delivery state.',
    capabilities: ['Copy', 'Assets', 'Manual handoff'], view: 'publishing', actionLabel: 'Open Pipeline',
    boundary: 'No autonomous posting'
  },
  {
    id: 'signal-ledger', category: 'measure', label: 'Signal Ledger', kicker: 'CAMPAIGN MEMORY',
    description: 'Record first-party results and compare campaign signals without connecting an ad platform.',
    capabilities: ['Metrics', 'Performance', 'Learning'], view: 'metrics', actionLabel: 'Open Metrics',
    boundary: 'Local records · no ambient tracking'
  }
];

export function createCreativeToolSurface() {
  async function observe() {
    const tools = TOOLS.map((tool) => ({
      ...tool,
      type: 'command-center',
      status: 'online',
      available: true,
      online: true,
      action: { kind: 'navigate', view: tool.view, label: tool.actionLabel }
    }));
    return {
      schema: SCHEMA,
      mode: 'ARTISTOS_NATIVE_SURFACES',
      tools,
      counts: { total: tools.length, ready: tools.length, online: tools.length, needsSetup: 0 },
      boundaries: {
        arbitraryCommands: false,
        nativeGuiEmbedding: false,
        engineLaunchRequiresConfirmation: true,
        loopbackEnginesOnly: true,
        publishing: false,
        approvalInheritance: false,
        coreRequiresOptionalTools: false
      }
    };
  }

  async function launch() {
    throw new CreativeToolError('Native application launch is not exposed by ArtistOS', 404);
  }

  return { observe, launch };
}
