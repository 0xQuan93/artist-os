import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(
  String(process.env.ARTISTOS_WORKSPACE_ROOT || path.resolve(APP_ROOT, '..', '..'))
);

async function present(relativePath) {
  try {
    await access(path.join(WORKSPACE_ROOT, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function workspaceIsWritable() {
  try {
    await access(WORKSPACE_ROOT, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function diagnose() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const publicFiles = await Promise.all(
    ['public/index.html', 'public/app.js', 'public/styles.css', 'public/artistos-wrapper.css', 'public/phosphor-theme.js', 'server.mjs', 'access-control.mjs', 'creative-tools.mjs', 'music-maker.mjs', 'asset-forge.mjs', 'content-gallery.mjs', 'wavforms-nursery.mjs', 'wavid-incubator.mjs', 'wavid-production-definition.mjs', 'quil-live.mjs']
      .map(async (relativePath) => {
        try {
          await access(path.join(APP_ROOT, relativePath), constants.R_OK);
          return true;
        } catch {
          return false;
        }
      })
  );
  const writableWorkspace = await workspaceIsWritable();
  const optional = {
    releaseJourney: await present('assets/campaigns/music/release-journey.json'),
    assetRegistry: await present('artist-profile/asset-registry.md'),
    musicReview: await present('catalog/audio/music-review.json'),
    wavformsGenesis: await present('tools/artistos-remotion/jobs/quantum-quil/wavforms-genesis-555-v1/collection-plan.json'),
    quilLiveContract: (await Promise.all([
      present('tools/command-center/contracts/quil-live-observation.schema.json'),
      present('tools/command-center/examples/quil-live-adapter.mjs'),
      present('tools/command-center/QUIL-LIVE.md')
    ])).every(Boolean),
    wavidProduction: (await Promise.all([
      present('tools/artistos-remotion/scripts/render-wavid-production.mjs'),
      present('tools/artistos-remotion/src/wavid-production-entry.ts'),
      present('tools/artistos-remotion/src/wavid-production-root.tsx'),
      present('tools/artistos-remotion/node_modules/@remotion/cli/remotion-cli.js')
    ])).every(Boolean)
  };
  return {
    ok: nodeMajor >= 20 && publicFiles.every(Boolean) && writableWorkspace,
    node: { version: process.versions.node, supported: nodeMajor >= 20 },
    workspaceRoot: WORKSPACE_ROOT,
    coreFiles: publicFiles.every(Boolean),
    stateStorage: writableWorkspace ? 'ready' : 'not-writable',
    optional,
    integrations: 'disabled-by-default'
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await diagnose();
  console.log('ArtistOS Command Center doctor');
  console.log(`  Node ${result.node.version}: ${result.node.supported ? 'PASS' : 'FAIL (20+ required)'}`);
  console.log(`  Core files: ${result.coreFiles ? 'PASS' : 'FAIL'}`);
  console.log(`  Local state storage: ${result.stateStorage === 'ready' ? 'PASS' : 'FAIL'}`);
  console.log(`  Workspace: ${result.workspaceRoot}`);
  console.log('  Optional source packs:');
  for (const [name, available] of Object.entries(result.optional)) {
    console.log(`    ${name}: ${available ? 'available' : 'not installed (core still works)'}`);
  }
  console.log('  Cloud and AI integrations: disabled by default');
  process.exitCode = result.ok ? 0 : 1;
}
