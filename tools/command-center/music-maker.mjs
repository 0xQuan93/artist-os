import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { access, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SCHEMA = 'artistos-music-maker/1.0';
const PROJECT_SCHEMA = 'artistos-tool-project/1.0';
const API_ORIGIN = 'http://127.0.0.1:8001';
const TASKS = new Set(['text2music', 'cover', 'repaint']);
const MODELS = new Set(['acestep-v15-turbo', 'acestep-v15-sft']);
const SOURCE_AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);
const DOWNLOAD_AUDIO_EXTENSIONS = new Set(['.wav']);
const SOURCE_ROOTS = ['assets', 'content', path.join('catalog', 'audio')];
const SETTING_KEYS = new Set([
  'task', 'model', 'caption', 'lyrics', 'durationSeconds', 'bpm', 'key', 'timeSignature',
  'seed', 'sourceAudioPath', 'repaintStart', 'repaintEnd'
]);
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

export class MusicMakerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MusicMakerError';
    this.status = status;
  }
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function cleanText(value, label, max, required = false) {
  if (typeof value !== 'string') throw new MusicMakerError(`${label} must be text`);
  const result = value.trim();
  if (result.includes('\0')) throw new MusicMakerError(`${label} contains an invalid character`);
  if (required && !result) throw new MusicMakerError(`${label} is required`);
  if (result.length > max) throw new MusicMakerError(`${label} must be ${max} characters or fewer`);
  return result;
}

function numberIn(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new MusicMakerError(`${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}`);
  }
  return value;
}

function safeSlug(value, fallback) {
  const result = String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return result || fallback;
}

function relativeToWorkspace(workspaceRoot, filePath) {
  const relative = path.relative(workspaceRoot, filePath);
  if (!inside(filePath, workspaceRoot)) throw new MusicMakerError('Resolved path escaped the workspace');
  return relative.replaceAll('\\', '/');
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash.digest('hex');
}

async function removeIfPresent(filePath) {
  try { await unlink(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, filePath);
  } catch (error) {
    await removeIfPresent(temporary);
    throw error;
  }
}

async function assertSafeExistingFile(baseRoot, candidate, label) {
  const resolvedBase = path.resolve(baseRoot);
  const resolvedCandidate = path.resolve(candidate);
  if (!inside(resolvedCandidate, resolvedBase) || resolvedCandidate === resolvedBase) {
    throw new MusicMakerError(`${label} escaped its approved root`);
  }
  const segments = path.relative(resolvedBase, resolvedCandidate).split(path.sep).filter(Boolean);
  let cursor = resolvedBase;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if (error.code === 'ENOENT') throw new MusicMakerError(`${label} was not found`, 404);
      throw error;
    }
    if (info.isSymbolicLink()) throw new MusicMakerError(`${label} cannot traverse symbolic links`);
    if (index < segments.length - 1 && !info.isDirectory()) throw new MusicMakerError(`${label} has an invalid parent path`);
    if (index === segments.length - 1 && !info.isFile()) throw new MusicMakerError(`${label} must be a file`);
  }
  const [physicalBase, physicalCandidate] = await Promise.all([realpath(resolvedBase), realpath(resolvedCandidate)]);
  if (!inside(physicalCandidate, physicalBase)) throw new MusicMakerError(`${label} escaped its approved root`);
  return physicalCandidate;
}

async function ensureSafeDirectory(baseRoot, target) {
  const resolvedBase = path.resolve(baseRoot);
  const resolvedTarget = path.resolve(target);
  if (!inside(resolvedTarget, resolvedBase)) throw new MusicMakerError('Output directory escaped its approved root');
  const segments = path.relative(resolvedBase, resolvedTarget).split(path.sep).filter(Boolean);
  let cursor = resolvedBase;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { await mkdir(cursor); }
      catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
      info = await lstat(cursor);
    }
    if (info.isSymbolicLink()) throw new MusicMakerError('Output directory cannot traverse symbolic links');
    if (!info.isDirectory()) throw new MusicMakerError('Output path contains a non-directory entry');
  }
  const [physicalBase, physicalTarget] = await Promise.all([realpath(resolvedBase), realpath(resolvedTarget)]);
  if (!inside(physicalTarget, physicalBase)) throw new MusicMakerError('Output directory escaped its approved root');
  return resolvedTarget;
}

function lockedProcessEnv(values) {
  const env = { ...process.env };
  const controlled = new Set([...Object.keys(values), 'ACESTEP_CONFIG_PATH3'].map((key) => key.toLowerCase()));
  for (const key of Object.keys(env)) if (controlled.has(key.toLowerCase())) delete env[key];
  return { ...env, ...values, ACESTEP_CONFIG_PATH3: '' };
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    status: job.status,
    submittedAt: job.submittedAt,
    finishedAt: job.finishedAt || null,
    outputs: job.outputs || [],
    receiptPath: job.receiptPath || null,
    boundary: 'Generated audio only; no selection, mastering, approval, release, or publication state is granted.'
  };
}

function officialResultAudioRefs(value) {
  if (!Array.isArray(value)) throw new MusicMakerError('ACE-Step returned an invalid audio result', 502);
  const refs = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (typeof item.file === 'string' && item.file.trim()) refs.push(item.file.trim());
  }
  const unique = [...new Set(refs)];
  if (!unique.length || unique.length > 4) throw new MusicMakerError('ACE-Step returned an invalid audio result', 502);
  return unique;
}

function parseAudioDownloadRef(value, runtimeAudioRoot) {
  if (typeof value !== 'string' || !value) throw new MusicMakerError('ACE-Step returned an invalid audio reference', 502);
  let url;
  try { url = new URL(value, API_ORIGIN); }
  catch { throw new MusicMakerError('ACE-Step returned an invalid audio reference', 502); }
  if (url.origin !== API_ORIGIN || url.pathname !== '/v1/audio' || url.username || url.password || url.hash) {
    throw new MusicMakerError('ACE-Step returned a disallowed audio reference', 502);
  }
  const entries = [...url.searchParams.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'path' || !entries[0][1] || entries[0][1].includes('\0')) {
    throw new MusicMakerError('ACE-Step returned an invalid audio reference', 502);
  }
  const serverPath = entries[0][1];
  if (!path.isAbsolute(serverPath)) throw new MusicMakerError('ACE-Step returned an invalid audio reference', 502);
  const resolvedServerPath = path.resolve(serverPath);
  if (!inside(resolvedServerPath, path.resolve(runtimeAudioRoot))) {
    throw new MusicMakerError('ACE-Step audio reference escaped its runtime output directory', 502);
  }
  const extension = path.extname(resolvedServerPath).toLowerCase();
  if (!DOWNLOAD_AUDIO_EXTENSIONS.has(extension)) throw new MusicMakerError('ACE-Step returned an unsupported audio type', 502);
  return { url: url.toString(), extension };
}

function defaultProbe(url, apiKey) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(800)
  }).then((response) => response.ok).catch(() => false);
}

function asMusicMakerError(error, fallback = 'ACE-Step generation failed', status = 502) {
  return error instanceof MusicMakerError ? error : new MusicMakerError(fallback, status);
}

export function createMusicMaker({
  workspaceRoot,
  spawnImpl = spawn,
  fetchImpl = fetch,
  probeImpl = defaultProbe,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date(),
  pollIntervalMs = 1000,
  maxPollAttempts = 1800,
  maxDownloadBytes = MAX_DOWNLOAD_BYTES,
  randomBytesImpl = randomBytes
} = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const aceRoot = path.join(root, 'tools', 'ace-step-official-v0.1.8');
  const python = path.join(aceRoot, '.venv', 'Scripts', 'python.exe');
  const apiServer = path.join(aceRoot, 'acestep', 'api_server.py');
  const projectRoot = path.join(root, 'catalog', 'operations', 'tool-projects');
  const audioRoot = path.join(root, 'catalog', 'audio');
  const songDevelopmentRoot = path.join(audioRoot, 'song-development');
  const runtimeCacheRoot = path.join(aceRoot, '.cache', 'acestep');
  const runtimeTmp = path.join(runtimeCacheRoot, 'tmp');
  const runtimeAudioRoot = path.join(runtimeTmp, 'api_audio');
  const tritonCacheRoot = path.join(runtimeCacheRoot, 'triton');
  const inductorCacheRoot = path.join(runtimeCacheRoot, 'torchinductor');
  const apiKey = randomBytesImpl(32).toString('base64url');
  const jobs = new Map();
  let runtime = null;

  async function installed() {
    return (await Promise.all([exists(python), exists(apiServer)])).every(Boolean);
  }

  async function online() {
    return probeImpl(`${API_ORIGIN}/health`, apiKey);
  }

  async function observe() {
    const [available, isOnline] = await Promise.all([installed(), online()]);
    const exited = runtime && runtime.exitCode !== null;
    return {
      schema: SCHEMA,
      mode: 'LOCAL_FIRST_PARTY_REST',
      engine: {
        product: 'ACE-Step 1.5', release: 'official-v0.1.8', transport: 'REST',
        origin: API_ORIGIN, available, online: isOnline,
        status: isOnline ? 'online' : !available ? 'absent' : runtime && !exited ? 'launching' : exited ? 'stopped' : 'ready'
      },
      jobs: [...jobs.values()].map(publicJob),
      boundaries: {
        loopbackOnly: true,
        gradio: false,
        serverKeyExposed: false,
        launchRequiresConfirmation: true,
        generationRequiresConfirmation: true,
        optionalPack: true,
        approvalInheritance: false,
        mastering: false,
        publishing: false,
        audioDownloadRouteOnly: true,
        repaint: {
          enabled: false,
          reason: 'The official REST contract cannot disable output normalization, so strict bounded preservation cannot be guaranteed.'
        }
      }
    };
  }

  async function prepareRuntimeDirectories() {
    await ensureSafeDirectory(root, runtimeAudioRoot);
    await ensureSafeDirectory(root, tritonCacheRoot);
    await ensureSafeDirectory(root, inductorCacheRoot);
  }

  async function launch({ confirmed = false } = {}) {
    if (!confirmed) throw new MusicMakerError('Explicit ACE API launch confirmation is required');
    const snapshot = await observe();
    if (snapshot.engine.online || snapshot.engine.status === 'launching') return { launched: false, engine: snapshot.engine };
    if (!snapshot.engine.available) throw new MusicMakerError('ACE-Step optional pack is not installed', 409);
    await prepareRuntimeDirectories();
    const env = lockedProcessEnv({
      ACESTEP_API_HOST: '127.0.0.1',
      ACESTEP_API_PORT: '8001',
      ACESTEP_API_KEY: apiKey,
      ACESTEP_API_WORKERS: '1',
      ACESTEP_QUEUE_WORKERS: '1',
      ACESTEP_CONFIG_PATH: 'acestep-v15-turbo',
      ACESTEP_CONFIG_PATH2: 'acestep-v15-sft',
      ACESTEP_LM_MODEL_PATH: 'acestep-5Hz-lm-0.6B',
      ACESTEP_LM_BACKEND: 'pt',
      ACESTEP_NO_INIT: 'false',
      ACESTEP_TMPDIR: runtimeTmp,
      TEMP: runtimeTmp,
      TMP: runtimeTmp,
      TMPDIR: runtimeTmp,
      TRITON_CACHE_DIR: tritonCacheRoot,
      TORCHINDUCTOR_CACHE_DIR: inductorCacheRoot
    });
    const child = spawnImpl(python, ['-m', 'acestep.api_server', '--host', '127.0.0.1', '--port', '8001'], {
      cwd: aceRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env
    });
    runtime = { startedAt: now().toISOString(), exitCode: null };
    child.once('exit', (code) => { runtime.exitCode = Number.isInteger(code) ? code : -1; });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref?.();
    return { launched: true, engine: (await observe()).engine };
  }

  async function validatedSource(relativePath) {
    const normalized = cleanText(relativePath, 'Source audio path', 320, true).replaceAll('\\', '/');
    if (path.isAbsolute(normalized)) throw new MusicMakerError('Source audio path must be workspace-relative');
    const absolute = path.resolve(root, ...normalized.split('/'));
    if (!SOURCE_ROOTS.some((sourceRoot) => inside(absolute, path.resolve(root, sourceRoot)))) {
      throw new MusicMakerError('Source audio path must stay inside an approved workspace media folder');
    }
    if (!SOURCE_AUDIO_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
      throw new MusicMakerError('Source audio type is not supported');
    }
    const physical = await assertSafeExistingFile(root, absolute, 'Source audio');
    return {
      absolute: physical,
      relative: relativeToWorkspace(root, absolute),
      sha256: await sha256(physical),
      extension: path.extname(physical).toLowerCase()
    };
  }

  async function readProject(projectId) {
    if (typeof projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(projectId)) {
      throw new MusicMakerError('A valid Asset Forge project ID is required');
    }
    const projectPath = path.join(projectRoot, `${projectId}.json`);
    const physicalProjectPath = await assertSafeExistingFile(root, projectPath, 'Asset Forge ACE project');
    let project;
    try { project = JSON.parse(await readFile(physicalProjectPath, 'utf8')); }
    catch (error) {
      if (error instanceof SyntaxError) throw new MusicMakerError('Asset Forge project JSON is invalid');
      throw error;
    }
    if (!project || project.schema !== PROJECT_SCHEMA || project.id !== projectId || project.engine !== 'ace') {
      throw new MusicMakerError('Project is not a validated Asset Forge ACE project');
    }
    const title = cleanText(project.title, 'Project title', 100, true);
    const settings = project.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new MusicMakerError('ACE settings are required');
    for (const key of Object.keys(settings)) if (!SETTING_KEYS.has(key)) throw new MusicMakerError(`Unknown ACE setting: ${key}`);
    if (!TASKS.has(settings.task)) throw new MusicMakerError('Unknown ACE task');
    if (!MODELS.has(settings.model)) throw new MusicMakerError('Unknown ACE model');
    const clean = {
      task: settings.task,
      model: settings.model,
      caption: cleanText(settings.caption, 'Caption', 512, true),
      lyrics: cleanText(settings.lyrics, 'Lyrics', 4096),
      durationSeconds: numberIn(settings.durationSeconds, 'Duration', 10, 600),
      bpm: numberIn(settings.bpm, 'BPM', 30, 300),
      key: cleanText(settings.key, 'Key', 24),
      timeSignature: numberIn(settings.timeSignature, 'Time signature', 2, 6, true),
      seed: numberIn(settings.seed, 'Seed', 0, 2147483647, true),
      sourceAudioPath: cleanText(settings.sourceAudioPath, 'Source audio path', 320),
      repaintStart: numberIn(settings.repaintStart, 'Repaint start', 0, settings.durationSeconds),
      repaintEnd: numberIn(settings.repaintEnd, 'Repaint end', 0, settings.durationSeconds)
    };
    if (![2, 3, 4, 6].includes(clean.timeSignature)) throw new MusicMakerError('Time signature must be 2, 3, 4, or 6');
    if (clean.repaintStart !== Math.round(clean.repaintStart * 25) / 25 || clean.repaintEnd !== Math.round(clean.repaintEnd * 25) / 25) {
      throw new MusicMakerError('Repaint bounds must align to 40 ms');
    }
    if (clean.task === 'repaint' && clean.repaintEnd <= clean.repaintStart) throw new MusicMakerError('Repaint end must be after repaint start');
    if (['cover', 'repaint'].includes(clean.task) && !clean.sourceAudioPath) throw new MusicMakerError(`${clean.task} requires source audio`);
    const source = clean.sourceAudioPath ? await validatedSource(clean.sourceAudioPath) : null;
    return { id: projectId, title, settings: clean, source };
  }

  function buildRequest(settings) {
    return {
      prompt: settings.caption,
      lyrics: settings.lyrics,
      thinking: settings.task === 'text2music',
      sample_mode: false,
      use_format: false,
      is_format_caption: false,
      use_cot_caption: false,
      use_cot_language: false,
      vocal_language: 'en',
      model: settings.model,
      bpm: settings.bpm,
      key_scale: settings.key,
      time_signature: String(settings.timeSignature),
      inference_steps: settings.model === 'acestep-v15-turbo' ? 8 : 50,
      guidance_scale: 7,
      use_random_seed: false,
      seed: settings.seed,
      audio_duration: settings.durationSeconds,
      batch_size: 1,
      repainting_start: settings.repaintStart,
      repainting_end: settings.repaintEnd,
      task_type: settings.task,
      chunk_mask_mode: settings.task === 'repaint' ? 'explicit' : 'auto',
      repaint_mode: settings.task === 'repaint' ? 'conservative' : 'balanced',
      repaint_latent_crossfade_frames: settings.task === 'repaint' ? 25 : 10,
      repaint_wav_crossfade_sec: settings.task === 'repaint' ? 0.05 : 0,
      audio_cover_strength: 1,
      cover_noise_strength: 0,
      audio_format: 'wav',
      lm_model_path: 'acestep-5Hz-lm-0.6B',
      lm_backend: 'pt'
    };
  }

  async function parseApiJson(response) {
    if (!response.ok) throw new MusicMakerError(`ACE-Step API request failed (${response.status})`, 502);
    let payload;
    try { payload = await response.json(); }
    catch { throw new MusicMakerError('ACE-Step API returned invalid JSON', 502); }
    if (payload?.code !== 200) throw new MusicMakerError('ACE-Step API rejected the request', 502);
    return payload;
  }

  async function apiPost(route, body) {
    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}${route}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw new MusicMakerError('ACE-Step API is unavailable', 503);
    }
    return parseApiJson(response);
  }

  async function releaseTask(request, source) {
    let body;
    let headers;
    if (source) {
      body = new FormData();
      for (const [key, value] of Object.entries(request)) {
        if (value !== null && value !== undefined) body.append(key, String(value));
      }
      const contentTypes = {
        '.aac': 'audio/aac', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wav': 'audio/wav'
      };
      body.append('src_audio', await openAsBlob(source.absolute, { type: contentTypes[source.extension] || 'application/octet-stream' }), `source${source.extension}`);
      headers = { Authorization: `Bearer ${apiKey}` };
    } else {
      body = JSON.stringify(request);
      headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    }
    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}/release_task`, {
        method: 'POST', headers, body, signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw new MusicMakerError('ACE-Step API is unavailable', 503);
    }
    return parseApiJson(response);
  }

  async function downloadAudio(reference, destination, outputRoot) {
    const parsed = parseAudioDownloadRef(reference, runtimeAudioRoot);
    if (!inside(path.resolve(destination), path.resolve(outputRoot))) throw new MusicMakerError('Audio destination escaped its job directory', 500);
    try {
      await lstat(destination);
      throw new MusicMakerError('Audio destination already exists', 409);
    } catch (error) {
      if (error instanceof MusicMakerError) throw error;
      if (error.code !== 'ENOENT') throw error;
    }
    let response;
    try {
      response = await fetchImpl(parsed.url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5 * 60_000)
      });
    } catch {
      throw new MusicMakerError('ACE-Step audio download failed', 502);
    }
    if (!response.ok) throw new MusicMakerError(`ACE-Step audio download failed (${response.status})`, 502);
    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxDownloadBytes) {
      throw new MusicMakerError('ACE-Step audio download exceeded the size limit', 502);
    }
    if (!response.body) throw new MusicMakerError('ACE-Step audio download was empty', 502);
    const temporary = path.join(outputRoot, `.download-${randomBytes(8).toString('hex')}.tmp`);
    let bytes = 0;
    let promoted = false;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        if (bytes > maxDownloadBytes) callback(new MusicMakerError('ACE-Step audio download exceeded the size limit', 502));
        else callback(null, chunk);
      }
    });
    try {
      const readable = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body;
      await pipeline(readable, limiter, createWriteStream(temporary, { flags: 'wx' }));
      if (bytes <= 0) throw new MusicMakerError('ACE-Step audio download was empty', 502);
      await rename(temporary, destination);
      promoted = true;
      const details = await stat(destination);
      return { sha256: await sha256(destination), bytes: details.size, extension: parsed.extension };
    } catch (error) {
      if (promoted) await removeIfPresent(destination);
      throw asMusicMakerError(error, 'ACE-Step audio download could not be stored', 502);
    } finally {
      await removeIfPresent(temporary);
    }
  }

  async function generate({ projectId, confirmed = false } = {}) {
    if (!confirmed) throw new MusicMakerError('Explicit music generation confirmation is required');
    if (!await installed()) throw new MusicMakerError('ACE-Step optional pack is not installed', 409);
    const project = await readProject(projectId);
    if (project.settings.task === 'repaint') {
      throw new MusicMakerError('Repaint is disabled because the official REST contract cannot guarantee strict bounded preservation', 409);
    }
    if (!await online()) throw new MusicMakerError('ACE-Step API is not online', 409);
    await prepareRuntimeDirectories();
    const projectSlug = safeSlug(project.title, safeSlug(project.id, 'music-project'));
    const projectOutputRoot = path.join(songDevelopmentRoot, projectSlug, 'generated', 'ace-step');
    await ensureSafeDirectory(root, projectOutputRoot);
    const request = buildRequest(project.settings);
    const source = project.settings.task === 'cover' ? project.source : null;
    const released = await releaseTask(request, source);
    const taskId = released?.data?.task_id || released?.data?.id;
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(taskId)) {
      throw new MusicMakerError('ACE-Step returned an invalid task ID', 502);
    }

    const submittedAt = now().toISOString();
    const outputRoot = path.join(projectOutputRoot, taskId);
    let receiptPath = path.join(outputRoot, 'receipt.json');
    const receipt = {
      schema: 'artistos-ace-step-generation-receipt/1.0',
      jobId: taskId,
      projectId: project.id,
      projectTitle: project.title,
      status: 'submitted',
      submittedAt,
      engine: { product: 'ACE-Step 1.5', release: 'official-v0.1.8', transport: 'REST', origin: API_ORIGIN },
      request,
      source: source ? { path: source.relative, sha256: source.sha256 } : null,
      outputs: [],
      boundaries: { artistSelected: false, master: false, approved: false, released: false, published: false }
    };
    const job = { jobId: taskId, projectId: project.id, status: 'submitted', submittedAt, receiptPath: null, outputs: [] };
    jobs.set(taskId, job);

    try {
      await ensureSafeDirectory(projectOutputRoot, outputRoot);
      job.receiptPath = relativeToWorkspace(root, receiptPath);
      await writeJsonAtomic(receiptPath, receipt);
    } catch (error) {
      const failure = asMusicMakerError(error, 'The generation receipt directory could not be prepared', 500);
      const finishedAt = now().toISOString();
      receiptPath = path.join(projectOutputRoot, `failed-${taskId}.json`);
      Object.assign(receipt, { status: 'failed', finishedAt, error: failure.message });
      Object.assign(job, { status: 'failed', finishedAt, receiptPath: relativeToWorkspace(root, receiptPath) });
      await writeJsonAtomic(receiptPath, receipt);
      throw failure;
    }

    const promotedOutputs = [];
    try {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (attempt > 0) await sleepImpl(pollIntervalMs);
        const queried = await apiPost('/query_result', { task_id_list: [taskId] });
        const record = Array.isArray(queried.data) ? queried.data.find((item) => item?.task_id === taskId) : null;
        if (!record || record.status === 0) continue;
        if (record.status === 2) throw new MusicMakerError('ACE-Step reported a technical generation failure', 502);
        if (record.status !== 1) throw new MusicMakerError('ACE-Step returned an invalid task status', 502);
        let result;
        try { result = typeof record.result === 'string' ? JSON.parse(record.result) : record.result; }
        catch { throw new MusicMakerError('ACE-Step returned an invalid result', 502); }
        const references = officialResultAudioRefs(result);
        const outputs = [];
        for (let index = 0; index < references.length; index += 1) {
          const parsed = parseAudioDownloadRef(references[index], runtimeAudioRoot);
          const name = `audio-${String(index + 1).padStart(2, '0')}${parsed.extension}`;
          const destination = path.join(outputRoot, name);
          const downloaded = await downloadAudio(references[index], destination, outputRoot);
          promotedOutputs.push(destination);
          outputs.push({ path: relativeToWorkspace(root, destination), sha256: downloaded.sha256, bytes: downloaded.bytes });
        }
        const finishedAt = now().toISOString();
        Object.assign(receipt, { status: 'succeeded', finishedAt, outputs });
        Object.assign(job, { status: 'succeeded', finishedAt, outputs });
        await writeJsonAtomic(receiptPath, receipt);
        return publicJob(job);
      }
      throw new MusicMakerError('ACE-Step generation polling timed out', 504);
    } catch (error) {
      const failure = asMusicMakerError(error);
      for (const output of promotedOutputs) await removeIfPresent(output);
      const finishedAt = now().toISOString();
      Object.assign(receipt, { status: 'failed', finishedAt, outputs: [], error: failure.message });
      Object.assign(job, { status: 'failed', finishedAt, outputs: [] });
      try { await writeJsonAtomic(receiptPath, receipt); }
      catch { throw new MusicMakerError('Generation failed and its durable receipt could not be updated', 500); }
      throw failure;
    }
  }

  return { observe, launch, generate };
}
