import {
  musicDecisionMatches,
  parseResolutionAnswer,
  stageMusicDecision,
  shouldCloseDialog
} from './music-review-utils.js';
import {
  normalizeWavformAnatomySelection,
  shouldPreserveWavformNurseryDom,
  shouldPreviewWavformAnatomyOnPointer,
  wavformAnatomyCacheKey,
  wavformArtifactSignature
} from './wavforms-anatomy-ui.js';
import {
  hexToRgbChannels,
  normalizeThemeName,
  PHOSPHOR_THEMES,
  resolvePhosphorTheme
} from './phosphor-theme.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#form-dialog');
const dialogForm = document.querySelector('#dialog-form');
const dialogFields = document.querySelector('#dialog-fields');
const viewTitle = document.querySelector('#view-title');
const viewCode = document.querySelector('#view-code');
const themeSelect = document.querySelector('#theme-select');
const themeSource = document.querySelector('#theme-source');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmCode = document.querySelector('#confirm-code');
const confirmTitle = document.querySelector('#confirm-title');
const confirmMessage = document.querySelector('#confirm-message');
const confirmBoundary = document.querySelector('#confirm-boundary');
const confirmAccept = document.querySelector('#confirm-accept');
const confirmCancel = document.querySelector('#confirm-cancel');
const accessGate = document.querySelector('#access-gate');
const accessForm = document.querySelector('#access-form');
const accessPasscode = document.querySelector('#access-passcode');
const accessError = document.querySelector('#access-error');
const sessionLogout = document.querySelector('#session-logout');
const sessionBadge = document.querySelector('#session-badge');
const accessModeLabel = document.querySelector('#access-mode-label');
const accessModeDetail = document.querySelector('#access-mode-detail');
const shell = document.querySelector('.shell');
const identitySigil = document.querySelector('#identity-sigil');

let dashboard = null;
let state = null;
let creativeTools = null;
let musicMaker = null;
let musicSelectedId = null;
let musicDraftMode = false;
let accessState = null;
let assetForge = null;
let gallery = null;
let forgeEngine = 'visual';
let forgeSelectedId = null;
let visualDraftMode = false;
let assetForgePollTimer = null;
let musicMakerPollTimer = null;
let galleryCategory = 'all';
let galleryType = 'all';
let galleryQuery = '';
let galleryPage = 0;
let gallerySelectedId = null;
let currentView = 'incubator';
let approvalFilter = 'pending';
let dialogHandler = null;
let confirmResolver = null;
let nursery = null;
let nurseryEtag = null;
let nurserySelectedEdition = null;
let nurseryFollowLive = true;
let nurseryFilter = 'all';
let nurseryQuery = '';
let nurseryPage = 0;
let nurseryPollTimer = null;
let nurseryRequest = null;
let nurseryAnatomyRequest = null;
let nurseryAnatomyPart = null;
let nurseryAnatomyFeature = null;
const nurseryAnatomyCache = new Map();
let nurseryPlanSha256 = null;
let incubator = null;
let quilLive = null;
let wavidQuery = '';
let wavidRosterFilter = 'eligible';
let wavidSelectedArtistKey = null;
let wavidMediaMode = 'poster';
let wavidAnatomyDetail = null;
let incubatorPolling = false;
let quilLivePolling = false;
let creativeToolPollTimer = null;
let phosphorThemeName = normalizeThemeName(localStorage.getItem('artistos-phosphor-theme'));
let phosphorMoodJobId = localStorage.getItem('artistos-wavid-mood-job');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let nurseryAnimate = !reducedMotion && localStorage.getItem('wavforms-nursery-animate') === 'true';
const NURSERY_PAGE_SIZE = 72;
const GALLERY_PAGE_SIZE = 48;

const NURSERY_ANATOMY_NOTES = {
  cavities: {
    label: 'Cavities',
    code: 'POROUS VOID // LOCAL SOURCE',
    definition: 'Irregular openings within the filament body.',
    function: 'They seed local activation and shuttle flow. Porosity allows some traces to cross.'
  },
  bands: {
    label: 'Bands',
    code: 'FIELD PATH // CONNECTION',
    definition: 'Curved corridors joining cavity and node anchors.',
    function: 'They boost nearby activity and phosphor emphasis, and may help traces bridge a cavity.'
  },
  nodes: {
    label: 'Nodes',
    code: 'FLOW CENTER // POLARITY',
    definition: 'Local centers that shape nearby signal flow.',
    function: 'Radius sets reach; strength sets influence. Positive and negative set circulation direction only.'
  },
  lobes: {
    label: 'Lobes',
    code: 'ENVELOPE // RADIAL SWELL',
    definition: 'Directional swells in the outer body envelope.',
    function: 'Amplitude sets reach; concentration sets focus. Area normalization redistributes the silhouette instead of enlarging the body.'
  }
};

const viewMeta = {
  incubator: ['QUANTUM QUIL // OPERATE', 'QUIL // Artist WavID'],
  nursery: ['QUANTUM QUIL // OBSERVE', 'QUIL // Genesis 555'],
  tools: ['STUDIO // 01', 'Creative Studio'],
  'asset-forge': ['QUIL // MAKE', 'Asset Forge'],
  'music-maker': ['STUDIO // ACE', 'ACE-Step Music Maker'],
  'visual-maker': ['STUDIO // VISUAL', 'Visual Maker'],
  overview: ['SYSTEM // 02', 'Campaign Overview'],
  journey: ['CAMPAIGN // 03', 'Release Journey'],
  music: ['MUSIC // 04', 'Artist Music Lab'],
  approvals: ['REVIEW // 05', 'Approval Queue'],
  publishing: ['PRODUCTION // 06', 'Content Pipeline'],
  metrics: ['SIGNAL // 07', 'Campaign Metrics'],
  gallery: ['LIBRARY // 08', 'Content Gallery']
};

const initialParams = new URLSearchParams(window.location.search);
const requestedView = initialParams.get('view');
if (requestedView && viewMeta[requestedView]) currentView = requestedView;
const requestedNurseryEdition = initialParams.get('edition');
if (/^\d{4}$/.test(requestedNurseryEdition || '')) {
  nurserySelectedEdition = requestedNurseryEdition;
  nurseryFollowLive = false;
}
const requestedAnatomyPart = initialParams.get('anatomy');
if (NURSERY_ANATOMY_NOTES[requestedAnatomyPart]) nurseryAnatomyPart = requestedAnatomyPart;
const requestedArtistKey = initialParams.get('artist');
if (/^wavewarz:audius:[a-z0-9._-]{1,80}$/i.test(requestedArtistKey || '')) wavidSelectedArtistKey = requestedArtistKey;
const requestedWavIdMedia = initialParams.get('media');
if (['poster', 'video', 'anatomy'].includes(requestedWavIdMedia)) wavidMediaMode = requestedWavIdMedia;

const decisionLabels = {
  visualizerStartDate: 'Visualizer start date',
  releaseDate: 'Release date',
  releasePartyDate: 'Release party date',
  releasePartyLocationOrPlatform: 'Party location / platform',
  primaryDistributionPlatforms: 'Primary distribution platforms',
  definitiveReleaseMasters: 'Definitive release masters'
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function activeWavIdMood() {
  const jobs = incubator?.jobs || [];
  const targeted = jobs.find((job) => job.id === phosphorMoodJobId && job.mood?.accent);
  if (targeted) return { mood: targeted.mood, label: targeted.title, jobId: targeted.id };
  const activeBirth = [...(incubator?.births || [])]
    .filter((birth) => birth.current !== false && !['retired', 'superseded'].includes(birth.status) && birth.mood?.accent)
    .sort((a, b) => String(b.updatedAt || b.bornAt).localeCompare(String(a.updatedAt || a.bornAt)))[0];
  if (activeBirth) return { mood: activeBirth.mood, label: activeBirth.displayName, jobId: `job:${activeBirth.job?.id}` };
  const job = jobs.find((entry) => entry.status === 'technically-verified' && entry.mood?.accent)
    || jobs.find((entry) => entry.mood?.accent);
  return job ? { mood: job.mood, label: job.title, jobId: job.id } : null;
}

function applyPhosphorTheme() {
  const source = activeWavIdMood();
  const theme = resolvePhosphorTheme(phosphorThemeName, source?.mood);
  const root = document.documentElement;
  root.dataset.theme = theme.name;
  root.dataset.themeSource = theme.source;
  root.style.setProperty('--mood', theme.accent);
  root.style.setProperty('--mood-rgb', hexToRgbChannels(theme.accent));
  root.style.setProperty('--mood-secondary', theme.secondary);
  root.style.setProperty('--mood-secondary-rgb', hexToRgbChannels(theme.secondary));
  root.style.setProperty('--mood-highlight', theme.highlight);
  root.style.setProperty('--mood-void', theme.background);
  root.style.setProperty('--line-hot', theme.accent);
  root.style.setProperty('--violet', theme.secondary);
  if (themeSelect) {
    themeSelect.value = theme.name;
    themeSelect.title = PHOSPHOR_THEMES[theme.name].label;
  }
  if (themeSource) themeSource.textContent = theme.source === 'wavid'
    ? `WAVID // ${source?.label || 'ACTIVE SIGNAL'}`
    : 'LOCAL PRESET // PERSISTENT';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background);
}

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return 'OPEN';
  if (typeof value === 'object') return value.status || 'RECORDED';
  return String(value);
};

const humanTime = (value) => {
  if (!value) return 'NOT SET';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const number = (value) => Number(value || 0).toLocaleString();

function mediaUrl(assetPath) {
  return `/workspace-file?path=${encodeURIComponent(assetPath)}`;
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.className = `notice show${isError ? ' error' : ''}`;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { notice.className = 'notice'; }, 3000);
}

function confirmInteraction({
  code = 'CONFIRM ACTION',
  title = 'Continue?',
  message,
  confirmLabel = 'Confirm',
  boundary = 'Local operation',
  tone = 'default'
}) {
  confirmCode.textContent = code;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmBoundary.textContent = boundary;
  confirmAccept.textContent = confirmLabel;
  confirmDialog.dataset.tone = tone;
  confirmDialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmDialog.showModal();
    requestAnimationFrame(() => confirmCancel.focus());
  });
}

async function request(url, options = {}) {
  const config = { ...options };
  const method = String(config.method || 'GET').toUpperCase();
  const headers = new Headers(config.headers || {});
  if (
    accessState?.csrfToken
    && !['GET', 'HEAD'].includes(method)
  ) headers.set('X-ArtistOS-CSRF', accessState.csrfToken);
  const response = await fetch(url, { ...config, headers });
  let payload;
  try { payload = await response.json(); }
  catch { payload = { error: 'ArtistOS returned an unreadable response' }; }
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/api/access/')) applyAccessState({ ...accessState, authenticated: false });
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    error.code = payload.code || null;
    throw error;
  }
  return payload;
}

function applyAccessState(status) {
  accessState = status || { authenticated: false, mode: 'passcode' };
  const authenticated = accessState.authenticated === true;
  document.body.dataset.locked = String(!authenticated);
  accessGate.hidden = authenticated;
  shell.inert = !authenticated;
  if (!authenticated) shell.setAttribute('aria-hidden', 'true');
  else shell.removeAttribute('aria-hidden');
  if (sessionBadge) {
    sessionBadge.textContent = accessState.mode === 'local-open' ? 'LOCAL OPEN' : 'PASSCODE';
    sessionBadge.dataset.state = authenticated ? 'authenticated' : 'locked';
  }
  if (sessionLogout) sessionLogout.hidden = accessState.mode !== 'passcode' || !authenticated;
  if (accessModeLabel) accessModeLabel.textContent = accessState.mode === 'local-open' ? 'LOCAL // PRIVATE // ARMED' : 'PASSCODE // SESSION ARMED';
  if (accessModeDetail) accessModeDetail.innerHTML = accessState.mode === 'local-open' ? 'Bound to loopback.<br>No autonomous public actions.' : 'HTTPS collaborator session.<br>No autonomous public actions.';
  if (identitySigil) {
    identitySigil.hidden = !authenticated;
    if (authenticated && identitySigil.dataset.authSrc && !identitySigil.hasAttribute('src')) {
      identitySigil.setAttribute('src', identitySigil.dataset.authSrc);
    }
    if (!authenticated) identitySigil.removeAttribute('src');
  }
  if (!authenticated) requestAnimationFrame(() => accessPasscode?.focus());
}

function normalizeClientState(candidate = {}) {
  const migrateItem = (item) => ({
    ...item,
    status: item.status === 'published'
      ? 'posted'
      : ['scheduled', 'submitted'].includes(item.status)
        ? 'ready'
        : item.status,
    targetDate: item.targetDate || item.scheduledAt || null
  });
  const current = Array.isArray(candidate.contentPipeline)
    ? candidate.contentPipeline.map(migrateItem)
    : [];
  const ids = new Set(current.map((item) => item.id));
  const legacy = Array.isArray(candidate.publishingQueue)
    ? candidate.publishingQueue.map(migrateItem).filter((item) => !ids.has(item.id))
    : [];
  return {
    ...candidate,
    schemaVersion: 2,
    contentPipeline: [...current, ...legacy],
    musicReviews: candidate.musicReviews && typeof candidate.musicReviews === 'object'
      ? candidate.musicReviews
      : {},
    activity: Array.isArray(candidate.activity) ? candidate.activity : [],
    metrics: Array.isArray(candidate.metrics) ? candidate.metrics : []
  };
}

async function refresh() {
  [dashboard, creativeTools, assetForge, musicMaker] = await Promise.all([
    request('/api/dashboard'),
    request('/api/tools'),
    request('/api/forge'),
    request('/api/music-maker')
  ]);
  if (currentView === 'gallery') gallery = await request('/api/gallery');
  state = normalizeClientState(dashboard.state);
  document.querySelector('#nav-approval-count').textContent = dashboard.system.pendingApprovals;
  document.querySelector('#nav-music-count').textContent = dashboard.system.pendingMusicReviews;
  document.querySelector('#nav-tools-count').textContent = creativeTools.counts.ready;
  if (['incubator', 'nursery'].includes(currentView)) {
    await Promise.all([
      refreshNursery({ renderAfter: false }),
      refreshIncubator({ renderAfter: false }),
      refreshQuilLive({ renderAfter: false })
    ]);
  }
  render();
  scheduleNurseryPoll();
  scheduleCreativeToolPoll();
  scheduleAssetForgePoll();
  scheduleMusicMakerPoll();
}

async function saveState(
  message = 'Operational record saved',
  verify = null,
  candidateState = state
) {
  const previousState = structuredClone(state);
  const usesStagedState = candidateState !== state;
  try {
    const compatibilityState = {
      ...candidateState,
      publishingQueue: candidateState.contentPipeline
    };
    const savedState = await request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(compatibilityState)
    });
    if (verify && !verify(savedState)) {
      throw new Error('The server did not return the exact staged record');
    }
    const reloadedDashboard = await request('/api/dashboard');
    if (verify && !verify(reloadedDashboard.state)) {
      throw new Error('The saved record could not be verified after dashboard reload');
    }
    dashboard = reloadedDashboard;
    state = normalizeClientState(dashboard.state);
    document.querySelector('#nav-approval-count').textContent = dashboard.system.pendingApprovals;
    document.querySelector('#nav-music-count').textContent = dashboard.system.pendingMusicReviews;
    render();
    showNotice(message);
    return true;
  } catch (error) {
    if (usesStagedState) {
      try {
        const rollbackState = {
          ...previousState,
          publishingQueue: previousState.contentPipeline
        };
        await request('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rollbackState)
        });
        await refresh();
      } catch (rollbackError) {
        showNotice(
          `Review save failed and rollback could not be verified: ${rollbackError.message}`,
          true
        );
        return false;
      }
    }
    showNotice(`Nothing was recorded: ${error.message}`, true);
    return false;
  }
}

function logActivity(message, type = 'system') {
  state.activity.unshift({ id: crypto.randomUUID(), message, type, timestamp: new Date().toISOString() });
  state.activity = state.activity.slice(0, 100);
}

function render() {
  applyPhosphorTheme();
  const [code, title] = viewMeta[currentView];
  viewCode.textContent = code;
  viewTitle.textContent = title;
  app.dataset.view = currentView;
  document.querySelectorAll('.nav-button').forEach((button) => {
    const active = button.dataset.view === currentView
      || (button.dataset.view === 'incubator' && currentView === 'nursery');
    const studioActive = button.dataset.view === 'tools' && ['music-maker', 'visual-maker', 'asset-forge'].includes(currentView);
    button.classList.toggle('active', active || studioActive);
    if (active || studioActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  app.setAttribute('aria-live', currentView === 'nursery' ? 'off' : 'polite');
  const renderers = { tools: renderCreativeStudio, 'asset-forge': renderAssetForge, 'music-maker': renderMusicMaker, 'visual-maker': renderVisualMaker, gallery: renderContentGallery, overview: renderOverview, nursery: renderWavFormsNursery, incubator: renderWavIdIncubator, journey: renderJourney, music: renderMusicLab, approvals: renderApprovals, publishing: renderContentPipeline, metrics: renderMetrics };
  app.innerHTML = renderers[currentView]();
  bindViewEvents();
}

function sectionIntro(title, copy, action = '') {
  return `<div class="section-intro"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div>${action}</div>`;
}

function statCard(label, value, detail, tone = '') {
  return `<article class="stat-card ${tone}"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function creativeToolAction(tool) {
  const action = tool.action || { view: 'tools', label: 'Open' };
  return `<button class='button primary' data-tool-view='${escapeHtml(action.view)}'>${escapeHtml(action.label)}</button>`;
}

function creativeToolCard(tool, featured = false) {
  const glyphs = {
    'music-maker': '♫', 'visual-maker': '◈', 'asset-forge': '⌘', 'content-gallery': '▦', quil: '∿', 'music-lab': '≋',
    'release-journey': '↗', 'approval-room': '✓', 'content-forge': '+', 'signal-ledger': '⌁'
  };
  const capabilities = tool.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join('');
  return `<article class='tool-card ${featured ? 'featured' : ''} status-${escapeHtml(tool.status)}'>
    <div class='tool-card-head'>
      <div class='tool-glyph' aria-hidden='true'>${escapeHtml(glyphs[tool.id] || '◇')}</div>
      <div><p class='eyebrow'>${escapeHtml(tool.kicker)}</p><h3>${escapeHtml(tool.label)}</h3></div>
      <span class='tool-state'><i></i>${escapeHtml(tool.status.replace('-', ' '))}</span>
    </div>
    <p class='tool-description'>${escapeHtml(tool.description)}</p>
    <div class='tool-capabilities'>${capabilities}</div>
    <div class='tool-card-foot'>${creativeToolAction(tool)}<small>${escapeHtml(tool.boundary)}</small></div>
  </article>`;
}

function renderCreativeStudio() {
  if (!creativeTools) return `<div class='empty'>SCANNING LOCAL CREATIVE SYSTEMS</div>`;
  const makers = creativeTools.tools.filter((tool) => tool.category === 'make');
  const operations = creativeTools.tools.filter((tool) => tool.category !== 'make');
  return `<section class='creative-studio'>
    <div class='studio-hero glass-panel'>
      <div>
        <p class='eyebrow'>ARTISTOS // LOCAL</p>
        <h3>All instruments.</h3>
        <p>Nothing moves without you.</p>
      </div>
      <div class='studio-readout'><strong>${number(creativeTools.counts.ready)}</strong><span>systems ready</span><i></i></div>
    </div>
    <div class='studio-section-head'><span>MAKE</span><small>Owned controls; private engines operate behind ArtistOS</small></div>
    <div class='tool-grid tool-grid-makers'>${makers.map((tool) => creativeToolCard(tool, true)).join('')}</div>
    <div class='studio-section-head'><span>OPERATE</span><small>First-party Command Center instruments</small></div>
    <div class='tool-grid'>${operations.map((tool) => creativeToolCard(tool)).join('')}</div>
    <div class='studio-boundary'><i></i><span>OWNED INTERFACE ONLY</span><span>ENGINE PORTS STAY PRIVATE</span><span>APPROVALS STAY EXACT</span></div>
  </section>`;
}

function renderMusicMaker() {
  const sessions = (assetForge?.projects || []).filter((project) => project.engine === 'ace');
  if (!musicDraftMode && (!musicSelectedId || !sessions.some((project) => project.id === musicSelectedId))) {
    musicSelectedId = sessions[0]?.id || null;
  }
  const selected = musicDraftMode ? null : sessions.find((project) => project.id === musicSelectedId) || null;
  const engine = musicMaker?.engine || { status: 'checking', available: false, online: false };
  const jobs = [...(musicMaker?.jobs || [])].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const projects = sessions.length
    ? sessions.map((project) => `<button class='maker-project ${project.id === musicSelectedId && !musicDraftMode ? 'selected' : ''}' type='button' data-music-project='${escapeHtml(project.id)}' aria-pressed='${project.id === musicSelectedId && !musicDraftMode}'><span class='maker-project-mark' aria-hidden='true'>♫</span><b>${escapeHtml(project.title)}</b><small>${escapeHtml(project.settings.task)} · seed ${escapeHtml(project.settings.seed)}</small></button>`).join('')
    : `<div class='empty forge-empty'>NO SAVED MUSIC SESSIONS</div>`;
  const jobCards = jobs.length
    ? jobs.map((job) => {
      const outputs = Array.isArray(job.outputs) ? job.outputs : [];
      let result;
      if (job.status === 'failed') {
        result = `<p class='maker-job-message error'>${escapeHtml(job.error || 'The private engine could not produce a candidate. Review the session and submit a new job when ready.')}</p>`;
      } else if (job.status === 'succeeded' && outputs.length === 1) {
        const output = outputs[0];
        result = `<div class='maker-output'><span>ONE GENERATED CANDIDATE</span><audio controls preload='metadata' src='/workspace-file?path=${encodeURIComponent(output.path)}'></audio><small>${escapeHtml(output.path)}</small></div>`;
      } else if (job.status === 'succeeded') {
        result = `<p class='maker-job-message error'>The receipt did not return exactly one candidate. Nothing was selected, mastered, or approved.</p>`;
      } else {
        result = `<p class='maker-job-message'>${job.status === 'running' ? 'The private engine is generating one unapproved candidate.' : 'Submitted to the private engine. ArtistOS is waiting for one unapproved candidate.'}</p>`;
      }
      const status = String(job.status || 'submitted');
      return `<article class='maker-job status-${escapeHtml(status)}' role='status' aria-label='Generation job ${escapeHtml(job.jobId)} ${escapeHtml(status)}'>
        <header><strong>${escapeHtml(status.toUpperCase())}</strong><time>${escapeHtml(formatDate(job.submittedAt))}</time></header>
        <p class='maker-job-id'>Session ${escapeHtml(job.projectId)} · job ${escapeHtml(job.jobId)}</p>
        <div class='maker-job-body'>${result}</div>
        <small class='maker-job-boundary'>${escapeHtml(job.boundary)}</small>
      </article>`;
    }).join('')
    : `<div class='empty'>NO GENERATION RECEIPTS YET</div>`;
  const canLaunch = engine.available && !engine.online && engine.status !== 'launching';
  const launchAction = canLaunch
    ? `<button class='button primary' type='button' data-music-launch>Wake local engine</button>`
    : engine.status === 'launching'
      ? `<button class='button' type='button' disabled>Engine warming…</button>`
      : `<span class='status-pill ${escapeHtml(engine.status)}'>${escapeHtml(engine.status)}</span>`;
  return `<section class='maker-native'>
    <header class='maker-bar glass-panel'><div><p class='eyebrow'>REGALIA//89 // MUSIC MAKER</p><h3>Shape the record here.</h3><p>ACE-Step is a private engine. ArtistOS owns every control and result.</p></div><button class='small-button' data-tool-view='tools'>Back to Studio</button></header>
    <div class='maker-native-grid'>
      <aside class='maker-projects panel'><div class='studio-section-head'><span>SESSIONS</span><button class='small-button' type='button' data-music-new>+ New</button></div>${projects}</aside>
      <section class='maker-console panel'>
        <div class='maker-engine-card'>
          <div>
            <p class='eyebrow'>PRIVATE ENGINE // ${escapeHtml(engine.release || 'OPTIONAL PACK')}</p>
            <h4>${escapeHtml(engine.product || 'ACE-Step 1.5')}</h4>
            <p>${engine.available ? 'Generation stays server-side and loopback-only.' : 'The optional music engine is not installed. Session design still works.'}</p>
          </div>
          <div class='maker-state status-${escapeHtml(engine.status)}'><i></i>${escapeHtml(engine.status)}</div>
        </div>
        ${launchAction}
        <div class='maker-form-wrap'>${renderForgeAceForm(selected, { maker: true })}</div>
      </section>
      <aside class='maker-job-list panel'><p class='eyebrow'>GENERATION JOBS // ONE CANDIDATE EACH</p>${jobCards}</aside>
    </div>
    <footer class='studio-boundary'><i></i><span>GENERATE ≠ SELECT</span><span>ONE CANDIDATE ≠ MASTER</span><span>NO AUTONOMOUS PUBLISHING</span></footer>
  </section>`;
}

function forgeSelectedProject() {
  return assetForge?.projects?.find((project) => project.id === forgeSelectedId) || null;
}

function forgeVisualDefaults() {
  return {
    template: 'event-poster', outputKind: 'still', format: 'portrait', fps: 30, durationSeconds: 8,
    eyebrow: 'ARTISTOS // LIVE SIGNAL', headline: 'MAKE THE SIGNAL YOURS', subheadline: 'Built by hand inside QUIL.',
    body: 'A deterministic visual instrument powered by local controls.', cta: 'ENTER THE STUDIO', backgroundPath: '',
    backgroundColor: '#05090A', accentColor: '#76F7E5', textColor: '#F0FFFF'
  };
}

function forgeAceDefaults() {
  return { task: 'text2music', model: 'acestep-v15-turbo', caption: '', lyrics: '', durationSeconds: 30, bpm: 120, key: '', timeSignature: 4, seed: 89, sourceAudioPath: '', repaintStart: 0, repaintEnd: 10 };
}

function forgeOptions(entries, selected, labels = {}) {
  return entries.map((value) => `<option value='${escapeHtml(value)}' ${value === selected ? 'selected' : ''}>${escapeHtml(labels[value] || value)}</option>`).join('');
}

function renderForgeVisualForm(project) {
  const settings = project?.engine === 'visual' ? project.settings : forgeVisualDefaults();
  const title = project?.engine === 'visual' ? project.title : 'Untitled visual';
  const renderState = project?.engine === 'visual' ? project.lastRender : null;
  const renderActive = ['queued', 'bundling', 'resolving', 'rendering'].includes(renderState?.status);
  const formats = assetForge?.formats || [];
  return `<form class='forge-form' data-forge-form='visual'>
    <input type='hidden' name='id' value='${escapeHtml(project?.engine === 'visual' ? project.id : '')}'>
    <div class='forge-field wide'><label>Project title</label><input name='title' required maxlength='100' value='${escapeHtml(title)}'></div>
    <div class='forge-field'><label>Template</label><select name='template'>${forgeOptions(assetForge?.templates || [], settings.template, { 'event-poster': 'Event poster', announcement: 'Announcement', 'cover-card': 'Cover card' })}</select></div>
    <div class='forge-field'><label>Output</label><select name='outputKind'>${forgeOptions(['still', 'motion'], settings.outputKind, { still: 'Still PNG', motion: 'Motion MP4' })}</select></div>
    <div class='forge-field'><label>Format</label><select name='format'>${formats.map((format) => `<option value='${format.id}' ${format.id === settings.format ? 'selected' : ''}>${escapeHtml(format.label)} · ${format.width}×${format.height}</option>`).join('')}</select></div>
    <div class='forge-field'><label>Duration seconds</label><input name='durationSeconds' type='number' min='1' max='60' step='.1' value='${escapeHtml(settings.durationSeconds)}'></div>
    <div class='forge-field'><label>FPS</label><select name='fps'>${forgeOptions([24, 30, 60], settings.fps)}</select></div>
    <div class='forge-field'><label>Eyebrow</label><input name='eyebrow' maxlength='80' value='${escapeHtml(settings.eyebrow)}'></div>
    <div class='forge-field wide'><label>Headline</label><textarea name='headline' required maxlength='120'>${escapeHtml(settings.headline)}</textarea></div>
    <div class='forge-field wide'><label>Subheadline</label><textarea name='subheadline' maxlength='180'>${escapeHtml(settings.subheadline)}</textarea></div>
    <div class='forge-field wide'><label>Body</label><textarea name='body' maxlength='500'>${escapeHtml(settings.body)}</textarea></div>
    <div class='forge-field wide'><label>Call to action</label><input name='cta' maxlength='100' value='${escapeHtml(settings.cta)}'></div>
    <div class='forge-field wide'><label>Background image · workspace-relative</label><input name='backgroundPath' maxlength='320' placeholder='assets/campaigns/…/image.png' value='${escapeHtml(settings.backgroundPath)}'><small>PNG, JPG, or WebP inside assets/ or content/.</small></div>
    <div class='forge-field color'><label>Background</label><input name='backgroundColor' type='color' value='${escapeHtml(settings.backgroundColor)}'></div>
    <div class='forge-field color'><label>Accent</label><input name='accentColor' type='color' value='${escapeHtml(settings.accentColor)}'></div>
    <div class='forge-field color'><label>Text</label><input name='textColor' type='color' value='${escapeHtml(settings.textColor)}'></div>
    <div class='forge-actions wide'><button class='button primary' type='submit'>Save blueprint</button><button class='button' type='button' data-forge-render ${renderActive ? 'disabled' : ''}>${renderActive ? `Rendering ${Math.round(Number(renderState.progress || 0))}%` : 'Save + render in background'}</button></div>
  </form>`;
}

function renderForgeAceForm(project, { maker = false } = {}) {
  const settings = project?.engine === 'ace' ? project.settings : forgeAceDefaults();
  const title = project?.engine === 'ace' ? project.title : 'Untitled music session';
  const actions = maker
    ? `<button class='button primary' type='submit'>Save session</button><button class='button' type='button' data-music-generate>Save + generate candidate</button>`
    : `<button class='button primary' type='submit'>Save ACE session</button><button class='button' type='button' data-forge-copy>Copy controls</button><button class='small-button' type='button' data-tool-view='music-maker'>Open Music Maker</button>`;
  return `<form class='forge-form' data-forge-form='ace'>
    <input type='hidden' name='id' value='${escapeHtml(project?.engine === 'ace' ? project.id : '')}'>
    <div class='forge-field wide'><label>Session title</label><input name='title' required maxlength='100' value='${escapeHtml(title)}'></div>
    <div class='forge-field'><label>Task</label><select name='task'>${forgeOptions(assetForge?.aceTasks || [], settings.task, { text2music: 'Text to music', cover: 'Cover', repaint: 'Repaint' })}</select></div>
    <div class='forge-field'><label>Model</label><select name='model'>${forgeOptions(['acestep-v15-turbo', 'acestep-v15-sft'], settings.model, { 'acestep-v15-turbo': 'Turbo', 'acestep-v15-sft': 'SFT' })}</select></div>
    <div class='forge-field wide'><label>Music caption</label><textarea name='caption' required maxlength='512' placeholder='Genre, feel, instruments, movement…'>${escapeHtml(settings.caption)}</textarea><small>512 characters maximum.</small></div>
    <div class='forge-field wide'><label>Lyrics</label><textarea class='forge-lyrics' name='lyrics' maxlength='4096' placeholder='Optional lyrics or section markers'>${escapeHtml(settings.lyrics)}</textarea></div>
    <div class='forge-field'><label>Duration seconds</label><input name='durationSeconds' type='number' min='10' max='600' step='.1' value='${escapeHtml(settings.durationSeconds)}'></div>
    <div class='forge-field'><label>BPM</label><input name='bpm' type='number' min='30' max='300' step='1' inputmode='numeric' value='${escapeHtml(settings.bpm)}'></div>
    <div class='forge-field'><label>Key</label><input name='key' maxlength='24' placeholder='C minor' value='${escapeHtml(settings.key)}'></div>
    <div class='forge-field'><label>Time signature</label><select name='timeSignature'>${forgeOptions([2, 3, 4, 6], settings.timeSignature)}</select></div>
    <div class='forge-field'><label>Seed</label><input name='seed' type='number' min='0' max='2147483647' step='1' value='${escapeHtml(settings.seed)}'></div>
    <div class='forge-field wide'><label>Source audio · required for cover/repaint</label><input name='sourceAudioPath' maxlength='320' placeholder='catalog/audio/…/source.wav' value='${escapeHtml(settings.sourceAudioPath)}'><small>Repaint generation is safety-locked until the engine can prove sample-identical audio outside the edit corridor.</small></div>
    <div class='forge-field'><label>Repaint start</label><input name='repaintStart' type='number' min='0' max='600' step='.04' value='${escapeHtml(settings.repaintStart)}'></div>
    <div class='forge-field'><label>Repaint end</label><input name='repaintEnd' type='number' min='0' max='600' step='.04' value='${escapeHtml(settings.repaintEnd)}'></div>
    <div class='forge-actions wide'>${actions}</div>
  </form>`;
}

function renderVisualMaker() {
  if (!assetForge) return `<div class='empty'>LOADING VISUAL MAKER</div>`;
  const projects = assetForge.projects.filter((project) => project.engine === 'visual');
  if (!visualDraftMode && (!forgeSelectedId || !projects.some((project) => project.id === forgeSelectedId))) {
    forgeSelectedId = projects[0]?.id || null;
  }
  const selected = visualDraftMode ? null : projects.find((project) => project.id === forgeSelectedId) || null;
  const settings = selected?.settings || forgeVisualDefaults();
  const format = (assetForge.formats || []).find((entry) => entry.id === settings.format) || { width: 1080, height: 1350 };
  const renderState = selected?.lastRender || null;
  const progress = Math.max(0, Math.min(100, Number(renderState?.progress || 0)));
  const artifactUrl = renderState?.status === 'complete' && renderState.outputPath
    ? `/workspace-file?path=${encodeURIComponent(renderState.outputPath)}&v=${encodeURIComponent(renderState.finishedAt || renderState.updatedAt || '')}`
    : null;
  const artifact = artifactUrl
    ? renderState.outputPath.toLowerCase().endsWith('.mp4')
      ? `<video class='forge-artifact' controls muted loop preload='metadata' src='${escapeHtml(artifactUrl)}'></video>`
      : `<img class='forge-artifact' src='${escapeHtml(artifactUrl)}' alt='Latest visual draft for ${escapeHtml(selected.title)}'>`
    : `<div class='empty'>NO RENDERED DRAFT YET</div>`;
  const projectList = projects.length
    ? projects.map((project) => `<button class='maker-project ${project.id === forgeSelectedId && !visualDraftMode ? 'selected' : ''}' type='button' data-visual-project='${escapeHtml(project.id)}' aria-pressed='${project.id === forgeSelectedId && !visualDraftMode}'><span class='maker-project-mark' aria-hidden='true'>◈</span><b>${escapeHtml(project.title)}</b><small>${escapeHtml(project.settings.outputKind)} · ${escapeHtml(project.settings.format)}</small></button>`).join('')
    : `<div class='empty forge-empty'>NO SAVED VISUAL BLUEPRINTS</div>`;
  return `<section class='visual-maker'>
    <header class='maker-bar glass-panel'><div><p class='eyebrow'>REGALIA//89 // VISUAL MAKER</p><h3>Direct the frame here.</h3><p>The render core stays private. ArtistOS owns the blueprint, preview, render progress, and draft.</p></div><button class='small-button' data-tool-view='tools'>Back to Studio</button></header>
    <div class='visual-maker-grid'>
      <aside class='visual-projects panel'><div class='studio-section-head'><span>BLUEPRINTS</span><button class='small-button' type='button' data-visual-new>+ New</button></div>${projectList}</aside>
      <section class='visual-stage panel'>
        ${renderForgeVisualForm(selected)}
      </section>
      <aside class='forge-preview panel'>
        <div class='forge-canvas' data-forge-preview style='--forge-bg:${escapeHtml(settings.backgroundColor)};--forge-accent:${escapeHtml(settings.accentColor)};--forge-text:${escapeHtml(settings.textColor)};--forge-aspect:${format.width} / ${format.height}'><small data-preview-eyebrow>${escapeHtml(settings.eyebrow)}</small><h4 data-preview-headline>${escapeHtml(settings.headline)}</h4><p data-preview-subheadline>${escapeHtml(settings.subheadline)}</p><b data-preview-cta>${escapeHtml(settings.cta)}</b><i>89</i></div>
        <div class='forge-render-state ${escapeHtml(renderState?.status || 'idle')}' role='status'>
          <div><span>${escapeHtml((renderState?.status || 'render core ready').toUpperCase())}</span><strong>${Math.round(progress)}%</strong></div>
          <progress max='100' value='${progress}'></progress>
          <small>${escapeHtml(renderState?.error || renderState?.detail || 'Draft rendering begins only after explicit confirmation.')}</small>
        </div>
        ${artifact}
      </aside>
    </div>
    <footer class='studio-boundary'><i></i><span>BLUEPRINT ≠ RENDER</span><span>DRAFT ≠ APPROVAL</span><span>NO AUTONOMOUS PUBLISHING</span></footer>
  </section>`;
}
function renderAssetForge() {
  if (!assetForge) return `<div class='empty'>LOADING ASSET FORGE</div>`;
  const selected = forgeSelectedProject();
  const settings = selected?.engine === 'visual' ? selected.settings : forgeVisualDefaults();
  const previewFormat = (assetForge.formats || []).find((format) => format.id === settings.format) || { width: 1080, height: 1350 };
  const renderState = selected?.engine === 'visual' ? selected.lastRender : null;
  const renderProgress = Math.max(0, Math.min(100, Number(renderState?.progress || 0)));
  const artifactUrl = renderState?.status === 'complete' && renderState.outputPath
    ? `/workspace-file?path=${encodeURIComponent(renderState.outputPath)}&v=${encodeURIComponent(renderState.finishedAt || renderState.updatedAt || '')}`
    : null;
  const artifactPreview = artifactUrl
    ? renderState.outputPath.toLowerCase().endsWith('.mp4')
      ? `<video class='forge-artifact' controls muted loop preload='metadata' src='${escapeHtml(artifactUrl)}'></video>`
      : `<img class='forge-artifact' src='${escapeHtml(artifactUrl)}' alt='Latest rendered draft of ${escapeHtml(selected.title)}'>`
    : '';
  const progressPanel = renderState ? `<div class='forge-render-state ${escapeHtml(renderState.status)}' role='status'>
    <div><span>${escapeHtml(renderState.status.toUpperCase())}</span><strong>${Math.round(renderProgress)}%</strong></div>
    <progress max='100' value='${renderProgress}'></progress>
    <small>${escapeHtml(renderState.error || renderState.detail || 'Local render receipt')}</small>
  </div>` : `<div class='forge-render-state idle'><div><span>BACKGROUND RENDERER</span><strong>READY</strong></div><progress max='100' value='0'></progress><small>Rendering stays behind the ArtistOS interface.</small></div>`;
  const projects = assetForge.projects.length ? assetForge.projects.map((project) => `<button type='button' class='forge-project ${project.id === forgeSelectedId ? 'selected' : ''}' data-forge-project='${escapeHtml(project.id)}' aria-pressed='${project.id === forgeSelectedId}'><span aria-hidden='true'>${project.engine === 'visual' ? '◈' : '♫'}</span><b>${escapeHtml(project.title)}</b><small>${escapeHtml(project.engine)} · ${escapeHtml(project.state)}</small></button>`).join('') : `<div class='empty forge-empty'>NO SAVED TOOL PROJECTS</div>`;
  return `<section class='asset-forge'>
    <header class='forge-hero glass-panel'><div><p class='eyebrow'>QUIL // OWNED CREATION</p><h3>Make without a model in the room.</h3><p>Direct controls, reusable projects, deterministic drafts.</p></div><div class='forge-engine-state'><span class='${assetForge.engines.remotion.available ? 'ready' : ''}'>REMOTION</span><span class='${assetForge.engines.ace.available ? 'ready' : ''}'>ACE</span></div></header>
    <div class='forge-tabs' role='tablist'><button type='button' data-forge-engine='visual' aria-selected='${forgeEngine === 'visual'}'>VISUAL BUILDER</button><button type='button' data-forge-engine='ace' aria-selected='${forgeEngine === 'ace'}'>MUSIC SESSION</button><button type='button' data-forge-new>+ NEW</button></div>
    <div class='forge-layout'>
      <aside class='forge-projects panel'><p class='eyebrow'>TOOL PROJECTS // LOCAL</p>${projects}</aside>
      <section class='forge-controls panel'>${forgeEngine === 'visual' ? renderForgeVisualForm(selected) : renderForgeAceForm(selected)}</section>
      <aside class='forge-preview panel'>
        ${forgeEngine === 'visual' ? `<div class='forge-canvas' data-forge-preview style='--forge-bg:${escapeHtml(settings.backgroundColor)};--forge-accent:${escapeHtml(settings.accentColor)};--forge-text:${escapeHtml(settings.textColor)};--forge-aspect:${previewFormat.width} / ${previewFormat.height}'><small data-preview-eyebrow>${escapeHtml(settings.eyebrow)}</small><h4 data-preview-headline>${escapeHtml(settings.headline)}</h4><p data-preview-subheadline>${escapeHtml(settings.subheadline)}</p><b data-preview-cta>${escapeHtml(settings.cta)}</b><i>89</i></div>${progressPanel}${artifactPreview ? `<div><p class='eyebrow'>LATEST RENDERED DRAFT</p>${artifactPreview}</div>` : ''}<p>The blueprint preview is live. Completed drafts return here without exposing the render engine.</p>` : `<div class='forge-session-readout'><span>MUSIC SESSION</span><strong>${escapeHtml(selected?.engine === 'ace' ? selected.title : 'READY TO DEFINE')}</strong><i>Fixed seed · explicit task · private engine handoff</i></div><p>Saving preserves intent only. Generation happens only through Music Maker after explicit confirmation.</p>`}
      </aside>
    </div>
    <footer class='studio-boundary'><i></i><span>SAVE ≠ RENDER</span><span>DRAFT ≠ APPROVAL</span><span>NO AUTONOMOUS PUBLISHING</span></footer>
  </section>`;
}

async function refreshAssetForge({ renderAfter = true } = {}) {
  assetForge = await request('/api/forge');
  if (renderAfter && ['asset-forge', 'visual-maker', 'music-maker'].includes(currentView)) render();
  scheduleAssetForgePoll();
}

function scheduleAssetForgePoll() {
  clearTimeout(assetForgePollTimer);
  const active = assetForge?.projects?.some((project) => ['queued', 'bundling', 'resolving', 'rendering'].includes(project.lastRender?.status));
  if (!['asset-forge', 'visual-maker'].includes(currentView) || !active) return;
  assetForgePollTimer = setTimeout(async () => {
    try {
      const wasActive = active;
      await refreshAssetForge();
      if (wasActive && !assetForge?.projects?.some((project) => ['queued', 'bundling', 'resolving', 'rendering'].includes(project.lastRender?.status))) {
        gallery = null;
      }
    } catch (error) {
      showNotice(`Render progress unavailable: ${error.message}`, true);
    }
  }, 800);
}

async function refreshMusicMaker({ renderAfter = true } = {}) {
  musicMaker = await request('/api/music-maker');
  if (renderAfter && currentView === 'music-maker') render();
  scheduleMusicMakerPoll();
}

function scheduleMusicMakerPoll() {
  clearTimeout(musicMakerPollTimer);
  const active = musicMaker?.engine?.status === 'launching' || musicMaker?.jobs?.some((job) => ['submitted', 'running'].includes(job.status));
  if (currentView !== 'music-maker' || !active) return;
  musicMakerPollTimer = setTimeout(async () => {
    try {
      await refreshMusicMaker();
    } catch (error) {
      showNotice(`Music engine status unavailable: ${error.message}`, true);
      scheduleMusicMakerPoll();
    }
  }, 1500);
}

function galleryFilteredItems() {
  const query = galleryQuery.trim().toLowerCase();
  return (gallery?.items || []).filter((item) => {
    if (galleryCategory !== 'all' && item.categoryId !== galleryCategory) return false;
    if (galleryType !== 'all' && item.mediaType !== galleryType) return false;
    return !query || `${item.title} ${item.path} ${item.categoryLabel}`.toLowerCase().includes(query);
  });
}

function renderGalleryMedia(item, { selected = false } = {}) {
  if (!item) return `<div class='gallery-empty-preview'>SELECT AN ARTIFACT</div>`;
  if (item.mediaType === 'image') return `<img src='${escapeHtml(item.url)}' alt='${escapeHtml(item.title)}' ${selected ? '' : "loading='lazy'"}>`;
  if (item.mediaType === 'video') return selected
    ? `<video src='${escapeHtml(item.url)}' controls muted loop preload='metadata'></video>`
    : `<div class='gallery-media-placeholder'><span>▶</span><small>VIDEO</small></div>`;
  return selected
    ? `<div class='gallery-audio-preview'><span>♫</span><audio src='${escapeHtml(item.url)}' controls preload='metadata'></audio></div>`
    : `<div class='gallery-media-placeholder'><span>♫</span><small>AUDIO</small></div>`;
}

function renderContentGallery() {
  if (!gallery) return `<div class='empty'>INDEXING LOCAL CONTENT</div>`;
  const filtered = galleryFilteredItems();
  const pageCount = Math.max(1, Math.ceil(filtered.length / GALLERY_PAGE_SIZE));
  galleryPage = Math.min(galleryPage, pageCount - 1);
  const pageItems = filtered.slice(galleryPage * GALLERY_PAGE_SIZE, (galleryPage + 1) * GALLERY_PAGE_SIZE);
  const selected = gallery.items.find((item) => item.id === gallerySelectedId) || pageItems[0] || filtered[0] || gallery.items[0] || null;
  if (selected && !gallerySelectedId) gallerySelectedId = selected.id;
  const categories = [{ id: 'all', label: 'All content', count: gallery.counts.total }, ...(gallery.categories || [])];
  const categoryButtons = categories.map((category) => `<button type='button' data-gallery-category='${escapeHtml(category.id)}' aria-pressed='${galleryCategory === category.id}'><span>${escapeHtml(category.label)}</span><b>${number(category.count)}</b></button>`).join('');
  const cards = pageItems.map((item) => `<button type='button' class='gallery-card ${item.id === selected?.id ? 'selected' : ''}' data-gallery-item='${escapeHtml(item.id)}'>
    <div class='gallery-thumb'>${renderGalleryMedia(item)}</div>
    <span>${escapeHtml(item.categoryLabel)} · ${escapeHtml(item.mediaType)}</span>
    <strong>${escapeHtml(item.title)}</strong>
    <small>${escapeHtml(item.artifactState.replaceAll('-', ' '))} · ${formatBytes(item.bytes)}</small>
  </button>`).join('');
  const selection = selected ? `<div class='gallery-stage-media'>${renderGalleryMedia(selected, { selected: true })}</div>
    <div class='gallery-stage-copy'><p class='eyebrow'>${escapeHtml(selected.categoryLabel)} // ${escapeHtml(selected.mediaType)}</p><h3>${escapeHtml(selected.title)}</h3><span class='gallery-path'>${escapeHtml(selected.path)}</span><div><span class='status-pill'>${escapeHtml(selected.artifactState.replaceAll('-', ' '))}</span><span>${formatBytes(selected.bytes)}</span><span>${new Date(selected.updatedAt).toLocaleDateString()}</span></div><a class='small-button' href='${escapeHtml(selected.url)}' target='_blank' rel='noopener noreferrer'>Open local artifact</a></div>` : `<div class='gallery-empty-preview'>NO MATCHING MEDIA</div>`;
  return `<section class='content-gallery'>
    <header class='gallery-hero glass-panel'><div><p class='eyebrow'>LIBRARY // READ ONLY</p><h3>Everything created, one signal field.</h3><p>Images, motion, and audio already present in this workspace.</p></div><div class='gallery-totals'><strong>${number(gallery.counts.total)}</strong><span>local artifacts</span></div></header>
    <div class='gallery-layout'>
      <aside class='gallery-categories panel'><div class='studio-section-head'><span>CATEGORIES</span><small>PATH-BASED</small></div>${categoryButtons}<p>Folder lanes describe where a file lives. They do not create approval.</p></aside>
      <main class='gallery-browser'>
        <section class='gallery-stage panel'>${selection}</section>
        <div class='gallery-toolbar panel'><input type='search' data-gallery-search placeholder='Search titles or paths' value='${escapeHtml(galleryQuery)}'><div>${['all', 'image', 'video', 'audio'].map((type) => `<button type='button' data-gallery-type='${type}' aria-pressed='${galleryType === type}'>${type === 'all' ? 'ALL MEDIA' : type.toUpperCase()} ${type === 'all' ? number(gallery.counts.total) : number(gallery.counts.byType[type])}</button>`).join('')}</div><button class='small-button' type='button' data-gallery-refresh>Refresh index</button></div>
        <div class='gallery-grid'>${cards || `<div class='empty'>NO MEDIA MATCHES THIS VIEW</div>`}</div>
        <div class='gallery-pagination'><button class='small-button' type='button' data-gallery-page='prev' ${galleryPage === 0 ? 'disabled' : ''}>Previous</button><span>${number(filtered.length)} artifacts · page ${galleryPage + 1} / ${pageCount}</span><button class='small-button' type='button' data-gallery-page='next' ${galleryPage >= pageCount - 1 ? 'disabled' : ''}>Next</button></div>
      </main>
    </div>
    <footer class='studio-boundary'><i></i><span>READ ONLY</span><span>PATH ≠ APPROVAL</span><span>LOCAL WORKSPACE MEDIA</span></footer>
  </section>`;
}

async function refreshGallery({ force = false, renderAfter = true } = {}) {
  gallery = await request(`/api/gallery${force ? '?refresh=1' : ''}`);
  if (renderAfter && currentView === 'gallery') render();
}

async function refreshCreativeTools({ renderAfter = true } = {}) {
  creativeTools = await request('/api/tools');
  document.querySelector('#nav-tools-count').textContent = creativeTools.counts.ready;
  if (renderAfter && ['tools', 'music-maker', 'visual-maker', 'asset-forge'].includes(currentView)) render();
  scheduleCreativeToolPoll();
}

function scheduleCreativeToolPoll() {
  clearTimeout(creativeToolPollTimer);
  const warming = creativeTools?.tools?.some((tool) => tool.status === 'launching');
  if (!['tools', 'music-maker', 'visual-maker', 'asset-forge'].includes(currentView) || !warming) return;
  creativeToolPollTimer = setTimeout(async () => {
    try {
      await refreshCreativeTools();
    } catch (error) {
      showNotice(`Tool status unavailable: ${error.message}`, true);
    }
  }, 2500);
}

function renderQuilModeBar(mode) {
  const wavidCount = incubator?.counts?.roster ?? 0;
  const genesisCount = nursery?.collection?.supply ?? 555;
  const boundary = mode === 'incubator' ? 'OPERATE' : 'OBSERVE ONLY';
  const liveState = quilLive?.state || 'disabled';
  const liveLabel = liveState === 'active'
    ? `LIVE ${number(quilLive?.freshObservations)}`
    : liveState === 'armed' ? 'LIVE ARMED' : liveState === 'misconfigured' ? 'LIVE ERROR' : 'LIVE GATE OFF';
  return `<section class='quil-modebar' aria-label='QUIL operating mode'>
    <div class='quil-mark'><i aria-hidden='true'>∿</i><span><strong>QUIL</strong><small>ONE TOOL // TWO SIGNAL FIELDS</small></span></div>
    <div class='quil-modes' role='tablist' aria-label='Choose QUIL field'>
      <button type='button' role='tab' data-quil-mode='incubator' aria-selected='${mode === 'incubator'}'><span>ARTIST WAVIDs</span><b>${number(wavidCount)}</b></button>
      <button type='button' role='tab' data-quil-mode='nursery' aria-selected='${mode === 'nursery'}'><span>GENESIS 555</span><b>${number(genesisCount)}</b></button>
    </div>
    <div class='quil-capabilities' aria-label='Shared QUIL capabilities'><strong class='quil-live-badge ${escapeHtml(liveState)}'><i></i>${escapeHtml(liveLabel)}</strong><span>ANATOMY</span><span>LIFECYCLE</span></div>
    <strong class='quil-boundary ${mode === 'incubator' ? 'operate' : 'observe'}'><i></i>${boundary}</strong>
  </section>`;
}

function renderQuilLiveObservation(kind, id) {
  const subject = quilLive?.subjects?.find((entry) => entry.kind === kind && entry.id === id);
  if (!subject) {
    const dormantLabel = quilLive?.state === 'armed'
      ? 'LIVE ARMED // AWAITING SUBJECT SIGNAL'
      : quilLive?.state === 'active' ? 'LIVE ACTIVE // NO SIGNAL FOR THIS WAVFORM' : 'LIVE GATE OFF // INTEGRATION READY';
    return `<div class='quil-live-observation dormant' role='status'><div><i></i><strong>LIVE</strong><span>${escapeHtml(dormantLabel)}</span></div></div>`;
  }
  const source = quilLive.sources?.find((entry) => entry.id === subject.sourceId);
  const signals = (subject.signals || []).slice(0, 4).map((signal) => `<span><small>${escapeHtml(signal.channel)}</small><b>${Math.round(Number(signal.value) * 100)}</b></span>`).join('');
  return `<div class='quil-live-observation' role='status' aria-label='Fresh live observation'>
    <div><i></i><strong>LIVE</strong><span>${escapeHtml(source?.label || subject.sourceId)}</span></div>
    <div>${signals}</div>
  </div>`;
}

async function switchQuilMode(mode) {
  if (!['incubator', 'nursery'].includes(mode) || mode === currentView) return;
  currentView = mode;
  window.history.replaceState(null, '', mode === 'incubator' ? '/' : '/?view=nursery');
  render();
  try {
    if (mode === 'nursery' && !nursery) await refreshNursery();
    if (mode === 'incubator' && !incubator) await refreshIncubator();
    if (!quilLive) await refreshQuilLive();
  } catch (error) {
    showNotice(error.message, true);
  }
  scheduleNurseryPoll();
}

function renderOverview() {
  const system = dashboard.system;
  const activeContent = state.contentPipeline.filter((item) => ['idea', 'creating', 'review'].includes(item.status)).length;
  const readyContent = state.contentPipeline.filter((item) => item.status === 'ready').length;
  const activity = state.activity.length
    ? state.activity.slice(0, 7).map((item) => `<div class="activity"><i></i><div><p>${escapeHtml(item.message)}</p><time>${escapeHtml(humanTime(item.timestamp))}</time></div></div>`).join('')
    : '<div class="empty">THE LOG IS QUIET.<br>Decisions and status changes will appear here.</div>';
  const snapshot = system.latestWaveWarzSnapshot;
  const featuredArtist = snapshot?.featuredArtist;
  const decisions = dashboard.journey.decisions.map((decision) => `
    <div class="decision-row">
      <span class="decision-name">${escapeHtml(decisionLabels[decision.key] || decision.key)}</span>
      <span class="decision-value ${decision.resolved ? '' : 'open'}">${escapeHtml(displayValue(decision.effectiveValue))}</span>
      ${statusPill(decision.resolved ? 'approved' : 'pending')}
    </div>`).join('');
  return `
    ${sectionIntro('Today’s operational picture', 'Canonical campaign records, working decisions, and review state in one private control room.')}
    <div class="stat-grid">
      ${statCard('Approved chapters', `${system.approvedChapters}/5`, 'Release Journey ready', 'violet')}
      ${statCard('In production', activeContent, 'Ideas, creating, and review', 'ember')}
      ${statCard('Ready to post', readyContent, 'Manual handoff packages', readyContent ? 'hot' : '')}
      ${statCard('Pending reviews', system.pendingApprovals, `${system.reviewVideos} review videos on disk`, 'violet')}
      ${statCard('Music decisions', system.pendingMusicReviews, 'THE DOOR REMEMBERS artist gates', system.pendingMusicReviews ? 'hot' : 'violet')}
    </div>
    <div class="overview-grid">
      <section class="panel">
        <div class="panel-head"><div><h3>Campaign decisions</h3><p>Overrides are operational notes. Canonical campaign files stay untouched.</p></div><button class="button" data-action="edit-decisions">Edit decisions</button></div>
        <div class="decision-list">${decisions}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Activity log</h3><p>Creative decisions, production movement, and manual posting records.</p></div><span class="panel-code">LOG // ${state.activity.length}</span></div>
        <div class="activity-list">${activity}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>WaveWarz intelligence</h3><p>Latest verified snapshot stored in the workspace.</p></div><span class="panel-code">READ ONLY</span></div>
        ${snapshot ? `<div class="decision-list">
          ${featuredArtist ? `
          <div class="decision-row"><span class="decision-name">Quick Battle record</span><span class="decision-value">${escapeHtml(featuredArtist.record)}</span>${statusPill(featuredArtist.freshness)}</div>
          <div class="decision-row"><span class="decision-name">Win rate</span><span class="decision-value">${escapeHtml(featuredArtist.name)}</span><span class="status-pill">${number(featuredArtist.battles)} battles</span></div>
          <div class="decision-row"><span class="decision-name">Indexed volume</span><span class="decision-value">${escapeHtml(`${featuredArtist.totalVolumeSol} SOL`)}</span><span class="status-pill">${number(featuredArtist.indexedSongs)} songs</span></div>
          ` : ''}
          <div class="decision-row"><span class="decision-name">Latest snapshot</span><span class="decision-value">${escapeHtml(snapshot.path)}</span>${statusPill('approved')}</div>
          <div class="decision-row"><span class="decision-name">Captured</span><span class="decision-value">${escapeHtml(humanTime(featuredArtist?.checkedAt || snapshot.updatedAt))}</span><span class="status-pill">${number(snapshot.count)} files</span></div>
        </div>` : '<div class="empty">NO LOCAL WAVEWARZ SNAPSHOT FOUND</div>'}
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>System boundary</h3><p>What this version deliberately does and does not do.</p></div><span class="panel-code">SAFE MODE</span></div>
        <div class="activity-list">
          <div class="activity"><i></i><div><p>Reads approved campaign manifests and asset registry from disk.</p></div></div>
          <div class="activity"><i></i><div><p>Records approvals without moving or promoting source files.</p></div></div>
          <div class="activity"><i></i><div><p>Builds complete post packages for manual scheduling on each social platform.</p></div></div>
          <div class="activity"><i></i><div><p>Listens only on this computer unless we explicitly redesign deployment.</p></div></div>
        </div>
      </section>
    </div>`;
}

const nurseryStateLabels = {
  planned: 'Planned',
  queued: 'Queued',
  spawning: 'Spawning',
  incubating: 'Incubating',
  verified: 'Technical pass',
  adjudicated: 'Pass via adjudication',
  failed: 'Failed'
};

const nurseryPaletteIds = new Set([
  'living-aqua', 'oxide-amber', 'bruised-violet', 'viridian-archive',
  'cerulean-static', 'rose-cathode', 'sodium-ghost', 'sulfur-bloom',
  'ice-filament', 'bone-phosphor', 'carmine-fault', 'ultraviolet-ash'
]);

function nurseryPaletteClass(organism) {
  const palette = organism?.palette?.id;
  return nurseryPaletteIds.has(palette) ? `palette-${palette}` : 'palette-default';
}

function nurseryStateLabel(stateName) {
  return nurseryStateLabels[stateName] || stateName || 'Unknown';
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}

async function refreshNursery({ renderAfter = true, force = false } = {}) {
  const controller = new AbortController();
  nurseryRequest?.abort();
  nurseryRequest = controller;
  const headers = {};
  if (!force && nurseryEtag) headers['If-None-Match'] = nurseryEtag;
  try {
    const response = await fetch('/api/wavforms', { headers, signal: controller.signal });
    if (response.status === 304) return false;
    if (response.status === 401) {
      applyAccessState({ ...accessState, authenticated: false });
      throw new Error('Your ArtistOS session has expired');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'WavForms observation failed');
    nurseryEtag = response.headers.get('etag');
    nursery = payload;
    if (nurseryPlanSha256 && nurseryPlanSha256 !== nursery.collection?.planSha256) {
      nurseryAnatomyCache.clear();
      nurseryAnatomyPart = null;
      nurseryAnatomyFeature = null;
    }
    nurseryPlanSha256 = nursery.collection?.planSha256 || null;
    const activeRoot = document.querySelector('[data-nursery-root]');
    const userInteracting = Boolean(activeRoot?.contains(document.activeElement));
    if (nurseryFollowLive && !userInteracting) {
      nurserySelectedEdition = nursery.queue?.currentEdition
        || nursery.organisms?.find((organism) => ['spawning', 'incubating', 'queued'].includes(organism.state))?.edition
        || nursery.organisms?.findLast((organism) => ['verified', 'adjudicated'].includes(organism.state))?.edition
        || nursery.organisms?.[0]?.edition
        || null;
    } else if (!nursery.organisms?.some((organism) => organism.edition === nurserySelectedEdition)) {
      nurserySelectedEdition = nursery.organisms?.[0]?.edition || null;
    }
    if (nurserySelectedEdition) await refreshNurseryAnatomy(nurserySelectedEdition);
    const currentRoot = document.querySelector('[data-nursery-root]');
    const focusInside = Boolean(currentRoot?.contains(document.activeElement));
    const selectedOrganism = nursery.organisms?.find((organism) => organism.edition === nurserySelectedEdition);
    const preserveDom = shouldPreserveWavformNurseryDom({
      renderedEdition: currentRoot?.dataset.selectedEdition,
      selectedEdition: nurserySelectedEdition,
      renderedArtifactSignature: currentRoot?.dataset.artifactSignature,
      selectedArtifactSignature: wavformArtifactSignature(selectedOrganism, nurseryAnimate)
    });
    if (renderAfter && currentView === 'nursery' && (!nurseryAnimate || nurseryFollowLive) && !preserveDom) render();
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    if (!nursery) throw error;
    showNotice(`Nursery observation paused: ${error.message}`, true);
    return false;
  } finally {
    if (nurseryRequest === controller) nurseryRequest = null;
  }
}

function nurseryAnatomyCacheKey(edition) {
  return wavformAnatomyCacheKey(nursery?.collection?.planSha256, edition);
}

async function refreshNurseryAnatomy(edition, { force = false } = {}) {
  if (!/^\d{4}$/.test(edition || '')) return null;
  const cacheKey = nurseryAnatomyCacheKey(edition);
  if (!force && nurseryAnatomyCache.has(cacheKey)) return nurseryAnatomyCache.get(cacheKey);
  const controller = new AbortController();
  nurseryAnatomyRequest?.abort();
  nurseryAnatomyRequest = controller;
  try {
    const detail = await request(`/api/wavforms/anatomy?edition=${encodeURIComponent(edition)}`, {
      signal: controller.signal
    });
    const organism = nursery?.organisms?.find((candidate) => candidate.edition === edition);
    if (detail.edition !== edition || detail.materialFingerprint !== organism?.fingerprints?.material) {
      throw new Error('The anatomy response did not match the selected material identity');
    }
    nurseryAnatomyCache.set(cacheKey, detail);
    return detail;
  } catch (error) {
    if (error.name === 'AbortError') return null;
    showNotice(`Anatomy map unavailable: ${error.message}`, true);
    return null;
  } finally {
    if (nurseryAnatomyRequest === controller) nurseryAnatomyRequest = null;
  }
}

function scheduleNurseryPoll() {
  clearTimeout(nurseryPollTimer);
  nurseryPollTimer = null;
  if (currentView !== 'nursery') return;
  const delay = nursery?.queue?.live ? 3000 : 15000;
  nurseryPollTimer = setTimeout(async () => {
    try {
      await refreshNursery();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      scheduleNurseryPoll();
    }
  }, delay);
}

async function refreshIncubator({ renderAfter = true } = {}) {
  incubator = await request('/api/wavids');
  applyPhosphorTheme();
  if (renderAfter && currentView === 'incubator') render();
  return incubator;
}

async function refreshQuilLive({ renderAfter = true } = {}) {
  const previousSignature = JSON.stringify([quilLive?.state, quilLive?.freshObservations, quilLive?.subjects]);
  quilLive = await request('/api/quil/live');
  const nextSignature = JSON.stringify([quilLive?.state, quilLive?.freshObservations, quilLive?.subjects]);
  if (renderAfter && previousSignature !== nextSignature && ['incubator', 'nursery'].includes(currentView)) render();
  return quilLive;
}

function nurseryTrait(label, value) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
  return `<div class='nursery-trait'><div><span>${escapeHtml(label)}</span><b>${Number.isFinite(numeric) ? Math.round(safeValue * 100) : '—'}</b></div><meter min='0' max='1' value='${safeValue}'>${safeValue}</meter></div>`;
}

function nurseryPlaceholder() {
  return `<div class='nursery-signal-placeholder' aria-label='No verified visual artifact yet'>
    <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    <span>SIGNAL BODY HAS NOT REACHED THE VIEWING CHAMBER</span>
  </div>`;
}

function anatomyPoints(points = []) {
  return points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => `${Number(point.x).toFixed(3)},${Number(point.y).toFixed(3)}`)
    .join(' ');
}

function anatomyMarker(feature, active) {
  if (!Number.isFinite(feature?.center?.x) || !Number.isFinite(feature?.center?.y)) return '';
  const x = Number(feature.center.x).toFixed(3);
  const y = Number(feature.center.y).toFixed(3);
  const featureKey = escapeHtml(feature.id);
  return `<g class='nursery-anatomy-marker' data-anatomy-marker='${featureKey}' transform='translate(${x} ${y})' tabindex='${active ? '0' : '-1'}' role='button' aria-pressed='${nurseryAnatomyFeature === feature.id}' aria-label='Inspect ${escapeHtml(feature.label)}'>
    <path class='marker-leader' d='M 2.5 -2.5 L 5.7 -5.7 L 9.2 -5.7'></path><circle class='marker-target' r='4.4'></circle><circle class='marker-core' r='2.35'></circle><text y='.8'>${escapeHtml(feature.label)}</text>
  </g>`;
}

function renderNurseryAnatomyOverlay(detail) {
  const anatomy = detail?.anatomy;
  const map = anatomy?.map;
  if (!anatomy?.available || !map) return '';
  const body = anatomyPoints(map.bodyOutline);
  const cavities = (map.cavities || []).map((feature) => `
    <polyline class='nursery-anatomy-shape cavity-shape' points='${anatomyPoints(feature.outline)}'></polyline>
    ${anatomyMarker(feature, nurseryAnatomyPart === 'cavities')}`).join('');
  const bands = (map.bands || []).map((feature) => `
    <polyline class='nursery-anatomy-shape band-shape' points='${anatomyPoints(feature.points)}'></polyline>
    ${anatomyMarker(feature, nurseryAnatomyPart === 'bands')}`).join('');
  const nodes = (map.nodes || []).map((feature) => `
    <polyline class='nursery-anatomy-shape node-shape polarity-${feature.polarity === -1 ? 'negative' : 'positive'}' points='${anatomyPoints(feature.outline)}'></polyline>
    ${anatomyMarker(feature, nurseryAnatomyPart === 'nodes')}`).join('');
  const lobes = (map.lobes || []).map((feature) => `
    <polyline class='nursery-anatomy-shape lobe-shape' points='${anatomyPoints(feature.points)}'></polyline>
    ${anatomyMarker(feature, nurseryAnatomyPart === 'lobes')}`).join('');
  return `<svg class='nursery-anatomy-overlay' viewBox='0 0 100 100' preserveAspectRatio='xMidYMid meet' role='group' aria-label='Approximate material anatomy indicators'>
    <polyline class='nursery-anatomy-body-outline' points='${body}'></polyline>
    <g data-anatomy-layer='cavities' aria-hidden='${nurseryAnatomyPart !== 'cavities'}'>${cavities}</g>
    <g data-anatomy-layer='bands' aria-hidden='${nurseryAnatomyPart !== 'bands'}'>${bands}</g>
    <g data-anatomy-layer='nodes' aria-hidden='${nurseryAnatomyPart !== 'nodes'}'>${nodes}</g>
    <g data-anatomy-layer='lobes' aria-hidden='${nurseryAnatomyPart !== 'lobes'}'>${lobes}</g>
  </svg>`;
}

function anatomyCount(anatomy, part) {
  const value = anatomy?.counts?.[part] ?? anatomy?.[part];
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function anatomyCountCopy(value) {
  return value === null ? 'Unavailable' : `${value} mapped`;
}

function formatAnatomyPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatAnatomySol(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} SOL` : '—';
}

function safeAudiusHref(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'audius.co' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function anatomySourceCopy(feature) {
  const encoding = feature?.encoding;
  const source = encoding?.source;
  if (!encoding || !source) return null;
  if (encoding.sourceKind === 'wavewarz-quick-battle-song') {
    return {
      title: source.songTitle || 'Untitled song',
      summary: `${number(source.wins)}W–${number(source.losses)}L · ${number(source.battles)} battles · ${formatAnatomySol(source.totalVolumeSol)}`,
      label: 'WaveWarz song record'
    };
  }
  if (encoding.sourceKind === 'wavewarz-catalog-genre') {
    return {
      title: source.genre || 'Unspecified',
      summary: `${number(source.songs)} indexed ${Number(source.songs) === 1 ? 'song' : 'songs'} · ${number(source.dominantGenreSongs)} in dominant genre`,
      label: 'Catalog genre group'
    };
  }
  if (Number.isFinite(source.totalVolumeSol)) {
    return {
      title: `${number(source.wins)}W–${number(source.losses)}L`,
      summary: `${number(source.indexedSongs)} songs · ${formatAnatomySol(source.totalVolumeSol)}`,
      label: 'Quick Battle aggregate'
    };
  }
  return {
    title: `${number(source.wins)}W–${number(source.losses)}L`,
    summary: `${number(source.battles)} Quick Battles`,
    label: 'Quick Battle aggregate'
  };
}

function renderAnatomyEncodingLedger(detail) {
  const encoding = detail?.anatomy?.encoding;
  const quick = encoding?.checkpoint?.quickBattle;
  if (!encoding || !quick) return '';
  const checkedAt = encoding.checkpoint.checkedAt
    ? new Date(encoding.checkpoint.checkedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';
  const sourceHash = String(encoding.provenance?.sourceCanonicalSha256 || 'UNBOUND').slice(0, 16);
  return `<section class='wavid-source-ledger' aria-label='Hash-bound WaveWarz source mapped into this WavID'>
    <div class='wavid-source-ledger-head'><span>WAVEWARZ CHECKPOINT → MATERIAL-V1</span><strong>${escapeHtml(encoding.artist.displayName)}</strong></div>
    <div class='wavid-source-ledger-grid'>
      <span><small>SONGS</small><b>${number(quick.indexedSongs)}</b></span>
      <span><small>BATTLES</small><b>${number(quick.battles)}</b></span>
      <span><small>RECORD</small><b>${number(quick.wins)}–${number(quick.losses)}</b></span>
      <span><small>QB VOLUME</small><b>${escapeHtml(formatAnatomySol(quick.totalVolumeSol))}</b></span>
    </div>
    <p><b>${escapeHtml(encoding.mappingId)}</b><span>Frozen ${escapeHtml(checkedAt)} · SOURCE ${escapeHtml(sourceHash)}</span></p>
  </section>`;
}

function renderAnatomySystemMapping(part, detail) {
  const system = detail?.anatomy?.encoding?.systems?.[part];
  if (!system) return '';
  return `<p class='wavid-system-mapping'><strong>Data in.</strong> ${escapeHtml(system.inputs.join(' · '))}<br><strong>Form out.</strong> ${escapeHtml(system.outputs.join(' · '))}</p>`;
}

function renderAnatomyFeatureEncoding(feature) {
  const sourceCopy = anatomySourceCopy(feature);
  if (!sourceCopy) return '';
  const source = feature.encoding.source;
  const href = safeAudiusHref(source.musicLink);
  const transforms = (feature.encoding.transforms || []).map((transform) => `
    <li><span>${escapeHtml(transform.input)}</span><b>${escapeHtml(transform.output)}</b><small>${escapeHtml(transform.rule)} → ${escapeHtml(String(transform.value))}</small></li>`).join('');
  return `<div class='wavid-feature-source'>
    <span>${escapeHtml(sourceCopy.label)}</span>
    <strong>${escapeHtml(sourceCopy.title)}</strong>
    <p>${escapeHtml(sourceCopy.summary)}</p>
    ${href ? `<a href='${escapeHtml(href)}' target='_blank' rel='noreferrer'>Open Audius source ↗</a>` : ''}
    <ol>${transforms}</ol>
  </div>`;
}

function renderAnatomyRoster(part, detail) {
  const map = detail?.anatomy?.map;
  const features = map?.[part] || [];
  if (!features.length) return `<span class='nursery-anatomy-feature empty-feature'>No committed feature map is available.</span>`;
  return features.map((feature) => {
    let copy = '';
    if (part === 'cavities') copy = `source ${formatAnatomyPercent(feature.strength)} · bridge ${formatAnatomyPercent(feature.bridgePorosity)}`;
    if (part === 'bands') copy = `${feature.from} → ${feature.to} · field ${formatAnatomyPercent(feature.strength)} · width ${Number(feature.width).toFixed(3)}`;
    if (part === 'nodes') copy = `${feature.polarity > 0 ? '+' : '−'} circulation · field ${formatAnatomyPercent(feature.strength)} · radius ${Number(feature.radius).toFixed(3)}`;
    if (part === 'lobes') copy = `swell ${formatAnatomyPercent(feature.amplitude)} · concentration ${Number(feature.concentration).toFixed(2)}`;
    const sourceCopy = anatomySourceCopy(feature);
    return `<button type='button' class='nursery-anatomy-feature' data-anatomy-feature='${escapeHtml(feature.id)}' aria-pressed='${nurseryAnatomyFeature === feature.id}' aria-controls='nursery-anatomy-feature-card'>
      <b>${escapeHtml(feature.label)}${sourceCopy ? ` · ${escapeHtml(sourceCopy.title)}` : ''}</b>
      <span>${escapeHtml(sourceCopy?.summary || copy)}</span>
    </button>`;
  }).join('');
}

function findAnatomyFeature(detail, featureId) {
  const map = detail?.anatomy?.map;
  if (!map || !featureId) return null;
  for (const part of ['cavities', 'bands', 'nodes', 'lobes']) {
    const feature = (map[part] || []).find((candidate) => candidate.id === featureId);
    if (feature) return { part, feature, note: NURSERY_ANATOMY_NOTES[part] };
  }
  return null;
}

function anatomyFeatureMetric(part, feature) {
  if (part === 'cavities') return [
    ['Source', formatAnatomyPercent(feature.strength)],
    ['Porosity', formatAnatomyPercent(feature.bridgePorosity)],
    ['Flow', feature.polarity > 0 ? 'positive' : 'negative']
  ];
  if (part === 'bands') return [
    ['Route', `${feature.from} → ${feature.to}`],
    ['Field', formatAnatomyPercent(feature.strength)],
    ['Width', Number(feature.width).toFixed(3)]
  ];
  if (part === 'nodes') return [
    ['Flow', feature.polarity > 0 ? 'positive' : 'negative'],
    ['Field', formatAnatomyPercent(feature.strength)],
    ['Radius', Number(feature.radius).toFixed(3)]
  ];
  return [
    ['Swell', formatAnatomyPercent(feature.amplitude)],
    ['Focus', Number(feature.concentration).toFixed(2)],
    ['Role', 'envelope']
  ];
}

function renderAnatomyFeatureCard(detail) {
  const selection = findAnatomyFeature(detail, nurseryAnatomyFeature);
  if (!selection) return '';
  const { part, feature, note } = selection;
  const x = Math.max(4, Math.min(96, Number(feature.center.x)));
  const y = Math.max(4, Math.min(96, Number(feature.center.y)));
  const horizontal = x > 57 ? 'left' : 'right';
  const vertical = y > 62 ? 'above' : 'below';
  const metrics = anatomyFeatureMetric(part, feature).map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('');
  return `<aside class='nursery-anatomy-popover ${horizontal} ${vertical}' id='nursery-anatomy-feature-card' data-anatomy-popover role='region' aria-label='${escapeHtml(`${feature.label} anatomy card`)}'>
    <div class='nursery-anatomy-popover-head'><span>${escapeHtml(note.code)}</span><button type='button' data-anatomy-clear aria-label='Clear anatomy labels'>×</button></div>
    <h4><b>${escapeHtml(feature.label)}</b>${escapeHtml(note.label.slice(0, -1))}</h4>
    <p>${escapeHtml(note.definition)}</p>
    <div class='nursery-anatomy-popover-metrics'>${metrics}</div>
    ${renderAnatomyFeatureEncoding(feature)}
    <small>PRE-FILTER LOCATION // APPROXIMATE</small>
  </aside>`;
}

function renderAnatomyInspector(selected, detail) {
  const current = nurseryAnatomyPart;
  const buttons = Object.entries(NURSERY_ANATOMY_NOTES).map(([part, note]) => {
    const count = anatomyCount(selected?.anatomy, part);
    return `<button type='button' data-anatomy-part='${part}' aria-pressed='${current === part}' aria-controls='nursery-anatomy-notes' aria-label='${escapeHtml(`${note.label}, ${anatomyCountCopy(count)}. Inspect definition.`)}'>
      <strong>${count === null ? '—' : count}</strong><span>${escapeHtml(note.label)}</span>
    </button>`;
  }).join('');
  const panels = Object.entries(NURSERY_ANATOMY_NOTES).map(([part, note]) => {
    const count = anatomyCount(selected?.anatomy, part);
    return `<article class='nursery-anatomy-note' data-anatomy-note='${part}' ${current === part ? '' : 'hidden'}>
      <span>${escapeHtml(note.code)}</span><h5>${escapeHtml(note.label)} <small>${escapeHtml(anatomyCountCopy(count))}</small></h5>
      <p><strong>Structure.</strong> ${escapeHtml(note.definition)}</p>
      <p><strong>Function.</strong> ${escapeHtml(note.function)}</p>
      ${renderAnatomySystemMapping(part, detail)}
      <div class='nursery-anatomy-features'>${renderAnatomyRoster(part, detail)}</div>
    </article>`;
  }).join('');
  const unavailable = selected?.anatomy?.available === false;
  return `<div class='nursery-anatomy-inspector' data-nursery-anatomy-inspector>
    ${renderAnatomyEncodingLedger(detail)}
    <div class='nursery-anatomy-toolbar'>
      <span>ANATOMY LENS</span>
      <button type='button' class='nursery-clear-view' data-anatomy-clear aria-label='Hide the anatomy overlay and return to the unobstructed WavForm.' aria-disabled='${!current}'><i aria-hidden='true'></i>${current ? 'Clear specimen view' : 'Specimen view clear'}</button>
    </div>
    <div class='nursery-anatomy' role='group' aria-label='Inspect material anatomy'>${buttons}</div>
    <div class='nursery-anatomy-notes' id='nursery-anatomy-notes'>
      <div class='nursery-anatomy-prompt' data-anatomy-note='default' ${current ? 'hidden' : ''}>
        <span>MATERIAL-V1 // PRE-FILTER MAP</span>
        <p>${unavailable ? 'No trusted material map is available for this edition.' : 'Select a body system to reveal its static material map and encoded parameters.'}</p>
      </div>
      ${panels}
      <p class='nursery-anatomy-boundary'>Pre-filter material map—not frame tracking. Motion, signal faults, and analog displacement can shift visible traces. These features do not indicate health, awareness, rarity, rank, or value. Width and radius use normalized material-space values.</p>
      <span class='sr-only' aria-live='polite' data-anatomy-live>${current ? `${NURSERY_ANATOMY_NOTES[current].label} selected.` : 'No anatomy category selected.'}</span>
    </div>
  </div>`;
}

function selectNurseryAnatomy(part) {
  if (part !== null && !NURSERY_ANATOMY_NOTES[part]) return;
  nurseryAnatomyPart = part;
  const currentDetail = currentView === 'incubator'
    ? wavidAnatomyDetail
    : nurseryAnatomyCache.get(nurseryAnatomyCacheKey(nurserySelectedEdition));
  if (!part) nurseryAnatomyFeature = null;
  if (part) {
    const selection = normalizeWavformAnatomySelection({
      part,
      featureId: nurseryAnatomyFeature,
      map: currentDetail?.anatomy?.map
    });
    nurseryAnatomyPart = selection.part;
    nurseryAnatomyFeature = selection.featureId;
  }
  const root = document.querySelector('[data-quil-anatomy-root]');
  if (!root) return;
  const well = root.querySelector('.nursery-media-well');
  if (well) {
    if (part) well.dataset.anatomyMode = part;
    else delete well.dataset.anatomyMode;
    well.querySelectorAll('[data-anatomy-layer]').forEach((layer) => {
      const active = layer.dataset.anatomyLayer === part;
      layer.setAttribute('aria-hidden', String(!active));
      layer.querySelectorAll('[data-anatomy-marker]').forEach((marker) => {
        marker.setAttribute('tabindex', active ? '0' : '-1');
      });
    });
  }
  root.querySelectorAll('[data-anatomy-part]').forEach((button) => {
    const active = button.dataset.anatomyPart === part;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('active', active);
  });
  root.querySelectorAll('[data-anatomy-feature]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.anatomyFeature === nurseryAnatomyFeature));
  });
  root.querySelectorAll('[data-anatomy-note]').forEach((panel) => {
    panel.hidden = part ? panel.dataset.anatomyNote !== part : panel.dataset.anatomyNote !== 'default';
  });
  const clearButton = root.querySelector('[data-nursery-anatomy-inspector] [data-anatomy-clear]');
  if (clearButton) {
    clearButton.setAttribute('aria-disabled', String(!part));
    clearButton.innerHTML = `<i aria-hidden='true'></i>${part ? 'Clear specimen view' : 'Specimen view clear'}`;
  }
  refreshAnatomyPopover(currentDetail);
  const live = root.querySelector('[data-anatomy-live]');
  if (live) live.textContent = part ? `${NURSERY_ANATOMY_NOTES[part].label} selected. Indicators shown on the material map.` : 'Anatomy overlay cleared. Artwork unobstructed.';
}

function refreshAnatomyPopover(detail) {
  const viewer = document.querySelector('[data-quil-anatomy-root] .quil-anatomy-viewer');
  const well = viewer?.querySelector('.nursery-media-well');
  if (!well || !viewer) return;
  viewer.querySelector('[data-anatomy-popover]')?.remove();
  const card = renderAnatomyFeatureCard(detail);
  if (card) well.insertAdjacentHTML('afterend', card);
  viewer.querySelector('[data-anatomy-popover] [data-anatomy-clear]')?.addEventListener('click', () => {
    selectNurseryAnatomy(null);
    document.querySelector('[data-nursery-anatomy-inspector]')?.focus({ preventScroll: true });
  });
  well.querySelectorAll('[data-anatomy-marker]').forEach((marker) => {
    const selected = marker.dataset.anatomyMarker === nurseryAnatomyFeature;
    marker.classList.toggle('selected', selected);
    marker.setAttribute('aria-pressed', String(selected));
  });
}

function selectNurseryAnatomyFeature(featureId) {
  const detail = currentView === 'incubator'
    ? wavidAnatomyDetail
    : nurseryAnatomyCache.get(nurseryAnatomyCacheKey(nurserySelectedEdition));
  const selection = findAnatomyFeature(detail, featureId);
  if (!selection) return;
  nurseryAnatomyPart = selection.part;
  nurseryAnatomyFeature = selection.feature.id;
  selectNurseryAnatomy(selection.part);
}

function renderWavFormsNursery() {
  if (!nursery) {
    return `${renderQuilModeBar('nursery')}<div class='loading-panel'><div class='loader'></div><p>OPENING THE GENESIS FIELD</p></div>`;
  }
  if (!nursery.available) {
    return `${renderQuilModeBar('nursery')}${sectionIntro('Genesis 555', 'The optional local Genesis pack is not installed in this workspace. The rest of QUIL remains available.')}
      <div class='empty'>NO WAVFORMS GENESIS PLAN FOUND<br>Nothing was created or changed.</div>`;
  }

  const currentEdition = nursery.queue?.currentEdition;
  const selected = nursery.organisms.find((organism) => organism.edition === nurserySelectedEdition)
    || nursery.organisms.find((organism) => organism.edition === currentEdition)
    || nursery.organisms[0];
  const query = nurseryQuery.trim().toLowerCase();
  const filtered = nursery.organisms.filter((organism) => {
    const stateMatch = nurseryFilter === 'all'
      || (nurseryFilter === 'active' && ['queued', 'spawning', 'incubating'].includes(organism.state))
      || organism.state === nurseryFilter;
    if (!stateMatch) return false;
    if (!query) return true;
    return [organism.edition, organism.title, organism.role, organism.bodyPlan, organism.palette?.name]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / NURSERY_PAGE_SIZE));
  nurseryPage = Math.min(nurseryPage, pageCount - 1);
  const pageStart = nurseryPage * NURSERY_PAGE_SIZE;
  const pageOrganisms = filtered.slice(pageStart, pageStart + NURSERY_PAGE_SIZE);
  const technicalTotal = nursery.counts.verified + nursery.counts.adjudicated;
  const percent = ((technicalTotal / nursery.collection.supply) * 100).toFixed(1);
  const activeCount = nursery.counts.queued + nursery.counts.spawning + nursery.counts.incubating;
  const progress = nursery.queue?.progress;
  const progressLabel = progress?.percent === null || progress?.percent === undefined
    ? progress?.phase || 'Waiting for renderer evidence'
    : `${progress.phase} // ${progress.percent}%`;
  const selectedIsCurrent = selected?.edition === currentEdition;
  const paletteClass = nurseryPaletteClass(selected);
  const anatomyDetail = selected?.edition ? nurseryAnatomyCache.get(nurseryAnatomyCacheKey(selected.edition)) : null;
  if (nurseryAnatomyPart) {
    const selection = normalizeWavformAnatomySelection({
      part: nurseryAnatomyPart,
      featureId: nurseryAnatomyFeature,
      map: anatomyDetail?.anatomy?.map
    });
    nurseryAnatomyPart = selection.part;
    nurseryAnatomyFeature = selection.featureId;
  }
  const anatomyMode = nurseryAnatomyPart ? ` data-anatomy-mode='${nurseryAnatomyPart}'` : '';
  const media = nurseryAnimate && selected?.artifacts.video.available
    ? `<video class='nursery-media' src='${escapeHtml(selected.artifacts.video.url)}' ${selected.artifacts.poster.available ? `poster='${escapeHtml(selected.artifacts.poster.url)}'` : ''} autoplay muted loop playsinline preload='metadata' aria-label='Silent loop for ${escapeHtml(selected.name)}'></video>`
    : selected?.artifacts.poster.available
      ? `<img class='nursery-media' src='${escapeHtml(selected.artifacts.poster.url)}' alt='Static poster for ${escapeHtml(selected.name)}' loading='eager'>`
      : nurseryPlaceholder();
  const stateFilters = ['all', 'active', 'verified', 'adjudicated', 'incubating', 'spawning', 'queued', 'failed', 'planned'];
  const filterButtons = stateFilters.map((filter) => {
    const label = filter === 'all' ? 'All' : filter === 'active' ? 'Active' : nurseryStateLabel(filter);
    return `<button class='filter ${nurseryFilter === filter ? 'active' : ''}' data-nursery-state='${filter}' aria-pressed='${nurseryFilter === filter}'>${escapeHtml(label)}</button>`;
  }).join('');
  const specimenCells = pageOrganisms.length ? pageOrganisms.map((organism) => `
    <button class='nursery-cell ${nurseryPaletteClass(organism)} state-${organism.state} ${organism.edition === selected?.edition ? 'selected' : ''}'
      data-nursery-edition='${organism.edition}'
      aria-label='${escapeHtml(organism.name)}, ${escapeHtml(nurseryStateLabel(organism.state))}, review draft'
      aria-pressed='${organism.edition === selected?.edition}'>
      <span class='nursery-cell-orb' aria-hidden='true'></span>
      <b>${organism.edition}</b>
      <small>${escapeHtml(nurseryStateLabel(organism.state))}</small>
    </button>`).join('') : `<div class='empty nursery-no-results'>NO SPECIMENS MATCH THIS SIGNAL</div>`;
  const traitLabels = {
    analogAmount: 'Analog grain', asymmetry: 'Asymmetry', filamentDensity: 'Filament density',
    membraneTension: 'Membrane tension', memory: 'Persistence', nervousness: 'Nervousness',
    collapse: 'Collapse', dropout: 'Dropout', hold: 'Hold', interruption: 'Interruption'
  };
  const traits = Object.entries(selected?.traits || {}).map(([key, value]) => nurseryTrait(traitLabels[key] || key, value)).join('');
  const currentActions = currentEdition && !nurseryFollowLive
    ? `<button class='button' data-nursery-action='follow-live'>Return to live signal</button>`
    : '';
  const animateDisabled = !selected?.artifacts.video.available;
  const animationLabel = animateDisabled ? 'Loop awaiting incubation' : nurseryAnimate ? 'Use static poster' : 'Animate verified loop';
  const queueLabel = nursery.queue.live
    ? `LOCAL RENDER ACTIVE // BATCH ${String(nursery.queue.currentBatch?.start || '').padStart(4, '0')}–${String(nursery.queue.currentBatch?.end || '').padStart(4, '0')}`
    : `QUEUE ${String(nursery.queue.status || 'idle').toUpperCase()}`;
  const genesisHasAssets = selected?.artifacts?.poster?.available || selected?.artifacts?.video?.available;
  const genesisVerified = ['verified', 'adjudicated'].includes(selected?.state) || genesisHasAssets;
  const genesisRendering = ['queued', 'spawning', 'incubating'].includes(selected?.state) || genesisVerified;
  const genesisLifecycle = [
    ['SELECT', Boolean(selected)],
    ['DEFINE', Boolean(selected)],
    ['RENDER', genesisRendering],
    ['VERIFY', genesisVerified],
    ['ASSETS', Boolean(genesisHasAssets)]
  ];
  const genesisCurrentStep = Math.max(0, genesisLifecycle.findIndex(([, done]) => !done));
  const genesisLifecycleMarkup = genesisLifecycle.map(([label, done], index) => `<div class='${done ? 'done' : index === genesisCurrentStep ? 'current' : ''}'><i></i><span>${label}</span></div>`).join('');
  const genesisProgress = genesisVerified ? 100 : selectedIsCurrent && Number.isFinite(progress?.percent) ? progress.percent : genesisRendering ? 54 : 28;

  return `
    ${renderQuilModeBar('nursery')}
    <div class='nursery-boundary'><i></i><strong>LOCAL // PRIVATE // REVIEW DRAFTS</strong><span>Read-only production observation. No canon, publication, or mint action exists here.</span></div>
    ${sectionIntro('The Genesis Array', nursery.collection.lore, `<div class='nursery-intro-actions'><button class='button' data-nursery-action='refresh'>Refresh observation</button>${currentActions}</div>`)}
    <div class='stat-grid nursery-stats'>
      ${statCard('Technical passes', technicalTotal, `${percent}% of 555 with qualifying local QA`, 'violet')}
      ${statCard('In active chamber', activeCount, 'Queued, spawning, or incubating', activeCount ? 'hot' : '')}
      ${statCard('Deterministic plans', nursery.counts.planned, 'Definitions waiting outside active batch')}
      ${statCard('Failures', nursery.counts.failed, 'Token-specific; never inferred from a whole batch', nursery.counts.failed ? 'ember' : '')}
    </div>

    <section class='nursery-chamber ${paletteClass}' data-nursery-root data-quil-anatomy-root data-selected-edition='${escapeHtml(selected?.edition)}' data-artifact-signature='${escapeHtml(wavformArtifactSignature(selected, nurseryAnimate))}'>
      <div class='nursery-chamber-head'>
        <div><p class='eyebrow'>INCUBATION CHAMBER // ${escapeHtml(selected?.edition)}</p><h3>${escapeHtml(selected?.title)}</h3></div>
        <div class='nursery-chamber-status'><span class='status-pill ${escapeHtml(selected?.state)}'>${escapeHtml(nurseryStateLabel(selected?.state))}</span><span>${escapeHtml(queueLabel)}</span></div>
      </div>
      ${renderQuilLiveObservation('genesis-wavform', selected?.edition)}
      <div class='nursery-chamber-grid'>
        <div class='nursery-viewer quil-anatomy-viewer'>
          <div class='nursery-media-well'${anatomyMode}>${media}${renderNurseryAnatomyOverlay(anatomyDetail)}<div class='nursery-scan' aria-hidden='true'></div><span class='nursery-draft-mark'>UNSTAMPED REVIEW DRAFT</span></div>
          ${renderAnatomyFeatureCard(anatomyDetail)}
          ${selectedIsCurrent && progress ? `<div class='nursery-progress' role='status' aria-live='polite'><div><span>${escapeHtml(progressLabel)}</span><b>${progress?.current && progress?.total ? `${progress.current}/${progress.total}` : 'OBSERVING'}</b></div><progress max='100' value='${progress.percent || 0}'>${progress.percent || 0}%</progress></div>` : ''}
          <div class='wavid-progress-block quil-genesis-progress'>
            <div class='wavid-progress-head'><strong>${escapeHtml(genesisVerified ? 'ASSETS READY' : nurseryStateLabel(selected?.state).toUpperCase())}</strong><span>${genesisProgress}%</span></div>
            <div class='wavid-progress-track'><i style='width:${genesisProgress}%'></i></div>
            <div class='wavid-lifecycle'>${genesisLifecycleMarkup}</div>
          </div>
          <div class='nursery-media-actions'>
            <button class='button ${!animateDisabled && !nurseryAnimate ? 'primary' : ''}' data-nursery-action='toggle-animation' ${animateDisabled ? 'disabled' : ''}>${escapeHtml(animationLabel)}</button>
            ${selected?.artifacts.poster.available ? `<a class='button ghost' href='${escapeHtml(selected.artifacts.poster.url)}' target='_blank' rel='noreferrer'>Open full poster</a>` : ''}
          </div>
        </div>
        <div class='nursery-specimen'>
          <div class='nursery-specimen-title'><div><span>WAVFORM ${escapeHtml(selected?.edition)}</span><h4>${escapeHtml(selected?.name)}</h4></div><span class='nursery-palette-chip'>${escapeHtml(selected?.palette?.name)}</span></div>
          <div class='nursery-facts'>
            <div><span>Body plan</span><b>${escapeHtml(selected?.bodyPlan)}</b></div>
            <div><span>Form / role</span><b>${escapeHtml(`${selected?.form} / ${selected?.role}`)}</b></div>
            <div><span>Loop</span><b>${escapeHtml(`${selected?.timing?.seconds}s · ${selected?.timing?.frames}f`)}</b></div>
            <div><span>BPM</span><b>${escapeHtml(selected?.timing?.effectiveBpm)}</b><small>duration parameter only</small></div>
          </div>
          ${renderAnatomyInspector(selected, anatomyDetail)}
          <div class='nursery-traits'>${traits}</div>
          <div class='nursery-hash'><span>Material fingerprint</span><code>${escapeHtml(selected?.fingerprints?.material || 'UNAVAILABLE')}</code></div>
        </div>
      </div>
    </section>

    <section class='panel nursery-systems-panel'>
      <div class='panel-head'><div><h3>Body systems field guide</h3><p>The rest of the organism, translated from the active visual engine—not speculative biology.</p></div><span class='panel-code'>MATERIAL-V1</span></div>
      <div class='nursery-systems-grid'>
        <article><span>Body family</span><h4>Generator class</h4><p>The family name classifies a silhouette recipe. It does not invoke a separate renderer or imply species, rarity, or rank.</p></article>
        <article><span>Filament field</span><h4>Shared trace body</h4><p>Waveform rows are the visible material. They share one clock and one deformation field; they are not independent hairs.</p></article>
        <article><span>Activation + shuttle</span><h4>Shared motion field</h4><p>Activation fronts and refractory wakes travel from cavity and node sources through a reversible shuttle field.</p></article>
        <article><span>Membrane tension</span><h4>Field cohesion</h4><p>Higher tension restrains row bunching, waveform excursion, and radial expansion. It is not health or strength.</p></article>
        <article><span>Signal faults</span><h4>Loop interruptions</h4><p>Five seeded events can tear, hold, collapse, or drop trace packets. They are acquisition events—not injuries.</p></article>
        <article><span>Persistence</span><h4>Phosphor afterimage</h4><p>Two- and six-frame traces follow the current body. “Memory” means phosphor persistence—not thought or stored user data.</p></article>
        <article><span>Analog optics</span><h4>Image formation</h4><p>Grain, bloom, scan texture, and displacement are applied after anatomy, so the map is intentionally approximate.</p></article>
        <article><span>Loop clock</span><h4>BPM sets duration</h4><p>BPM determines loop duration only. It does not trigger a cavity, band, node, or lobe. Recovery, respiration beats, and retrace are inactive reserves.</p></article>
      </div>
    </section>

    <section class='panel nursery-truth-panel'>
      <div class='panel-head'><div><h3>Independent truth axes</h3><p>A render can pass technically without becoming canon, public, or minted.</p></div><span class='panel-code'>NO INHERITANCE</span></div>
      <div class='nursery-truth-grid'>
        <div><span>Definition</span><strong>Deterministic definition locked</strong><small>${escapeHtml(selected?.bodyPlan)}</small></div>
        <div><span>Production</span><strong>${escapeHtml(nurseryStateLabel(selected?.state))}</strong><small>${escapeHtml(selected?.production?.receiptStatus)}</small></div>
        <div><span>QA</span><strong>${selected?.qa?.adjudicated ? 'Exact-hash seam adjudication' : escapeHtml(selected?.qa?.status)}</strong><small>${selected?.qa?.adjudicated ? 'Loop seam only; invalid if bytes change' : 'Local technical evidence'}</small></div>
        <div><span>Artist / canon</span><strong>Review draft</strong><small>No exact-artifact canon approval recorded</small></div>
        <div><span>Publication</span><strong>Not evaluated</strong><small>Local files are not publication evidence</small></div>
        <div><span>Mint</span><strong>Not evaluated</strong><small>No on-chain evidence</small></div>
      </div>
    </section>

    <section class='panel nursery-array-panel'>
      <div class='panel-head'><div><h3>555 specimen positions</h3><p>Palette and body-plan occurrence are aesthetic supply facts—not rarity, rank, or value.</p></div><span class='panel-code'>${number(filtered.length)} MATCHING</span></div>
      <div class='nursery-toolbar'>
        <div class='filters'>${filterButtons}</div>
        <label class='nursery-search'><span>Search the array</span><input type='search' value='${escapeHtml(nurseryQuery)}' placeholder='Edition, name, body, palette' data-nursery-search></label>
      </div>
      <div class='nursery-lifecycle' aria-label='Collection lifecycle counts'>
        ${['planned', 'queued', 'spawning', 'incubating', 'verified', 'adjudicated', 'failed'].map((stateName) => `<div class='state-${stateName}'><span>${escapeHtml(nurseryStateLabel(stateName))}</span><strong>${number(nursery.counts[stateName])}</strong></div>`).join('')}
      </div>
      <div class='nursery-array' role='group' aria-label='WavForms specimen array page ${nurseryPage + 1} of ${pageCount}'>${specimenCells}</div>
      <div class='nursery-pagination'>
        <button class='button' data-nursery-page='prev' ${nurseryPage === 0 ? 'disabled' : ''}>Previous field</button>
        <span>POSITIONS ${filtered.length ? pageStart + 1 : 0}–${Math.min(pageStart + NURSERY_PAGE_SIZE, filtered.length)} // ${filtered.length} · PAGE ${nurseryPage + 1}/${pageCount}</span>
        <button class='button' data-nursery-page='next' ${nurseryPage >= pageCount - 1 ? 'disabled' : ''}>Next field</button>
      </div>
    </section>

    <section class='nursery-lore-grid'>
      <article class='panel nursery-lore'><p class='eyebrow'>ESTABLISHED COLLECTION LAW</p><blockquote>${escapeHtml(nursery.collection.lore)}</blockquote><p>Each WavForm is a deterministic signal-body: one anatomy, one closed loop, one field of material traces moving through interruption, persistence, and return. Nothing inside a WavForm moves alone.</p></article>
      <article class='panel nursery-reserve'><p class='eyebrow'>THE UNHEARD // RESERVED</p><h3>AI companion not implemented</h3><p>A future companion may read a WavForm's deterministic profile and compose music in response. That possibility is reserved. This Nursery does not claim, simulate, or activate it.</p><span>UTILITY // NONE ACTIVE</span></article>
    </section>`;
}

function wavidRecord(record = {}) {
  const status = record.status === 'matched-by-public-name' || record.status === 'observed'
    ? `${number(record.wins)}–${number(record.losses)}${record.draws ? `–${number(record.draws)}` : ''}`
    : 'UNOBSERVED';
  return status;
}

function renderWavIdIncubator() {
  if (!incubator) {
    return `${renderQuilModeBar('incubator')}<div class='loading-panel'><div class='loader'></div><p>OPENING THE ARTIST WAVID FIELD</p></div>`;
  }
  const roster = incubator.roster || { available: false, artists: [], counts: {} };
  const query = wavidQuery.trim().toLowerCase();
  const searched = (roster.artists || []).filter((artist) => !query || [
    artist.displayName,
    artist.identity?.audiusHandle,
    artist.identity?.xHandle,
    artist.artistKey
  ].some((value) => String(value || '').toLowerCase().includes(query)));
  const activeBirths = [...(incubator.births || [])]
    .filter((birth) => birth.current !== false && !['retired', 'superseded'].includes(birth.status))
    .sort((a, b) => String(b.updatedAt || b.bornAt).localeCompare(String(a.updatedAt || a.bornAt)));
  if (!wavidSelectedArtistKey && activeBirths[0] && wavidRosterFilter === 'eligible') wavidRosterFilter = 'incubating';
  const candidates = searched.filter((artist) => {
    if (wavidRosterFilter === 'all') return true;
    if (wavidRosterFilter === 'incubating') return Boolean(artist.birthId);
    return artist.eligibility?.canBirth === true && !artist.birthId;
  });
  if (!wavidSelectedArtistKey) wavidSelectedArtistKey = activeBirths[0]?.artistKey || candidates[0]?.artistKey || searched[0]?.artistKey || null;
  const selectedArtist = (roster.artists || []).find((artist) => artist.artistKey === wavidSelectedArtistKey)
    || candidates[0]
    || searched[0]
    || null;
  const focusedBirth = selectedArtist
    ? (incubator.births || []).find((birth) => birth.id === selectedArtist.birthId || (birth.artistKey === selectedArtist.artistKey && birth.current !== false && !['retired', 'superseded'].includes(birth.status))) || null
    : activeBirths[0] || null;
  const focusedJob = (incubator.jobs || []).find((job) => job.id === `job:${focusedBirth?.job?.id}`) || null;
  const renderActive = focusedBirth && ['render-starting', 'rendering-poster', 'rendering-loop', 'technical-qa'].includes(focusedBirth.phase);
  const canRender = focusedBirth?.job
    && !focusedBirth.incubation?.technicalQaPassed
    && !['paused', 'retired', 'failed'].includes(focusedBirth.status)
    && !renderActive
    && focusedBirth.phase !== 'private-review';
  const selectedEligible = selectedArtist?.eligibility?.canBirth === true && !selectedArtist.birthId;
  const hasPoster = focusedJob?.artifacts?.poster?.available === true;
  const hasVideo = focusedJob?.artifacts?.video?.available === true;
  const hasAnatomy = focusedJob?.anatomy?.available === true && Boolean(focusedJob?.anatomy?.map);
  const hasAssets = hasPoster || hasVideo;
  wavidAnatomyDetail = hasAnatomy ? { anatomy: focusedJob.anatomy } : null;
  if (hasAnatomy && nurseryAnatomyPart) {
    const selection = normalizeWavformAnatomySelection({
      part: nurseryAnatomyPart,
      featureId: nurseryAnatomyFeature,
      map: focusedJob.anatomy.map
    });
    nurseryAnatomyPart = selection.part;
    nurseryAnatomyFeature = selection.featureId;
  }
  const chamberTitle = focusedBirth?.displayName || selectedArtist?.displayName || 'Select an artist';
  const initials = String(chamberTitle).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '∿';
  const chamberMood = focusedJob?.mood || focusedBirth?.mood;
  const swatches = chamberMood ? [chamberMood.accent, chamberMood.secondary, chamberMood.highlight, chamberMood.background]
    .filter(Boolean).map((color) => `<i style='--swatch:${escapeHtml(color)}'></i>`).join('') : '';

  const phaseProgress = {
    'source-bound': 24,
    defined: 38,
    'render-starting': 46,
    'rendering-poster': 58,
    'rendering-loop': 74,
    'technical-qa': 88,
    complete: 100,
    'private-review': 100
  };
  const progress = hasAssets ? 100 : focusedBirth ? (phaseProgress[focusedBirth.phase] || 32) : selectedArtist ? 10 : 0;
  const lifecycle = [
    ['ID', Boolean(selectedArtist)],
    ['BIRTH', Boolean(focusedBirth)],
    ['RENDER', Boolean(focusedBirth && (renderActive || hasAssets || focusedBirth.phase === 'private-review'))],
    ['VERIFY', Boolean(focusedBirth?.incubation?.technicalQaPassed || hasAssets)],
    ['ASSETS', hasAssets]
  ];
  const currentStep = Math.max(0, lifecycle.findIndex(([, done]) => !done));
  const lifecycleMarkup = lifecycle.map(([label, done], index) => `<div class='${done ? 'done' : index === currentStep ? 'current' : ''}'><i></i><span>${label}</span></div>`).join('');
  const actualMediaMode = wavidMediaMode === 'anatomy' && hasAnatomy
    ? 'anatomy'
    : wavidMediaMode === 'video' && hasVideo
      ? 'video'
      : hasPoster ? 'poster' : hasVideo ? 'video' : hasAnatomy ? 'anatomy' : null;
  const anatomyMode = nurseryAnatomyPart ? ` data-anatomy-mode='${nurseryAnatomyPart}'` : '';
  const mediaMarkup = actualMediaMode === 'poster'
    ? `<figure class='wavid-asset-view'><img src='${escapeHtml(focusedJob.artifacts.poster.url)}' alt='${escapeHtml(chamberTitle)} WavID private review poster'><figcaption>POSTER // PRIVATE REVIEW</figcaption></figure>`
    : actualMediaMode === 'video'
      ? `<figure class='wavid-asset-view'><video src='${escapeHtml(focusedJob.artifacts.video.url)}' autoplay loop muted playsinline controls aria-label='${escapeHtml(chamberTitle)} WavID private review loop'></video><figcaption>LOOP // PRIVATE REVIEW</figcaption></figure>`
      : actualMediaMode === 'anatomy'
        ? `<div class='wavid-anatomy-map nursery-media-well'${anatomyMode}>${hasPoster ? `<img class='nursery-media' src='${escapeHtml(focusedJob.artifacts.poster.url)}' alt='Material anatomy map for ${escapeHtml(chamberTitle)}'>` : nurseryPlaceholder()}${renderNurseryAnatomyOverlay(wavidAnatomyDetail)}<div class='nursery-scan' aria-hidden='true'></div><span class='nursery-draft-mark'>MATERIAL-V1 // PRIVATE REVIEW</span></div>`
        : `<div class='wavid-birth-visual ${renderActive ? 'is-active' : ''}'><div class='wavid-birth-glass'><span>${escapeHtml(initials)}</span><small>${escapeHtml(renderActive ? focusedBirth.phase : focusedBirth ? 'READY TO RENDER' : selectedArtist ? 'READY TO BIRTH' : 'SELECT ID')}</small></div><div class='wavid-birth-percent'>${progress}<small>%</small></div></div>`;
  const actionMarkup = !roster.available
    ? `<button class='button primary' data-wavid-sync>Sync artist IDs</button>`
    : renderActive
      ? `<span class='wavid-monitoring'><i></i>${escapeHtml(focusedBirth.phase)}</span>`
      : canRender
        ? `<button class='button primary' data-wavid-render='${escapeHtml(focusedBirth.id)}'>Start incubation</button>`
        : focusedBirth && hasAssets
          ? `<button class='button primary' data-wavid-update='${escapeHtml(focusedBirth.id)}'>Update WavID</button>`
        : selectedEligible
          ? `<button class='button primary' data-wavid-birth='${escapeHtml(selectedArtist.artistKey)}'>Birth this WavID</button>`
          : !selectedArtist
            ? `<button class='button' data-wavid-sync>Sync artist IDs</button>`
            : '';
  const secondaryActions = focusedBirth ? `
    ${focusedBirth.mood?.accent ? `<button class='small-button' data-wavid-mood='job:${escapeHtml(focusedBirth.job?.id)}'>Use color</button>` : ''}
    ${focusedBirth.status === 'incubating' && !renderActive && !hasAssets ? `<button class='small-button' data-wavid-action='pause' data-wavid-id='${escapeHtml(focusedBirth.id)}'>Pause</button>` : ''}
    ${focusedBirth.status === 'paused' ? `<button class='small-button advance' data-wavid-action='resume' data-wavid-id='${escapeHtml(focusedBirth.id)}'>Resume</button>` : ''}
    ${focusedBirth.status !== 'retired' && !renderActive ? `<button class='small-button' data-wavid-action='retire' data-wavid-id='${escapeHtml(focusedBirth.id)}'>Retire</button>` : ''}` : '';

  const rosterRows = candidates.length ? candidates.map((artist) => {
    const born = Boolean(artist.birthId);
    const eligible = artist.eligibility?.canBirth === true;
    const selected = artist.artistKey === selectedArtist?.artistKey;
    const artistInitials = String(artist.displayName).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return `<button class='wavid-artist-row ${eligible ? 'eligible' : ''} ${selected ? 'selected' : ''}' data-wavid-select='${escapeHtml(artist.artistKey)}' aria-pressed='${selected}'>
      <span class='wavid-avatar'>${escapeHtml(artistInitials)}</span>
      <span class='wavid-artist-id'><strong>${escapeHtml(artist.displayName)}</strong><code>${escapeHtml(artist.artistKey)}</code></span>
      <span class='wavid-row-state'>${born ? 'IN PROCESS' : eligible ? 'READY' : 'LOCKED'}<small>${number(artist.quickBattle?.indexedSongs)} SONGS</small></span>
    </button>`;
  }).join('') : `<div class='empty'>NO ARTIST IDS</div>`;

  return `
    ${renderQuilModeBar('incubator')}
    <div class='wavid-quickbar'>
      <div><strong>${number(incubator.counts.eligible)}</strong><span>READY</span></div>
      <div><strong>${number(incubator.counts.incubating)}</strong><span>INCUBATING</span></div>
      <div><strong>${number(incubator.counts.technicallyVerified)}</strong><span>ASSETS READY</span></div>
      <span class='wavid-local-state'><i></i>LOCAL · PRIVATE</span>
      <button class='small-button' data-wavid-sync>${roster.available ? 'Refresh IDs' : 'Sync IDs'}</button>
    </div>

    <section class='wavid-birth-workspace'>
      <aside class='panel wavid-picker'>
        <div class='wavid-picker-head'><div><span>ARTIST IDs</span><strong>${number(candidates.length)}</strong></div><label><span class='sr-only'>Search artist IDs</span><input type='search' value='${escapeHtml(wavidQuery)}' placeholder='Search name or ID' data-wavid-search></label></div>
        <div class='wavid-filters' aria-label='Artist ID filter'>${[['eligible','Ready'],['incubating','In process'],['all','All']].map(([value,label]) => `<button class='small-button ${wavidRosterFilter === value ? 'advance' : ''}' data-wavid-filter='${value}' aria-pressed='${wavidRosterFilter === value}'>${label}</button>`).join('')}</div>
        <div class='wavid-artist-list'>${rosterRows}</div>
      </aside>

      <section class='panel wavid-incubator-console' data-quil-anatomy-root aria-labelledby='incubator-core-title'>
        <header class='wavid-focus-head'>
          <div><span>${escapeHtml(selectedArtist?.artistKey || 'NO ARTIST ID SELECTED')}${focusedBirth ? ` · REV ${String(number(focusedBirth.lineage?.revision) || 1).padStart(2, '0')}` : ''}</span><h3 id='incubator-core-title'>${escapeHtml(chamberTitle)}</h3></div>
          <div>${statusPill(hasAssets ? 'assets-ready' : renderActive ? 'incubating' : (focusedBirth?.status || (selectedEligible ? 'ready' : 'standby')))}<div class='wavid-palette'>${swatches || '<i></i><i></i><i></i><i></i>'}</div></div>
        </header>
        ${renderQuilLiveObservation('artist-wavid', selectedArtist?.artistKey)}

        <div class='wavid-media-stage quil-anatomy-viewer'>
          ${mediaMarkup}
          ${actualMediaMode === 'anatomy' ? renderAnatomyFeatureCard(wavidAnatomyDetail) : ''}
          ${hasAssets || hasAnatomy ? `<div class='wavid-media-tabs'>${hasPoster ? `<button class='small-button ${actualMediaMode === 'poster' ? 'advance' : ''}' data-wavid-media='poster'>Poster</button>` : ''}${hasVideo ? `<button class='small-button ${actualMediaMode === 'video' ? 'advance' : ''}' data-wavid-media='video'>Loop</button>` : ''}${hasAnatomy ? `<button class='small-button ${actualMediaMode === 'anatomy' ? 'advance' : ''}' data-wavid-media='anatomy'>Anatomy</button>` : ''}</div>` : ''}
        </div>

        ${actualMediaMode === 'anatomy' ? `<div class='wavid-anatomy-panel'>${renderAnatomyInspector({ anatomy: focusedJob.anatomy }, wavidAnatomyDetail)}</div>` : ''}

        <div class='wavid-progress-block'>
          <div class='wavid-progress-head'><strong>${escapeHtml(hasAssets ? 'ASSETS READY' : (focusedBirth?.phase || (selectedArtist ? 'ID SELECTED' : 'SELECT AN ARTIST ID')))}</strong><span>${progress}%</span></div>
          <div class='wavid-progress-track'><i style='width:${progress}%'></i></div>
          <div class='wavid-lifecycle'>${lifecycleMarkup}</div>
        </div>

        <footer class='wavid-console-actions'>
          <div>${actionMarkup}</div>
          <div>${secondaryActions}${hasPoster ? `<a class='small-button' href='${escapeHtml(focusedJob.artifacts.poster.url)}' target='_blank' rel='noreferrer'>Open poster</a>` : ''}${hasVideo ? `<a class='small-button' href='${escapeHtml(focusedJob.artifacts.video.url)}' target='_blank' rel='noreferrer'>Open loop</a>` : ''}</div>
        </footer>
      </section>
    </section>
    <div class='wavid-safety-line'>SOURCE-BOUND · LOCAL RENDER · EXACT-ASSET REVIEW · NO AUTO-PUBLISH</div>`;
}

function renderJourney() {
  const chapters = dashboard.journey.chapters.map((chapter) => `
    <article class="chapter-card">
      <div class="chapter-visual">
        <img src="${escapeHtml(chapter.imageUrl)}" alt="${escapeHtml(chapter.trackTitle)} lead visual">
        <span class="chapter-number">${String(chapter.sequence).padStart(2, '0')}</span>
      </div>
      <div class="chapter-copy">
        <span class="log">${escapeHtml(chapter.logTitle)}</span>
        <h3>${escapeHtml(chapter.trackTitle)}</h3>
        <p>${escapeHtml(chapter.storyFunction)}</p>
        <div class="chapter-meta">${statusPill(chapter.status)}<a class="small-button" href="${mediaUrl(chapter.approvedMaster)}" target="_blank" rel="noreferrer">Open master</a></div>
      </div>
    </article>`).join('');
  return `
    ${sectionIntro('The serialized release journey', 'Five approved chapters form a deliberate emotional arc. Chapter six stays open until the next track earns its place.')}
    <div class="chapter-grid">
      ${chapters}
      <article class="chapter-card chapter-open"><strong>06</strong><h3>NEXT TRANSMISSION</h3><p>Track and story function not yet selected.</p></article>
    </div>`;
}

function musicDecisionLabel(item) {
  const value = item.decision?.status || 'pending';
  const movement = {
    pending: 'pending',
    approve: 'approved for construction',
    revise: 'revise',
    reject: 'rejected'
  };
  const comparison = {
    pending: 'pending',
    'choose-a': 'choose A',
    'choose-b': 'choose B',
    'reject-b': 'reject B',
    'reject-both': 'reject both'
  };
  return (item.kind === 'comparison' ? comparison : movement)[value] || value;
}

function musicPlayer(label, audioPath) {
  return `<div class="music-player">
    <span>${escapeHtml(label)}</span>
    <audio controls preload="metadata" src="${mediaUrl(audioPath)}"></audio>
  </div>`;
}

function renderMusicLab() {
  const lab = dashboard.musicLab;
  const movements = lab.items.filter((item) => item.kind === 'movement');
  const experiments = lab.items.filter((item) => item.kind === 'comparison');
  const movementDecisions = movements.filter((item) => item.decision?.status !== 'pending').length;
  const experimentDecisions = experiments.filter((item) => item.decision?.status !== 'pending').length;
  const cards = lab.items.map((item) => {
    const players = item.kind === 'comparison'
      ? item.candidates.map((candidate) => musicPlayer(candidate.label, candidate.audioPath)).join('')
      : musicPlayer(item.title, item.audioPath);
    const scoreRows = item.kind === 'movement'
      ? `<div class="music-score-grid">${lab.scoreDimensions.map((dimension) => {
          const score = item.decision?.scores?.[dimension.id];
          return `<div><span>${escapeHtml(dimension.label)}</span><strong>${score ? `${escapeHtml(score)}/5` : '—'}</strong></div>`;
        }).join('')}</div>`
      : '';
    return `<article class="music-card ${item.kind}">
      <div class="music-card-head">
        <div><span class="platform">${String(item.sequence).padStart(2, '0')} // ${escapeHtml(item.role)}</span><h3>${escapeHtml(item.title)}</h3></div>
        ${statusPill(musicDecisionLabel(item))}
      </div>
      <p class="music-summary">${escapeHtml(item.summary)}</p>
      <div class="music-players">${players}</div>
      ${scoreRows}
      <div class="listen-for"><strong>LISTEN FOR</strong><p>${escapeHtml(item.listenFor)}</p></div>
      ${item.decision?.note ? `<blockquote>${escapeHtml(item.decision.note)}</blockquote>` : ''}
      <div class="music-actions">
        <button class="button ${item.decision?.status === 'pending' ? 'primary' : ''}" data-music-review="${escapeHtml(item.id)}">${item.decision?.status === 'pending' ? 'Record decision' : 'Edit decision'}</button>
        <span class="status-pill">${escapeHtml(item.technicalStatus)}</span>
      </div>
    </article>`;
  }).join('');
  const diagnosticMode = lab.reviewMode === 'diagnostic-comparison';
  const introTitle = lab.introTitle || 'THE DOOR REMEMBERS // artist construction gate';
  const introText = lab.introText || 'Listen in sequence. Score all eight dimensions, then record one decision and one concrete sentence for every movement.';
  return `
    ${sectionIntro(introTitle, introText)}
    <div class="stat-grid">
      ${diagnosticMode
        ? statCard('Proof decisions', `${experimentDecisions}/${experiments.length}`, 'One bounded A/B process gate', experimentDecisions === experiments.length ? 'violet' : 'hot')
        : statCard('Movement decisions', `${movementDecisions}/${movements.length}`, 'All movements required before assembly', movementDecisions === movements.length ? 'violet' : 'hot')}
      ${diagnosticMode
        ? statCard('Candidate set', `${experiments.length * 2}`, 'Gain-matched blind copies', 'violet')
        : statCard('Optional experiments', `${experimentDecisions}/${experiments.length}`, 'Does not block assembly', 'violet')}
      ${statCard('Assembly', lab.assemblyStatus.toUpperCase(), lab.assemblyReason || 'Unlocks only after movement approvals')}
      ${statCard('Approval scope', diagnosticMode ? 'PROCESS PROOF' : 'CONSTRUCTION', diagnosticMode ? 'Not movement, master, or release approval' : 'Not master or release approval', 'ember')}
    </div>
    <section class="workflow-note"><strong>ARTIST STANDARD</strong><p>${escapeHtml(lab.approvalMeaning)} ${diagnosticMode ? 'Reject both if neither sounds like a record.' : `Construction approval requires at least ${escapeHtml(lab.minimumApprovalScore)}/5 in every dimension.`} Judge the record—not only technical cleanliness.</p></section>
    <div class="music-grid">${cards}</div>`;
}

function renderApprovals() {
  const filters = ['all', 'pending', 'approved', 'hold', 'superseded'];
  const visible = dashboard.approvals.filter((asset) => approvalFilter === 'all' || asset.status === approvalFilter);
  const cards = visible.length ? visible.map((asset) => `
    <article class="approval-card">
      <div class="approval-preview">
        ${asset.mediaType === 'image'
          ? `<img src="${mediaUrl(asset.path)}" alt="${escapeHtml(asset.name)}">`
          : '<div class="video-mark">▶</div>'}
      </div>
      <div class="approval-body">
        ${statusPill(asset.status)}
        <h3>${escapeHtml(asset.name)}</h3>
        <p>${escapeHtml(asset.role)}</p>
        <span class="asset-path" title="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</span>
        <div class="approval-actions">
          <a class="small-button" href="${mediaUrl(asset.path)}" target="_blank" rel="noreferrer">Inspect</a>
          <button class="small-button" data-approval="approved" data-path="${escapeHtml(asset.path)}">Approve</button>
          <button class="small-button" data-approval="hold" data-path="${escapeHtml(asset.path)}">Hold</button>
          <button class="small-button" data-approval="superseded" data-path="${escapeHtml(asset.path)}">Supersede</button>
        </div>
      </div>
    </article>`).join('') : '<div class="empty">NO ASSETS MATCH THIS FILTER</div>';
  return `
    ${sectionIntro('Review queue', 'Status changes here create an operational decision record only. Files are never moved into approved directories automatically.')}
    <div class="toolbar">
      <div class="filters">${filters.map((filter) => `<button class="filter ${approvalFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter}</button>`).join('')}</div>
      <span class="status-pill">${visible.length} visible</span>
    </div>
    <div class="approval-grid">${cards}</div>`;
}

function editMusicReview(id) {
  const item = dashboard.musicLab.items.find((entry) => entry.id === id);
  if (!item) return;
  const isComparison = item.kind === 'comparison';
  const resolutionQuestions = isComparison
    ? item.candidates.flatMap((candidate) => (
        candidate.musicalAnalysis?.artistResolutionRequired || []
      ).map((question) => ({ candidateLabel: candidate.label, question })))
    : [];
  const savedArtistResolutions = Array.isArray(item.decision?.artistResolutions)
    ? item.decision.artistResolutions
    : [];
  const options = isComparison
    ? [
        { value: 'pending', label: 'No decision yet' },
        { value: 'choose-a', label: 'Choose Candidate A' },
        { value: 'choose-b', label: 'Choose Candidate B' },
        { value: 'reject-both', label: 'Reject both candidates' }
      ]
    : [
        { value: 'pending', label: 'No decision yet' },
        { value: 'approve', label: 'Approve for construction' },
        { value: 'revise', label: 'Revise this movement' },
        { value: 'reject', label: 'Reject this movement' }
      ];
  openDialog({
    code: isComparison ? 'BLIND A/B PROOF' : `MOVEMENT ${String(item.sequence).padStart(2, '0')}`,
    title: item.title,
    fields: [
      { id: 'status', label: 'Artist decision', value: item.decision?.status || 'pending', options, type: 'select', full: true },
      ...(isComparison ? resolutionQuestions.map((resolution, index) => ({
        id: `resolution_${index}`,
        label: resolution.question,
        value: savedArtistResolutions.find(
          (entry) => entry.candidateLabel === resolution.candidateLabel && entry.question === resolution.question
        )?.confirmed === true
          ? 'yes'
          : savedArtistResolutions.find(
              (entry) => entry.candidateLabel === resolution.candidateLabel && entry.question === resolution.question
            )?.confirmed === false
            ? 'no'
            : '',
        options: [
          { value: '', label: 'Select listening answer' },
          { value: 'yes', label: 'Yes — confirmed by ear' },
          { value: 'no', label: 'No — not convincing' }
        ],
        type: 'select',
        full: true
      })) : []),
      ...(!isComparison ? dashboard.musicLab.scoreDimensions.map((dimension) => ({
        id: `score_${dimension.id}`,
        label: `${dimension.label} (1–5)`,
        value: item.decision?.scores?.[dimension.id] || '',
        options: [
          { value: '', label: 'Select score' },
          ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` }))
        ],
        type: 'select'
      })) : []),
      { id: 'note', label: isComparison ? 'Why A or B wins' : 'Groove, musicianship, motif, emotion, and transition note', value: item.decision?.note || '', type: 'textarea', full: true }
    ],
    submit: 'Record artist decision',
    onSubmit: async (data) => {
      const status = String(data.get('status') || 'pending');
      const note = String(data.get('note') || '').trim();
      const scores = {};
      const artistResolutions = resolutionQuestions.map((resolution, index) => {
        return {
          candidateLabel: resolution.candidateLabel,
          question: resolution.question,
          confirmed: parseResolutionAnswer(data.get(`resolution_${index}`))
        };
      });
      if (!isComparison) {
        for (const dimension of dashboard.musicLab.scoreDimensions) {
          const score = Number(data.get(`score_${dimension.id}`));
          if (Number.isInteger(score) && score >= 1 && score <= 5) scores[dimension.id] = score;
        }
      }
      if (status !== 'pending' && note.length < 20) {
        showNotice('Record a concrete listening note of at least 20 characters', true);
        return false;
      }
      if (isComparison && ['choose-a', 'choose-b'].includes(status)) {
        const selectedLabel = status === 'choose-a' ? 'Candidate A' : 'Candidate B';
        const selectedResolutions = artistResolutions.filter((item) => item.candidateLabel === selectedLabel);
        if (!selectedResolutions.length || selectedResolutions.some((item) => !item.confirmed)) {
          showNotice(`Confirm every ${selectedLabel} diagnostic question before selecting its architecture`, true);
          return false;
        }
      }
      if (!isComparison && status !== 'pending' && Object.keys(scores).length !== dashboard.musicLab.scoreDimensions.length) {
        showNotice('Score every required musical dimension before recording a decision', true);
        return false;
      }
      if (!isComparison && status === 'approve') {
        const belowStandard = dashboard.musicLab.scoreDimensions.filter(
          (dimension) => scores[dimension.id] < dashboard.musicLab.minimumApprovalScore
        );
        if (belowStandard.length) {
          showNotice(`Construction approval requires ${dashboard.musicLab.minimumApprovalScore}/5 in every dimension; choose revise or reject`, true);
          return false;
        }
      }
      const savedDecision = {
        status,
        note,
        ...(isComparison ? { artistResolutions } : { scores }),
        updatedAt: new Date().toISOString()
      };
      const stagedState = stageMusicDecision(
        state,
        item.id,
        savedDecision,
        {
          id: crypto.randomUUID(),
          message: `${item.title} music decision recorded as ${status}.`,
          type: 'music',
          timestamp: savedDecision.updatedAt
        }
      );
      return await saveState('Music decision saved and verified', (savedState) => {
        return musicDecisionMatches(
          savedState.musicReviews?.[item.id],
          savedDecision
        );
      }, stagedState);
    }
  });
}

function contentReadiness(item) {
  const checks = [
    ['hook', item.hook?.trim()],
    ['copy', item.content?.trim()],
    ['asset', item.assetPath?.trim()],
    ['CTA', item.cta?.trim()],
    ['approval', item.approvalStatus === 'approved']
  ];
  return {
    complete: checks.filter(([, value]) => value).length,
    total: checks.length,
    missing: checks.filter(([, value]) => !value).map(([label]) => label)
  };
}

function renderContentPipeline() {
  const columns = ['idea', 'creating', 'review', 'ready', 'posted'];
  const board = columns.map((status) => {
    const items = state.contentPipeline.filter((item) => item.status === status);
    return `<section class="queue-column">
      <h3>${status}<span>${items.length}</span></h3>
      ${items.length ? items.map((item) => {
        const readiness = contentReadiness(item);
        const nextStatus = columns[columns.indexOf(status) + 1];
        return `<article class="queue-item">
          <span class="platform">${escapeHtml(item.platform || 'UNASSIGNED')} // ${escapeHtml(item.format || 'CONTENT')}</span>
          <h4>${escapeHtml(item.title)}</h4>
          <p class="queue-hook">${escapeHtml(item.hook || item.objective || item.notes || 'Creative brief not recorded yet.')}</p>
          <div class="readiness"><span><b>${readiness.complete}/${readiness.total}</b> package complete</span><small>${readiness.missing.length ? `Missing: ${escapeHtml(readiness.missing.join(', '))}` : 'Ready for manual handoff'}</small></div>
          <div class="queue-flags">${statusPill(item.approvalStatus === 'approved' ? 'approved' : 'pending')}${item.campaign ? `<span class="status-pill">${escapeHtml(item.campaign)}</span>` : ''}</div>
          <div class="queue-meta"><span>${item.targetDate ? `TARGET ${escapeHtml(humanTime(item.targetDate))}` : 'NO TARGET DATE'}</span><button class="small-button" data-edit-content="${escapeHtml(item.id)}">Edit</button></div>
          <div class="queue-actions">
            ${item.content ? `<button class="small-button" data-copy-caption="${escapeHtml(item.id)}">Copy caption</button>` : ''}
            ${item.assetPath ? `<a class="small-button" href="${mediaUrl(item.assetPath)}" target="_blank" rel="noreferrer">Open asset</a>` : ''}
            ${nextStatus ? `<button class="small-button advance" data-advance-content="${escapeHtml(item.id)}" data-next-status="${nextStatus}">${status === 'ready' ? 'Mark posted' : `Move to ${nextStatus}`}</button>` : ''}
          </div>
        </article>`;
      }).join('') : '<div class="empty">NO CONTENT HERE</div>'}
    </section>`;
  }).join('');
  return `
    ${sectionIntro('Content pipeline', 'Move each piece from a usable idea to a complete manual-post package. Scheduling software is outside the critical path.', '<button class="button primary" data-action="add-content">+ New content</button>')}
    <section class="workflow-note">
      <strong>THE FINISH LINE</strong>
      <p>Hook, final caption, approved asset, CTA, and Artist approval. When those five are present, copy the caption, open the asset, and post or schedule it directly on the platform.</p>
    </section>
    <div class="queue-board">${board}</div>`;
}

function renderMetrics() {
  const totals = state.metrics.reduce((sum, metric) => ({
    impressions: sum.impressions + Number(metric.impressions || 0),
    views: sum.views + Number(metric.views || 0),
    engagements: sum.engagements + Number(metric.engagements || 0),
    clicks: sum.clicks + Number(metric.clicks || 0)
  }), { impressions: 0, views: 0, engagements: 0, clicks: 0 });
  const rows = state.metrics.length ? state.metrics.map((metric) => `<tr>
    <td><strong>${escapeHtml(metric.campaign || 'Unassigned')}</strong><small>${escapeHtml(metric.platform || '')}</small></td>
    <td>${number(metric.impressions)}</td><td>${number(metric.views)}</td><td>${number(metric.engagements)}</td><td>${number(metric.clicks)}</td>
    <td>${metric.url ? `<a href="${escapeHtml(metric.url)}" target="_blank" rel="noreferrer">Open post</a>` : '—'}</td>
  </tr>`).join('') : '<tr><td colspan="6"><div class="empty">NO PERFORMANCE RECORDS YET</div></td></tr>';
  return `
    ${sectionIntro('Campaign metrics', 'A compact first-party log for learning what resonates across each chapter and live transmission.', '<button class="button primary" data-action="add-metric">+ Add performance</button>')}
    <div class="metric-summary">
      <div><span>Impressions</span><strong>${number(totals.impressions)}</strong></div>
      <div><span>Views</span><strong>${number(totals.views)}</strong></div>
      <div><span>Engagements</span><strong>${number(totals.engagements)}</strong></div>
      <div><span>Link clicks</span><strong>${number(totals.clicks)}</strong></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Impressions</th><th>Views</th><th>Engagements</th><th>Clicks</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function fieldsHtml(fields) {
  return `<div class="field-grid">${fields.map((field) => {
    const classes = `field${field.full ? ' full' : ''}`;
    const options = field.options?.map((entry) => {
      const option = typeof entry === 'string' ? { value: entry, label: entry } : entry;
      return `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
    }).join('');
    const input = field.type === 'textarea'
      ? `<textarea id="${field.id}" name="${field.id}">${escapeHtml(field.value || '')}</textarea>`
      : field.type === 'select'
        ? `<select id="${field.id}" name="${field.id}">${options}</select>`
        : `<input id="${field.id}" name="${field.id}" type="${field.type || 'text'}" value="${escapeHtml(field.value || '')}">`;
    return `<div class="${classes}"><label for="${field.id}">${escapeHtml(field.label)}</label>${input}</div>`;
  }).join('')}</div>`;
}

function openDialog({ code, title, fields, submit = 'Save record', onSubmit }) {
  document.querySelector('#dialog-code').textContent = code;
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-submit').textContent = submit;
  dialogFields.innerHTML = fieldsHtml(fields);
  dialogHandler = onSubmit;
  dialog.showModal();
}

function editDecisions() {
  const dateKeys = new Set(['visualizerStartDate', 'releaseDate', 'releasePartyDate']);
  const fields = dashboard.journey.decisions
    .filter((decision) => typeof decision.sourceValue !== 'object' || decision.sourceValue === null)
    .map((decision) => ({
      id: decision.key,
      label: decisionLabels[decision.key] || decision.key,
      type: dateKeys.has(decision.key) ? 'date' : 'text',
      value: decision.override || '',
      full: !dateKeys.has(decision.key)
    }));
  openDialog({
    code: 'CAMPAIGN DECISIONS', title: 'Resolve open coordinates', fields, submit: 'Save decisions',
    onSubmit: async (data) => {
      for (const field of fields) {
        const value = String(data.get(field.id) || '').trim();
        if (value) state.decisionOverrides[field.id] = value;
        else delete state.decisionOverrides[field.id];
      }
      logActivity('Campaign decision coordinates updated.', 'decision');
      await saveState('Campaign decisions saved');
    }
  });
}

function editContent(id = null) {
  const existing = id ? state.contentPipeline.find((item) => item.id === id) : null;
  openDialog({
    code: existing ? 'EDIT CONTENT' : 'NEW CONTENT',
    title: existing ? 'Update content package' : 'Start a content package',
    fields: [
      { id: 'title', label: 'Title', value: existing?.title, full: true },
      { id: 'campaign', label: 'Campaign', value: existing?.campaign },
      { id: 'platform', label: 'Platform', value: existing?.platform, options: ['X', 'Instagram', 'TikTok', 'YouTube', 'Audius', 'Multiple', 'Other'], type: 'select' },
      { id: 'format', label: 'Format', value: existing?.format || 'Short video', options: ['Short video', 'Static post', 'Carousel', 'Text post', 'Story', 'Long video', 'Other'], type: 'select' },
      { id: 'status', label: 'Pipeline stage', value: existing?.status || 'idea', options: ['idea', 'creating', 'review', 'ready', 'posted'], type: 'select' },
      { id: 'approvalStatus', label: 'OxQuan approval', value: existing?.approvalStatus || 'draft', options: [{ value: 'draft', label: 'Not approved yet' }, { value: 'approved', label: 'Approved for manual posting' }], type: 'select' },
      { id: 'targetDate', label: 'Target date (optional)', value: existing?.targetDate ? existing.targetDate.slice(0, 10) : '', type: 'date' },
      { id: 'objective', label: 'One job / audience action', value: existing?.objective, type: 'textarea', full: true },
      { id: 'hook', label: 'Hook', value: existing?.hook, type: 'textarea', full: true },
      { id: 'assetPath', label: 'Workspace asset path', value: existing?.assetPath, full: true },
      { id: 'content', label: 'Final caption / post copy', value: existing?.content, type: 'textarea', full: true },
      { id: 'altText', label: 'Media alt text', value: existing?.altText, type: 'textarea', full: true },
      { id: 'cta', label: 'Call to action', value: existing?.cta, full: true },
      { id: 'publishedUrl', label: 'Published URL (after posting)', value: existing?.publishedUrl, full: true },
      { id: 'notes', label: 'Notes', value: existing?.notes, type: 'textarea', full: true }
    ],
    submit: existing ? 'Update package' : 'Add to pipeline',
    onSubmit: async (data) => {
      const record = {
        id: existing?.id || crypto.randomUUID(),
        title: String(data.get('title') || 'Untitled content').trim(),
        campaign: String(data.get('campaign') || '').trim(),
        platform: data.get('platform'),
        format: data.get('format'),
        status: data.get('status'),
        approvalStatus: data.get('approvalStatus'),
        targetDate: data.get('targetDate') || null,
        objective: String(data.get('objective') || '').trim(),
        hook: String(data.get('hook') || '').trim(),
        assetPath: String(data.get('assetPath') || '').trim(),
        content: String(data.get('content') || '').trim(),
        altText: String(data.get('altText') || '').trim(),
        cta: String(data.get('cta') || '').trim(),
        publishedUrl: String(data.get('publishedUrl') || '').trim() || null,
        notes: String(data.get('notes') || '').trim()
      };
      if (existing) Object.assign(existing, record);
      else state.contentPipeline.unshift(record);
      logActivity(`${record.title} moved to ${record.status}.`, 'content');
      await saveState('Content pipeline updated');
    }
  });
}

function addMetric() {
  openDialog({
    code: 'SIGNAL PERFORMANCE', title: 'Record campaign performance',
    fields: [
      { id: 'campaign', label: 'Campaign / post', full: true },
      { id: 'platform', label: 'Platform', options: ['X', 'Instagram', 'TikTok', 'YouTube', 'Audius', 'Other'], type: 'select' },
      { id: 'capturedAt', label: 'Captured date', type: 'date', value: new Date().toISOString().slice(0, 10) },
      { id: 'impressions', label: 'Impressions', type: 'number' },
      { id: 'views', label: 'Views', type: 'number' },
      { id: 'engagements', label: 'Engagements', type: 'number' },
      { id: 'clicks', label: 'Link clicks', type: 'number' },
      { id: 'url', label: 'Post URL', type: 'url', full: true },
      { id: 'notes', label: 'What did we learn?', type: 'textarea', full: true }
    ],
    submit: 'Record performance',
    onSubmit: async (data) => {
      const metric = Object.fromEntries(data.entries());
      metric.id = crypto.randomUUID();
      ['impressions', 'views', 'engagements', 'clicks'].forEach((key) => { metric[key] = Number(metric[key] || 0); });
      state.metrics.unshift(metric);
      logActivity(`Performance recorded for ${metric.campaign || 'an unassigned campaign'}.`, 'metrics');
      await saveState('Performance recorded');
    }
  });
}

function bindViewEvents() {
  document.querySelectorAll('[data-tool-view]').forEach((button) => button.addEventListener('click', async () => {
    currentView = button.dataset.toolView;
    window.history.replaceState(null, '', `/?view=${currentView}`);
    render();
    if (currentView === 'gallery' && !gallery) {
      try { await refreshGallery(); } catch (error) { showNotice(error.message, true); }
    }
    scheduleCreativeToolPoll();
    scheduleAssetForgePoll();
    scheduleMusicMakerPoll();
  }));
  document.querySelectorAll('[data-music-project]').forEach((button) => button.addEventListener('click', () => {
    musicSelectedId = button.dataset.musicProject;
    musicDraftMode = false;
    render();
  }));
  document.querySelector('[data-music-new]')?.addEventListener('click', () => {
    musicSelectedId = null;
    musicDraftMode = true;
    render();
  });
  document.querySelectorAll('[data-visual-project]').forEach((button) => button.addEventListener('click', () => {
    forgeSelectedId = button.dataset.visualProject;
    forgeEngine = 'visual';
    visualDraftMode = false;
    render();
  }));
  document.querySelector('[data-visual-new]')?.addEventListener('click', () => {
    forgeSelectedId = null;
    forgeEngine = 'visual';
    visualDraftMode = true;
    render();
  });
  document.querySelector('[data-music-launch]')?.addEventListener('click', async (event) => {
    if (!await confirmInteraction({
      code: 'MUSIC MAKER // PRIVATE ENGINE',
      title: 'Wake the music engine?',
      message: 'ArtistOS will start the authenticated ACE-Step REST engine on loopback. Its native interface will remain closed.',
      confirmLabel: 'Wake engine',
      boundary: 'Private engine only · no generation yet'
    })) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Warming…';
    try {
      await request('/api/music-maker/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      await refreshMusicMaker();
      showNotice('The private music engine is warming behind ArtistOS.');
    } catch (error) {
      showNotice(error.message, true);
      await refreshMusicMaker();
    }
  });
  document.querySelector('[data-music-generate]')?.addEventListener('click', async (event) => {
    const form = document.querySelector('[data-forge-form="ace"]');
    if (!form || !form.reportValidity()) return;
    if (!musicMaker?.engine?.online) {
      showNotice('Wake the private music engine before generating.', true);
      return;
    }
    const data = new FormData(form);
    const task = String(data.get('task') || 'text2music');
    if (task === 'repaint' && musicMaker?.boundaries?.repaint?.enabled === false) {
      showNotice('Repaint is safety-locked until outside-corridor audio can be proven sample-identical.', true);
      return;
    }
    const title = String(data.get('title') || 'Untitled music session').trim();
    if (!await confirmInteraction({
      code: 'MUSIC MAKER // EXPLICIT GENERATION',
      title: `Generate from ${title}?`,
      message: 'ArtistOS will save the exact controls on screen and ask the private engine for one unapproved candidate.',
      confirmLabel: 'Generate candidate',
      boundary: 'Candidate only · not selected · not mastered · not approved'
    })) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Generating…';
    try {
      const id = String(data.get('id') || '').trim();
      const settings = Object.fromEntries([...data.entries()].filter(([key]) => !['id', 'title'].includes(key)));
      const project = await request('/api/forge/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, engine: 'ace', title, settings })
      });
      musicSelectedId = project.id;
      musicDraftMode = false;
      forgeSelectedId = project.id;
      assetForge = await request('/api/forge');
      const job = await request('/api/music-maker/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, confirmed: true })
      });
      const currentJobs = Array.isArray(musicMaker?.jobs) ? musicMaker.jobs : [];
      musicMaker = {
        ...(musicMaker || {}),
        jobs: [job, ...currentJobs.filter((entry) => entry.jobId !== job.jobId)]
      };
      render();
      scheduleMusicMakerPoll();
      showNotice(`Generation job ${job.jobId} submitted. ArtistOS is monitoring exactly one unapproved candidate.`);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Save + generate candidate';
      showNotice(error.message, true);
      await refreshMusicMaker();
    }
  });
  document.querySelectorAll('[data-forge-engine]').forEach((button) => button.addEventListener('click', () => {
    forgeEngine = button.dataset.forgeEngine;
    const selected = forgeSelectedProject();
    if (selected && selected.engine !== forgeEngine) forgeSelectedId = null;
    render();
  }));
  document.querySelector('[data-forge-new]')?.addEventListener('click', () => {
    forgeSelectedId = null;
    musicDraftMode = false;
    visualDraftMode = false;
    render();
  });
  document.querySelectorAll('[data-forge-project]').forEach((button) => button.addEventListener('click', () => {
    forgeSelectedId = button.dataset.forgeProject;
    const selectedProject = forgeSelectedProject();
    forgeEngine = selectedProject?.engine || 'visual';
    if (selectedProject?.engine === 'visual') visualDraftMode = false;
    if (selectedProject?.engine === 'ace') {
      musicDraftMode = false;
      musicSelectedId = selectedProject.id;
    }
    render();
  }));
  document.querySelector('[data-forge-form="visual"]')?.addEventListener('input', (event) => {
    const form = event.currentTarget;
    const preview = document.querySelector('[data-forge-preview]');
    if (!preview) return;
    const data = new FormData(form);
    preview.style.setProperty('--forge-bg', String(data.get('backgroundColor') || '#05090A'));
    preview.style.setProperty('--forge-accent', String(data.get('accentColor') || '#76F7E5'));
    preview.style.setProperty('--forge-text', String(data.get('textColor') || '#F0FFFF'));
    const format = assetForge?.formats?.find((entry) => entry.id === data.get('format'));
    if (format) preview.style.setProperty('--forge-aspect', `${format.width} / ${format.height}`);
    preview.querySelector('[data-preview-eyebrow]').textContent = data.get('eyebrow') || '';
    preview.querySelector('[data-preview-headline]').textContent = data.get('headline') || '';
    preview.querySelector('[data-preview-subheadline]').textContent = data.get('subheadline') || '';
    preview.querySelector('[data-preview-cta]').textContent = data.get('cta') || '';
  });
  document.querySelectorAll('[data-forge-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const engine = form.dataset.forgeForm;
    const data = new FormData(form);
    const id = String(data.get('id') || '').trim();
    const title = String(data.get('title') || '').trim();
    const settings = Object.fromEntries([...data.entries()].filter(([key]) => !['id', 'title'].includes(key)));
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      const project = await request('/api/forge/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, engine, title, settings })
      });
      forgeSelectedId = project.id;
      if (engine === 'ace') {
        musicSelectedId = project.id;
        musicDraftMode = false;
      }
      if (engine === 'visual') visualDraftMode = false;
      assetForge = await request('/api/forge');
      render();
      showNotice(`${project.title} saved as a local ${engine === 'visual' ? 'visual blueprint' : 'ACE session'}. Nothing rendered.`);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = engine === 'visual' ? 'Save blueprint' : 'Save ACE session';
      showNotice(error.message, true);
    }
  }));
  document.querySelector('[data-forge-copy]')?.addEventListener('click', async () => {
    const form = document.querySelector('[data-forge-form="ace"]');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.id;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      showNotice('ACE session controls copied. Paste them into your notes or hand them back to Codex.');
    } catch (error) {
      showNotice(`Could not copy controls: ${error.message}`, true);
    }
  });
  document.querySelectorAll('[data-forge-render]').forEach((button) => button.addEventListener('click', async () => {
    const form = document.querySelector('[data-forge-form="visual"]');
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    const currentTitle = String(data.get('title') || 'Untitled visual').trim();
    if (!await confirmInteraction({
      code: 'ASSET FORGE // EXPLICIT RENDER',
      title: `Render ${currentTitle}?`,
      message: 'ArtistOS will save the exact controls on screen, then its private render core will create a new local draft.',
      confirmLabel: 'Render in background',
      boundary: 'Draft only · no approval · no publishing'
    })) return;
    button.disabled = true;
    button.textContent = 'Rendering…';
    try {
      const id = String(data.get('id') || '').trim();
      const settings = Object.fromEntries([...data.entries()].filter(([key]) => !['id', 'title'].includes(key)));
      const project = await request('/api/forge/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, engine: 'visual', title: currentTitle, settings })
      });
      forgeSelectedId = project.id;
      visualDraftMode = false;
      const result = await request(`/api/forge/projects/${encodeURIComponent(project.id)}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true })
      });
      assetForge = await request('/api/forge');
      render();
      scheduleAssetForgePoll();
      showNotice(`Background draft render started: ${result.render.outputPath}`);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Save + render in background';
      showNotice(error.message, true);
    }
  }));
  document.querySelectorAll('[data-gallery-category]').forEach((button) => button.addEventListener('click', () => {
    galleryCategory = button.dataset.galleryCategory;
    galleryPage = 0;
    gallerySelectedId = null;
    render();
  }));
  document.querySelectorAll('[data-gallery-type]').forEach((button) => button.addEventListener('click', () => {
    galleryType = button.dataset.galleryType;
    galleryPage = 0;
    gallerySelectedId = null;
    render();
  }));
  document.querySelector('[data-gallery-search]')?.addEventListener('input', (event) => {
    galleryQuery = event.currentTarget.value;
    galleryPage = 0;
    gallerySelectedId = null;
    render();
    document.querySelector('[data-gallery-search]')?.focus();
  });
  document.querySelectorAll('[data-gallery-item]').forEach((button) => button.addEventListener('click', () => {
    gallerySelectedId = button.dataset.galleryItem;
    render();
  }));
  document.querySelectorAll('[data-gallery-page]').forEach((button) => button.addEventListener('click', () => {
    galleryPage = Math.max(0, galleryPage + (button.dataset.galleryPage === 'next' ? 1 : -1));
    gallerySelectedId = null;
    render();
  }));
  document.querySelector('[data-gallery-refresh]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await refreshGallery({ force: true });
      showNotice(`Gallery refreshed: ${number(gallery.counts.total)} local artifacts indexed.`);
    } catch (error) {
      showNotice(error.message, true);
      event.currentTarget.disabled = false;
    }
  });
  document.querySelectorAll('[data-quil-mode]').forEach((button) => button.addEventListener('click', () => switchQuilMode(button.dataset.quilMode)));
  document.querySelector('[data-action="edit-decisions"]')?.addEventListener('click', editDecisions);
  document.querySelector('[data-action="add-content"]')?.addEventListener('click', () => editContent());
  document.querySelector('[data-action="add-metric"]')?.addEventListener('click', addMetric);
  document.querySelectorAll('[data-wavid-sync]').forEach((syncButton) => syncButton.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Syncing official roster…';
    try {
      incubator = await request('/api/wavids/roster-sync', { method: 'POST' });
      render();
      showNotice(`WaveWarz roster captured: ${incubator.counts.roster} artists, ${incubator.counts.eligible} birth eligible`);
    } catch (error) {
      showNotice(error.message, true);
      button.disabled = false;
      button.textContent = 'Sync WaveWarz roster';
    }
  }));
  document.querySelector('[data-wavid-search]')?.addEventListener('input', (event) => {
    wavidQuery = event.target.value;
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector('[data-wavid-search]');
      input?.focus();
      input?.setSelectionRange(wavidQuery.length, wavidQuery.length);
    });
  });
  document.querySelectorAll('[data-wavid-filter]').forEach((button) => button.addEventListener('click', () => {
    wavidRosterFilter = button.dataset.wavidFilter;
    render();
  }));
  document.querySelectorAll('[data-wavid-select]').forEach((button) => button.addEventListener('click', () => {
    wavidSelectedArtistKey = button.dataset.wavidSelect;
    wavidMediaMode = 'poster';
    nurseryAnatomyPart = null;
    nurseryAnatomyFeature = null;
    render();
    document.querySelector('.wavid-incubator-console')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }));
  document.querySelectorAll('[data-wavid-media]').forEach((button) => button.addEventListener('click', () => {
    wavidMediaMode = button.dataset.wavidMedia;
    render();
  }));
  document.querySelectorAll('[data-wavid-mood]').forEach((button) => button.addEventListener('click', () => {
    phosphorMoodJobId = button.dataset.wavidMood;
    phosphorThemeName = 'auto';
    localStorage.setItem('artistos-wavid-mood-job', phosphorMoodJobId);
    localStorage.setItem('artistos-phosphor-theme', phosphorThemeName);
    applyPhosphorTheme();
    render();
    showNotice('Command Center mood linked to this WavID palette');
  }));
  document.querySelectorAll('[data-wavid-birth]').forEach((button) => button.addEventListener('click', async () => {
    const artist = incubator?.roster?.artists?.find((entry) => entry.artistKey === button.dataset.wavidBirth);
    if (!await confirmInteraction({
      code: 'PRIVATE BIRTH // SOURCE BIND',
      title: `Birth ${artist?.displayName || 'this artist'} WavID?`,
      message: 'Create the private WavID definition from the current WaveWarz artist record.',
      confirmLabel: 'Birth WavID',
      boundary: 'No approval · no publishing · no mint'
    })) return;
    button.disabled = true;
    try {
      const result = await request('/api/wavids/birth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistKey: button.dataset.wavidBirth, confirmed: true, requireFresh: true })
      });
      if (result.created) wavidRosterFilter = 'incubating';
      await refreshIncubator();
      showNotice(result.created ? `${result.birth.displayName} entered incubation` : 'This exact source-bound birth already exists');
    } catch (error) {
      showNotice(error.message, true);
      button.disabled = false;
    }
  }));
  document.querySelectorAll('[data-wavid-render]').forEach((button) => button.addEventListener('click', async () => {
    const birth = incubator?.births?.find((entry) => entry.id === button.dataset.wavidRender);
    if (!await confirmInteraction({
      code: 'INCUBATION // LOCAL RENDER',
      title: `Incubate ${birth?.displayName || 'this WavID'}?`,
      message: 'Generate the deterministic poster and silent loop. Progress will appear in the Incubator.',
      confirmLabel: 'Start incubation',
      boundary: 'Private review assets · approval remains separate'
    })) return;
    button.disabled = true;
    button.textContent = 'Starting local render…';
    try {
      await request(`/api/wavids/births/${encodeURIComponent(button.dataset.wavidRender)}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      await refreshIncubator();
      showNotice('Local WavID render started. This view will monitor the production phases.');
    } catch (error) {
      showNotice(error.message, true);
      button.disabled = false;
      button.textContent = 'Start incubation';
    }
  }));
  document.querySelectorAll('[data-wavid-update]').forEach((button) => button.addEventListener('click', async () => {
    const birth = incubator?.births?.find((entry) => entry.id === button.dataset.wavidUpdate);
    if (!await confirmInteraction({
      code: 'WAVID REVISION // WWZ REFRESH',
      title: `Update ${birth?.displayName || 'this artist'} WavID?`,
      message: 'Fetch the latest official WaveWarz artist and song record. If the data changed, QUIL will create the next immutable revision and regenerate its poster, loop, and anatomy data.',
      confirmLabel: 'Update WavID',
      boundary: 'Prior revision preserved · private review · no approval inheritance'
    })) return;
    button.disabled = true;
    button.textContent = 'Checking WaveWarz…';
    try {
      const result = await request(`/api/wavids/births/${encodeURIComponent(button.dataset.wavidUpdate)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      if (result.updated) {
        wavidMediaMode = 'poster';
        nurseryAnatomyPart = null;
        nurseryAnatomyFeature = null;
        await refreshIncubator();
        showNotice(`Revision ${number(result.birth?.lineage?.revision)} started. QUIL is regenerating the poster, loop, and anatomy data.`);
      } else {
        await refreshIncubator();
        const checked = result.checkedAt ? new Date(result.checkedAt).toLocaleString() : 'the latest checkpoint';
        showNotice(`WavID already matches WaveWarz as of ${checked}. No duplicate revision was created.`);
      }
    } catch (error) {
      showNotice(error.message, true);
      button.disabled = false;
      button.textContent = 'Update WavID';
    }
  }));
  document.querySelectorAll('[data-wavid-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.wavidAction;
    const birth = incubator?.births?.find((entry) => entry.id === button.dataset.wavidId);
    if (action === 'retire' && !await confirmInteraction({
      code: 'LIFECYCLE // RETIRE',
      title: `Retire ${birth?.displayName || 'this WavID'}?`,
      message: 'Remove this birth from active incubation while preserving its source and provenance files.',
      confirmLabel: 'Retire WavID',
      boundary: 'Preserved locally · reversible only through a new birth',
      tone: 'danger'
    })) return;
    button.disabled = true;
    try {
      await request(`/api/wavids/births/${encodeURIComponent(button.dataset.wavidId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await refreshIncubator();
      showNotice(`WavID birth ${action} recorded`);
    } catch (error) {
      showNotice(error.message, true);
      button.disabled = false;
    }
  }));
  document.querySelectorAll('[data-music-review]').forEach((button) => button.addEventListener('click', () => editMusicReview(button.dataset.musicReview)));
  document.querySelectorAll('[data-edit-content]').forEach((button) => button.addEventListener('click', () => editContent(button.dataset.editContent)));
  document.querySelectorAll('[data-copy-caption]').forEach((button) => button.addEventListener('click', async () => {
    const item = state.contentPipeline.find((record) => record.id === button.dataset.copyCaption);
    if (!item?.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      showNotice('Caption copied — asset and platform are your manual handoff');
    } catch {
      showNotice('Clipboard access was blocked by the browser', true);
    }
  }));
  document.querySelectorAll('[data-advance-content]').forEach((button) => button.addEventListener('click', async () => {
    const item = state.contentPipeline.find((record) => record.id === button.dataset.advanceContent);
    if (!item) return;
    if (button.dataset.nextStatus === 'ready') {
      const readiness = contentReadiness(item);
      if (readiness.missing.length) return showNotice(`Complete ${readiness.missing.join(', ')} before marking ready`, true);
    }
    item.status = button.dataset.nextStatus;
    logActivity(`${item.title} moved to ${item.status}.`, 'content');
    await saveState(item.status === 'posted' ? 'Manual post recorded' : `Moved to ${item.status}`);
  }));
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { approvalFilter = button.dataset.filter; render(); }));
  document.querySelectorAll('[data-approval]').forEach((button) => button.addEventListener('click', async () => {
    const { path, approval } = button.dataset;
    state.approvals[path] = { status: approval, note: '', updatedAt: new Date().toISOString() };
    const asset = dashboard.approvals.find((item) => item.path === path);
    logActivity(`${asset?.name || path} marked ${approval}.`, 'approval');
    await saveState(`Asset marked ${approval}`);
  }));
  document.querySelectorAll('[data-nursery-state]').forEach((button) => button.addEventListener('click', () => {
    nurseryFilter = button.dataset.nurseryState;
    nurseryPage = 0;
    render();
  }));
  document.querySelector('[data-nursery-search]')?.addEventListener('input', (event) => {
    nurseryQuery = event.target.value;
    nurseryPage = 0;
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector('[data-nursery-search]');
      input?.focus();
      input?.setSelectionRange(nurseryQuery.length, nurseryQuery.length);
    });
  });
  document.querySelectorAll('[data-anatomy-part]').forEach((button) => {
    const select = () => selectNurseryAnatomy(button.dataset.anatomyPart);
    button.addEventListener('pointerenter', (event) => {
      if (shouldPreviewWavformAnatomyOnPointer({ pointerType: event.pointerType, fineHover: window.matchMedia('(hover: hover) and (pointer: fine)').matches })) select();
    });
    button.addEventListener('focus', select);
    button.addEventListener('click', select);
  });
  document.querySelectorAll('[data-anatomy-feature]').forEach((button) => {
    const select = () => selectNurseryAnatomyFeature(button.dataset.anatomyFeature);
    button.addEventListener('pointerenter', (event) => {
      if (shouldPreviewWavformAnatomyOnPointer({ pointerType: event.pointerType, fineHover: window.matchMedia('(hover: hover) and (pointer: fine)').matches })) select();
    });
    button.addEventListener('focus', select);
    button.addEventListener('click', select);
  });
  document.querySelectorAll('[data-anatomy-marker]').forEach((marker) => {
    const select = () => selectNurseryAnatomyFeature(marker.dataset.anatomyMarker);
    marker.addEventListener('pointerenter', (event) => {
      if (shouldPreviewWavformAnatomyOnPointer({ pointerType: event.pointerType, fineHover: window.matchMedia('(hover: hover) and (pointer: fine)').matches })) select();
    });
    marker.addEventListener('focus', select);
    marker.addEventListener('click', select);
    marker.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  });
  document.querySelectorAll('[data-anatomy-clear]').forEach((button) => button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    selectNurseryAnatomy(null);
  }));
  document.querySelector('[data-nursery-anatomy-inspector]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const inspector = event.currentTarget;
      selectNurseryAnatomy(null);
      inspector.setAttribute('tabindex', '-1');
      inspector.focus({ preventScroll: true });
    }
  });
  document.querySelectorAll('[data-nursery-edition]').forEach((button) => button.addEventListener('click', async () => {
    nurserySelectedEdition = button.dataset.nurseryEdition;
    nurseryFollowLive = nurserySelectedEdition === nursery.queue?.currentEdition;
    window.history.replaceState(null, '', nurseryFollowLive ? '/?view=nursery' : `/?view=nursery&edition=${nurserySelectedEdition}`);
    await refreshNurseryAnatomy(nurserySelectedEdition);
    render();
    document.querySelector('.nursery-chamber')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }));
  document.querySelectorAll('[data-nursery-page]').forEach((button) => button.addEventListener('click', () => {
    nurseryPage += button.dataset.nurseryPage === 'next' ? 1 : -1;
    nurseryPage = Math.max(0, nurseryPage);
    render();
    document.querySelector('.nursery-array-panel')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }));
  document.querySelectorAll('[data-nursery-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.nurseryAction;
    if (action === 'toggle-animation') {
      nurseryAnimate = !nurseryAnimate;
      localStorage.setItem('wavforms-nursery-animate', String(nurseryAnimate));
      render();
    }
    if (action === 'follow-live') {
      nurseryFollowLive = true;
      nurserySelectedEdition = nursery.queue?.currentEdition || nurserySelectedEdition;
      window.history.replaceState(null, '', '/?view=nursery');
      await refreshNurseryAnatomy(nurserySelectedEdition);
      render();
    }
    if (action === 'refresh') {
      button.disabled = true;
      await refreshNursery({ force: true });
      scheduleNurseryPoll();
    }
  }));
}

document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', async () => {
  currentView = button.dataset.view;
  window.history.replaceState(null, '', currentView === 'incubator' ? '/' : `/?view=${currentView}`);
  render();
  if (currentView === 'nursery' && !nursery) {
    try {
      await refreshNursery();
    } catch (error) {
      app.innerHTML = `<div class='empty'>NURSERY COULD NOT OPEN<br>${escapeHtml(error.message)}</div>`;
      showNotice(error.message, true);
    }
  }
  if (currentView === 'incubator' && !incubator) {
    try {
      await refreshIncubator();
    } catch (error) {
      app.innerHTML = `<div class='empty'>WAVID INCUBATOR COULD NOT OPEN<br>${escapeHtml(error.message)}</div>`;
      showNotice(error.message, true);
    }
  }
  if (currentView === 'gallery' && !gallery) {
    try {
      await refreshGallery();
    } catch (error) {
      app.innerHTML = `<div class='empty'>CONTENT GALLERY COULD NOT OPEN<br>${escapeHtml(error.message)}</div>`;
      showNotice(error.message, true);
    }
  }
  scheduleNurseryPoll();
  scheduleCreativeToolPoll();
  scheduleAssetForgePoll();
  scheduleMusicMakerPoll();
}));

themeSelect?.addEventListener('change', () => {
  phosphorThemeName = normalizeThemeName(themeSelect.value);
  localStorage.setItem('artistos-phosphor-theme', phosphorThemeName);
  applyPhosphorTheme();
  showNotice(phosphorThemeName === 'auto' ? 'Mood will follow the focused WavID' : `${PHOSPHOR_THEMES[phosphorThemeName].label} theme locked locally`);
});

confirmDialog.addEventListener('close', () => {
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(confirmDialog.returnValue === 'confirm');
});

dialogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!dialogHandler) return;
  const handler = dialogHandler;
  const submitButton = document.querySelector('#dialog-submit');
  submitButton.disabled = true;
  try {
    const result = await handler(new FormData(dialogForm));
    if (!shouldCloseDialog(result)) return;
    dialogHandler = null;
    dialog.close();
  } finally {
    submitButton.disabled = false;
  }
});

dialogForm.addEventListener('click', (event) => {
  if (event.target.value === 'cancel') {
    dialogHandler = null;
    dialog.close();
  }
});

setInterval(() => {
  document.querySelector('#clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
}, 1000);
setInterval(async () => {
  if (currentView !== 'incubator' || incubatorPolling || !incubator?.births?.some((birth) => ['render-starting', 'rendering-poster', 'rendering-loop', 'technical-qa'].includes(birth.phase))) return;
  incubatorPolling = true;
  try {
    await refreshIncubator();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    incubatorPolling = false;
  }
}, 4000);
setInterval(async () => {
  if (!['incubator', 'nursery'].includes(currentView) || quilLivePolling) return;
  quilLivePolling = true;
  try {
    await refreshQuilLive();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    quilLivePolling = false;
  }
}, 5000);
accessForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = accessForm.querySelector('[type="submit"]');
  accessError.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Connecting…';
  try {
    const status = await request('/api/access/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: accessPasscode.value })
    });
    accessForm.reset();
    applyAccessState(status);
    await refresh();
  } catch (error) {
    accessError.textContent = error.message;
    accessPasscode.select();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Enter system';
  }
});

sessionLogout?.addEventListener('click', async () => {
  sessionLogout.disabled = true;
  try {
    const status = await request('/api/access/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    applyAccessState(status);
    dashboard = null;
    musicMaker = null;
    assetForge = null;
    app.innerHTML = `<div class='loading-panel'><div class='loader'></div><p>SESSION LOCKED</p></div>`;
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    sessionLogout.disabled = false;
  }
});

async function bootArtistOs() {
  const status = await request('/api/access/status');
  applyAccessState(status);
  if (status.authenticated) await refresh();
}

document.querySelector('#clock').textContent = new Date().toLocaleTimeString([], { hour12: false });

bootArtistOs().catch((error) => {
  applyAccessState({ authenticated: false, mode: 'passcode' });
  accessError.textContent = error.message;
});
