import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCHEMA = 'artistos-asset-forge/1.0';
const PROJECT_SCHEMA = 'artistos-tool-project/1.0';
const VISUAL_FORMATS = {
  portrait: { label: 'Portrait post', width: 1080, height: 1350 },
  story: { label: 'Story / reel', width: 1080, height: 1920 },
  square: { label: 'Square', width: 1080, height: 1080 },
  landscape: { label: 'Landscape', width: 1920, height: 1080 }
};
const VISUAL_TEMPLATES = new Set(['event-poster', 'announcement', 'cover-card']);
const VISUAL_KINDS = new Set(['still', 'motion']);
const ACE_TASKS = new Set(['text2music', 'cover', 'repaint']);
const ACE_MODELS = new Set(['acestep-v15-turbo', 'acestep-v15-sft']);
const IMAGE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.flac', '.m4a', '.mp3', '.ogg', '.wav']);
const SOURCE_ROOTS = ['assets', 'content', path.join('catalog', 'audio')];
const CREDENTIAL_ENV_NAME = /(passcode|password|secret|token|api[_-]?key|credential)/i;

function privateWorkerEnvironment(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (CREDENTIAL_ENV_NAME.test(key)) delete env[key];
  }
  return env;
}

export class AssetForgeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AssetForgeError';
    this.status = status;
  }
}

function cleanText(value, label, max, { required = false } = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new AssetForgeError(`${label} is required`);
  if (result.length > max) throw new AssetForgeError(`${label} must be ${max} characters or fewer`);
  return result;
}

function cleanNumber(value, label, min, max, fallback) {
  const result = value === '' || value === null || value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new AssetForgeError(`${label} must be between ${min} and ${max}`);
  }
  return result;
}

function cleanInteger(value, label, min, max, fallback) {
  const result = cleanNumber(value, label, min, max, fallback);
  if (!Number.isInteger(result)) throw new AssetForgeError(`${label} must be a whole number`);
  return result;
}

function cleanColor(value, label, fallback) {
  const result = String(value || fallback).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(result)) throw new AssetForgeError(`${label} must be a six-digit hex color`);
  return result;
}

function cleanSlug(value, fallback = 'untitled-project') {
  const slug = String(value || fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveSource(workspaceRoot, relativePath, extensions, label) {
  const value = String(relativePath || '').trim().replaceAll('\\', '/');
  if (!value) return null;
  if (path.isAbsolute(value) || value.includes('\0')) throw new AssetForgeError(`${label} must be a workspace-relative path`);
  const absolute = path.resolve(workspaceRoot, value);
  const allowed = SOURCE_ROOTS.some((root) => inside(absolute, path.resolve(workspaceRoot, root)));
  if (!allowed || !extensions.has(path.extname(absolute).toLowerCase())) {
    throw new AssetForgeError(`${label} must point to a supported workspace media file`);
  }
  const segments = path.relative(path.resolve(workspaceRoot), absolute).split(path.sep).filter(Boolean);
  let cursor = path.resolve(workspaceRoot);
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let details;
    try { details = await lstat(cursor); }
    catch (error) {
      if (error.code === 'ENOENT') throw new AssetForgeError(`${label} was not found`, 404);
      throw error;
    }
    if (details.isSymbolicLink()) throw new AssetForgeError(`${label} cannot traverse symbolic links`);
    if (index < segments.length - 1 && !details.isDirectory()) throw new AssetForgeError(`${label} has an invalid parent path`);
    if (index === segments.length - 1 && !details.isFile()) throw new AssetForgeError(`${label} must point to a file`);
  }
  const [physicalWorkspace, physicalSource] = await Promise.all([realpath(workspaceRoot), realpath(absolute)]);
  if (!inside(physicalSource, physicalWorkspace)) throw new AssetForgeError(`${label} escaped the workspace`);
  return { relative: path.relative(workspaceRoot, absolute).replaceAll('\\', '/'), absolute: physicalSource };
}

function publicProject(project) {
  const result = structuredClone(project);
  if (result.lastRender) delete result.lastRender.receiptPath;
  return result;
}

function normalizeVisual(input) {
  const format = String(input.format || 'portrait');
  const template = String(input.template || 'event-poster');
  const outputKind = String(input.outputKind || 'still');
  if (!VISUAL_FORMATS[format]) throw new AssetForgeError('Unknown visual format');
  if (!VISUAL_TEMPLATES.has(template)) throw new AssetForgeError('Unknown visual template');
  if (!VISUAL_KINDS.has(outputKind)) throw new AssetForgeError('Unknown visual output kind');
  return {
    template,
    outputKind,
    format,
    width: VISUAL_FORMATS[format].width,
    height: VISUAL_FORMATS[format].height,
    fps: cleanInteger(input.fps, 'FPS', 24, 60, 30),
    durationSeconds: cleanNumber(input.durationSeconds, 'Duration', 1, 60, outputKind === 'still' ? 1 : 8),
    eyebrow: cleanText(input.eyebrow, 'Eyebrow', 80),
    headline: cleanText(input.headline, 'Headline', 120, { required: true }),
    subheadline: cleanText(input.subheadline, 'Subheadline', 180),
    body: cleanText(input.body, 'Body', 500),
    cta: cleanText(input.cta, 'Call to action', 100),
    backgroundPath: cleanText(input.backgroundPath, 'Background path', 320),
    backgroundColor: cleanColor(input.backgroundColor, 'Background color', '#05090A'),
    accentColor: cleanColor(input.accentColor, 'Accent color', '#76F7E5'),
    textColor: cleanColor(input.textColor, 'Text color', '#F0FFFF')
  };
}

function normalizeAce(input) {
  const task = String(input.task || 'text2music');
  const model = String(input.model || 'acestep-v15-turbo');
  if (!ACE_TASKS.has(task)) throw new AssetForgeError('Unknown ACE task');
  if (!ACE_MODELS.has(model)) throw new AssetForgeError('Unknown ACE model');
  const durationSeconds = cleanNumber(input.durationSeconds, 'Duration', 10, 600, 30);
  const timeSignature = cleanInteger(input.timeSignature, 'Time signature', 2, 6, 4);
  if (![2, 3, 4, 6].includes(timeSignature)) throw new AssetForgeError('Time signature must be 2, 3, 4, or 6');
  const repaintStart = cleanNumber(input.repaintStart, 'Repaint start', 0, durationSeconds, 0);
  const repaintEnd = cleanNumber(input.repaintEnd, 'Repaint end', 0, durationSeconds, Math.min(10, durationSeconds));
  if (task === 'repaint' && repaintEnd <= repaintStart) {
    throw new AssetForgeError('Repaint end must be after repaint start');
  }
  return {
    task,
    model,
    caption: cleanText(input.caption, 'Caption', 512, { required: true }),
    lyrics: cleanText(input.lyrics, 'Lyrics', 4096),
    durationSeconds,
    bpm: cleanInteger(input.bpm, 'BPM', 30, 300, 120),
    key: cleanText(input.key, 'Key', 24),
    timeSignature,
    seed: cleanInteger(input.seed, 'Seed', 0, 2147483647, 89),
    sourceAudioPath: cleanText(input.sourceAudioPath, 'Source audio path', 320),
    repaintStart: Math.round(repaintStart * 25) / 25,
    repaintEnd: Math.round(repaintEnd * 25) / 25
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createAssetForge({ workspaceRoot, spawnImpl = spawn, now = () => new Date(), processEnv = process.env } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const projectRoot = path.join(root, 'catalog', 'operations', 'tool-projects');
  const remotionRoot = path.join(root, 'tools', 'artistos-remotion');
  const remotionEntry = path.join(remotionRoot, 'src', 'asset-forge-entry.ts');
  const remotionWorker = path.join(remotionRoot, 'scripts', 'render-asset-forge.mjs');
  const remotionRenderer = path.join(remotionRoot, 'node_modules', '@remotion', 'renderer', 'package.json');
  const remotionBundler = path.join(remotionRoot, 'node_modules', '@remotion', 'bundler', 'package.json');
  const publicInputRoot = path.join(remotionRoot, 'public', 'asset-forge');
  const renderRoot = path.join(root, 'catalog', 'operations', 'asset-forge-renders');

  const projectPath = (id) => path.join(projectRoot, `${id}.json`);

  async function writeProject(project) {
    await mkdir(projectRoot, { recursive: true });
    const temporary = `${projectPath(project.id)}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
    await rename(temporary, projectPath(project.id));
  }

  async function renderReceipt(project) {
    const receiptRelative = project?.lastRender?.receiptPath;
    if (!receiptRelative) return null;
    const receiptPath = path.resolve(root, ...String(receiptRelative).replaceAll('\\', '/').split('/'));
    if (!inside(receiptPath, renderRoot)) return null;
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (receipt.schema !== 'artistos-asset-forge-render-progress/1.0' || receipt.projectId !== project.id) return null;
      const receiptAge = now().getTime() - Date.parse(receipt.updatedAt || receipt.startedAt || 0);
      const stalled = ['queued', 'bundling', 'resolving', 'rendering'].includes(receipt.status)
        && Number.isFinite(receiptAge) && receiptAge > 5 * 60 * 1000;
      return {
        status: stalled ? 'stalled' : receipt.status,
        progress: receipt.progress,
        detail: stalled ? 'The renderer stopped reporting. Start a new background render when ready.' : receipt.detail,
        startedAt: receipt.startedAt,
        updatedAt: receipt.updatedAt,
        finishedAt: receipt.finishedAt || null,
        outputPath: receipt.outputPath,
        exitCode: receipt.exitCode ?? null,
        error: stalled ? 'No progress receipt update was received for five minutes.' : receipt.error || null,
        runId: receipt.runId
      };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      return null;
    }
  }

  async function readProject(id) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(id || ''))) throw new AssetForgeError('Invalid project ID');
    try {
      return JSON.parse(await readFile(projectPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw new AssetForgeError('Asset Forge project not found', 404);
      throw error;
    }
  }

  async function listProjects() {
    try {
      const names = (await readdir(projectRoot)).filter((name) => name.endsWith('.json')).sort();
      const projects = await Promise.all(names.map(async (name) => {
        try { return JSON.parse(await readFile(path.join(projectRoot, name), 'utf8')); } catch { return null; }
      }));
      const hydrated = await Promise.all(projects.filter(Boolean).map(async (project) => {
        const receipt = await renderReceipt(project);
        if (receipt) return { ...project, lastRender: { ...project.lastRender, ...receipt } };
        const renderAge = now().getTime() - Date.parse(project?.lastRender?.startedAt || 0);
        const missingActiveReceipt = ['queued', 'bundling', 'resolving', 'rendering'].includes(project?.lastRender?.status)
          && Number.isFinite(renderAge) && renderAge > 5 * 60 * 1000;
        return missingActiveReceipt ? {
          ...project,
          lastRender: {
            ...project.lastRender,
            status: 'stalled',
            detail: 'The local render receipt is missing. Start a new background render when ready.',
            error: 'No current progress receipt is available.'
          }
        } : project;
      }));
      return hydrated.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(publicProject);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function observe() {
    const [visualEngine, aceEngine, projects] = await Promise.all([
      Promise.all([pathExists(remotionEntry), pathExists(remotionWorker), pathExists(remotionRenderer), pathExists(remotionBundler)]).then((checks) => checks.every(Boolean)),
      pathExists(path.join(root, 'tools', 'ace-step-official-v0.1.8', 'acestep', 'acestep_v15_pipeline.py')),
      listProjects()
    ]);
    return {
      schema: SCHEMA,
      mode: 'LOCAL_EXPLICIT_CREATION',
      engines: {
        remotion: { available: visualEngine, backgroundRendering: visualEngine, firstPartyRenderDesk: true },
        ace: { available: aceEngine }
      },
      formats: Object.entries(VISUAL_FORMATS).map(([id, value]) => ({ id, ...value })),
      templates: [...VISUAL_TEMPLATES],
      aceTasks: [...ACE_TASKS],
      projects,
      boundaries: {
        aiRequiredForInterface: false,
        saveTriggersRender: false,
        renderRequiresConfirmation: true,
        nativeGuiEmbedding: false,
        approvalInheritance: false,
        publishing: false,
        arbitraryCommands: false,
        aceCandidateIsMaster: false
      }
    };
  }

  async function save(input = {}) {
    const engine = String(input.engine || 'visual');
    if (!['visual', 'ace'].includes(engine)) throw new AssetForgeError('Unknown Asset Forge engine');
    const existing = input.id ? await readProject(input.id) : null;
    if (existing && existing.engine !== engine) throw new AssetForgeError('A project engine cannot be changed');
    const title = cleanText(input.title, 'Project title', 100, { required: true });
    const id = existing?.id || `${cleanSlug(input.slug || title)}-${randomUUID().slice(0, 8)}`;
    const timestamp = now().toISOString();
    const settings = engine === 'visual' ? normalizeVisual(input.settings || {}) : normalizeAce(input.settings || {});
    if (engine === 'visual' && settings.backgroundPath) {
      const source = await resolveSource(root, settings.backgroundPath, IMAGE_EXTENSIONS, 'Background path');
      if (!await pathExists(source.absolute)) throw new AssetForgeError('Background image was not found', 404);
      settings.backgroundPath = source.relative;
    }
    if (engine === 'ace' && settings.sourceAudioPath) {
      const source = await resolveSource(root, settings.sourceAudioPath, AUDIO_EXTENSIONS, 'Source audio path');
      if (!await pathExists(source.absolute)) throw new AssetForgeError('Source audio was not found', 404);
      settings.sourceAudioPath = source.relative;
    }
    if (engine === 'ace' && ['cover', 'repaint'].includes(settings.task) && !settings.sourceAudioPath) {
      throw new AssetForgeError(`${settings.task} requires a source audio path`);
    }
    const project = {
      schema: PROJECT_SCHEMA,
      id,
      title,
      engine,
      state: 'draft',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      settings,
      lastRender: existing?.lastRender || null,
      boundaries: { approved: false, published: false }
    };
    await writeProject(project);
    return publicProject(project);
  }

  async function prepareProps(project) {
    const settings = { ...project.settings };
    if (settings.backgroundPath) {
      const source = await resolveSource(root, settings.backgroundPath, IMAGE_EXTENSIONS, 'Background path');
      const inputDirectory = path.join(publicInputRoot, project.id);
      await mkdir(inputDirectory, { recursive: true });
      const targetName = `background${path.extname(source.absolute).toLowerCase()}`;
      await copyFile(source.absolute, path.join(inputDirectory, targetName));
      settings.backgroundAsset = `asset-forge/${project.id}/${targetName}`;
    } else {
      settings.backgroundAsset = '';
    }
    const props = { projectId: project.id, title: project.title, ...settings };
    const jobsRoot = path.join(remotionRoot, 'jobs', 'asset-forge');
    await mkdir(jobsRoot, { recursive: true });
    const propsPath = path.join(jobsRoot, `${project.id}.json`);
    await writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`, 'utf8');
    return propsPath;
  }

  async function startRender({ id, confirmed = false } = {}) {
    if (!confirmed) throw new AssetForgeError('Explicit draft render confirmation is required');
    const project = await readProject(id);
    if (project.engine !== 'visual') throw new AssetForgeError('Only visual projects can use the Remotion render path');
    const priorReceipt = await renderReceipt(project);
    if (priorReceipt && ['queued', 'bundling', 'resolving', 'rendering'].includes(priorReceipt.status)) {
      throw new AssetForgeError('This project is already rendering', 409);
    }
    if (!await pathExists(remotionWorker) || !await pathExists(remotionRenderer) || !await pathExists(remotionBundler)) {
      throw new AssetForgeError('Remotion background renderer is not installed', 409);
    }
    const propsPath = await prepareProps(project);
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const extension = project.settings.outputKind === 'still' ? '.png' : '.mp4';
    const outputRelative = project.settings.outputKind === 'still'
      ? path.posix.join('assets', 'generated', 'asset-forge', 'drafts', project.id, `${cleanSlug(project.title)}-${stamp}${extension}`)
      : path.posix.join('content', 'video', 'remotion', 'drafts', 'asset-forge', project.id, `${cleanSlug(project.title)}-${stamp}${extension}`);
    const outputPath = path.join(root, ...outputRelative.split('/'));
    await mkdir(path.dirname(outputPath), { recursive: true });
    const runId = `${project.id}-${randomUUID().slice(0, 8)}`;
    const runRoot = path.join(renderRoot, runId);
    const progressPath = path.join(runRoot, 'progress.json');
    const jobPath = path.join(runRoot, 'job.json');
    const startedAt = now().toISOString();
    const receiptRelative = path.relative(root, progressPath).replaceAll('\\', '/');
    await mkdir(runRoot, { recursive: true });
    const initialReceipt = {
      schema: 'artistos-asset-forge-render-progress/1.0', runId, projectId: id,
      status: 'queued', progress: 0, detail: 'Waiting for the local render worker',
      startedAt, updatedAt: startedAt, outputPath: outputRelative
    };
    const job = {
      schema: 'artistos-asset-forge-render-job/1.0', runId, projectId: id,
      kind: project.settings.outputKind, workspaceRoot: root, remotionRoot,
      entryPoint: remotionEntry, propsPath, outputPath, outputRelative, progressPath
    };
    await writeFile(progressPath, `${JSON.stringify(initialReceipt, null, 2)}\n`, 'utf8');
    await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
    project.updatedAt = startedAt;
    project.lastRender = {
      status: 'queued', progress: 0, detail: initialReceipt.detail, startedAt,
      outputPath: outputRelative, exitCode: null, runId, receiptPath: receiptRelative
    };
    await writeProject(project);
    let child;
    try {
      child = spawnImpl(process.execPath, [remotionWorker, '--job', jobPath], {
        cwd: remotionRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: privateWorkerEnvironment(processEnv)
      });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      child.unref?.();
    } catch (error) {
      const failedAt = now().toISOString();
      await writeFile(progressPath, `${JSON.stringify({
        ...initialReceipt, status: 'failed', progress: 0, detail: 'Render worker could not start',
        updatedAt: failedAt, finishedAt: failedAt, exitCode: -1, error: 'The local render worker could not start'
      }, null, 2)}\n`, 'utf8');
      throw new AssetForgeError('The local render worker could not start', 503);
    }
    return { accepted: true, projectId: id, render: publicProject(project).lastRender };
  }

  return { observe, save, startRender };
}
