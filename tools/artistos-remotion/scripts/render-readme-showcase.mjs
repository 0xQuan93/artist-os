import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '..', '..', 'docs', 'media');
const cli = path.join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const entry = path.join(root, 'src', 'asset-forge-entry.ts');
mkdirSync(output, { recursive: true });

function render(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

render(['still', entry, 'ArtistOsRepositoryShowcase', path.join(output, 'artistos-hero.png'), '--frame=72', '--overwrite']);
render(['render', entry, 'ArtistOsRepositoryShowcase', path.join(output, 'artistos-showcase.gif'), '--codec=gif', '--scale=0.6', '--every-nth-frame=3', '--number-of-gif-loops=0', '--overwrite']);

for (const [props, file] of [
  ['release-night.json', 'example-release-night.png'],
  ['studio-open.json', 'example-studio-open.png'],
  ['midnight-transmission.json', 'example-midnight-transmission.png']
]) {
  render(['still', entry, 'QuilAssetForgeVisual', path.join(output, file), `--props=${path.join(root, 'examples', props)}`, '--overwrite']);
}
