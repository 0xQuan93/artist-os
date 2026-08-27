import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const JOB_SCHEMA = 'artistos-asset-forge-render-job/1.0';

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const jobFlag = process.argv.indexOf('--job');
if (jobFlag === -1 || !process.argv[jobFlag + 1]) throw new Error('A render job path is required');
const jobPath = path.resolve(process.argv[jobFlag + 1]);
const job = JSON.parse(await readFile(jobPath, 'utf8'));
if (job.schema !== JOB_SCHEMA) throw new Error('Unsupported Asset Forge render job');

const workspaceRoot = path.resolve(job.workspaceRoot);
const remotionRoot = path.resolve(job.remotionRoot);
const progressPath = path.resolve(job.progressPath);
const outputPath = path.resolve(job.outputPath);
const propsPath = path.resolve(job.propsPath);
const entryPoint = path.resolve(job.entryPoint);
const runRoot = path.dirname(jobPath);
if (!inside(jobPath, runRoot) || !inside(progressPath, runRoot)) throw new Error('Render receipt paths are outside the run directory');
if (!inside(outputPath, workspaceRoot) || !inside(propsPath, remotionRoot) || !inside(entryPoint, remotionRoot)) throw new Error('Render paths are outside their allowed roots');

const startedAt = new Date().toISOString();
let lastPercent = -1;
let reportQueue = Promise.resolve();
function report(status, percent, detail, extra = {}) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  if (normalizedPercent === lastPercent && !['complete', 'failed'].includes(status)) return reportQueue;
  lastPercent = normalizedPercent;
  const receipt = {
    schema: 'artistos-asset-forge-render-progress/1.0',
    runId: job.runId,
    projectId: job.projectId,
    status,
    progress: normalizedPercent,
    detail,
    startedAt,
    updatedAt: new Date().toISOString(),
    outputPath: job.outputRelative,
    ...extra
  };
  reportQueue = reportQueue.then(async () => {
    const temporary = `${progressPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await rename(temporary, progressPath);
  });
  return reportQueue;
}

const safeError = (error) => String(error?.message || error || 'Unknown render error')
  .replaceAll(workspaceRoot, '[workspace]')
  .replaceAll(remotionRoot, '[remotion]')
  .slice(0, 500);

const browserCandidates = process.platform === 'win32' ? [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
] : [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
const browserExecutable = browserCandidates.find((candidate) => candidate && existsSync(candidate));
if (!browserExecutable) {
  await report('failed', 0, 'Render browser is unavailable', {
    finishedAt: new Date().toISOString(), exitCode: 1,
    error: 'Install Chrome, Chromium, Edge, or Brave, or set REMOTION_BROWSER_EXECUTABLE.'
  });
  process.exit(1);
}

process.on('unhandledRejection', (error) => {
  void report('failed', Math.max(lastPercent, 1), 'Render failed', {
    finishedAt: new Date().toISOString(), exitCode: 1, error: safeError(error)
  }).finally(() => process.exit(1));
});

let serveUrl = null;
try {
  const inputProps = JSON.parse(await readFile(propsPath, 'utf8'));
  await report('bundling', 2, 'Preparing the deterministic Remotion bundle');
  serveUrl = await bundle({
    entryPoint,
    rootDir: remotionRoot,
    outDir: path.join(runRoot, 'bundle'),
    onProgress: (progress) => { void report('bundling', 2 + (progress / 100) * 23, 'Preparing the deterministic Remotion bundle'); }
  });
  await report('resolving', 27, 'Resolving the QUIL composition');
  const composition = await selectComposition({
    serveUrl,
    id: 'QuilAssetForgeVisual',
    inputProps,
    browserExecutable,
    chromeMode: 'chrome-for-testing',
    logLevel: 'warn'
  });
  if (job.kind === 'still') {
    await report('rendering', 52, 'Rendering the final still frame');
    await renderStill({
      composition,
      serveUrl,
      output: outputPath,
      inputProps,
      frame: 0,
      imageFormat: 'png',
      overwrite: true,
      browserExecutable,
      chromeMode: 'chrome-for-testing',
      logLevel: 'warn'
    });
    await report('rendering', 96, 'Writing the final still frame');
  } else if (job.kind === 'motion') {
    await report('rendering', 30, 'Rendering and encoding the motion draft');
    await renderMedia({
      composition,
      serveUrl,
      outputLocation: outputPath,
      inputProps,
      codec: 'h264',
      crf: 18,
      muted: true,
      overwrite: true,
      browserExecutable,
      chromeMode: 'chrome-for-testing',
      logLevel: 'warn',
      onProgress: ({ progress }) => { void report('rendering', 30 + progress * 66, 'Rendering and encoding the motion draft'); }
    });
  } else {
    throw new Error('Unknown render kind');
  }
  await report('complete', 100, 'Draft ready for review', { finishedAt: new Date().toISOString(), exitCode: 0 });
} catch (error) {
  await report('failed', Math.max(lastPercent, 1), 'Render failed', {
    finishedAt: new Date().toISOString(),
    exitCode: 1,
    error: safeError(error)
  });
  process.exitCode = 1;
} finally {
  if (serveUrl && inside(path.resolve(serveUrl), runRoot)) await rm(serveUrl, { recursive: true, force: true }).catch(() => {});
}
