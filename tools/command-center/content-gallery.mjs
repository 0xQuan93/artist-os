import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SCHEMA = 'artistos-content-gallery/1.0';
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']);

const CATEGORIES = [
  { id: 'asset-forge', label: 'Asset Forge', match: (value) => value.includes('/asset-forge/') },
  { id: 'wavewarz', label: 'WaveWarz', match: (value) => value.includes('wavewarz') || value.includes('wave-warz') },
  { id: 'music-campaigns', label: 'Music Campaigns', match: (value) => value.includes('/campaigns/') || value.includes('/song-visualizers/') || value.includes('/lyric-videos/') },
  { id: 'brand-system', label: 'Brand System', match: (value) => value.startsWith('/assets/brand/') || value.includes('/branding/') || value.includes('full-regalia') },
  { id: 'artist-wavids', label: 'Artist WavIDs', match: (value) => value.includes('wavid') || value.includes('/artist-identities/') },
  { id: 'genesis-wavforms', label: 'Genesis WavForms', match: (value) => value.includes('wavforms') || value.includes('quantum-quil') },
  { id: 'covers', label: 'Covers', match: (value) => value.includes('/covers/') || value.includes('cover-art') || /(^|[-_/])cover([-. _/]|$)/.test(value) },
  { id: 'motion-video', label: 'Motion & Video', match: (_value, mediaType) => mediaType === 'video' },
  { id: 'music-audio', label: 'Music & Audio', match: (_value, mediaType) => mediaType === 'audio' },
  { id: 'references', label: 'References', match: (value) => value.includes('/reference/') || value.includes('/references/') },
  { id: 'other-assets', label: 'Other Assets', match: () => true }
];

function mediaTypeFor(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return null;
}

function artifactState(value) {
  if (value.includes('/approved/')) return 'approved-lane';
  if (value.includes('/masters/')) return 'master-lane';
  if (value.includes('/draft/') || value.includes('/drafts/')) return 'draft';
  if (value.includes('/candidate/') || value.includes('/candidates/')) return 'candidate';
  if (value.includes('/reference/') || value.includes('/references/')) return 'reference';
  return 'unclassified';
}

function humanTitle(relativePath) {
  return path.basename(relativePath, path.extname(relativePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function walk(directory, workspaceRoot, output) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute, workspaceRoot, output);
    if (!entry.isFile()) return;
    const extension = path.extname(entry.name).toLowerCase();
    const mediaType = mediaTypeFor(extension);
    if (!mediaType) return;
    const details = await stat(absolute);
    const relativePath = path.relative(workspaceRoot, absolute).replaceAll('\\', '/');
    const normalized = `/${relativePath.toLowerCase()}`;
    const category = CATEGORIES.find((entryCategory) => entryCategory.match(normalized, mediaType));
    output.push({
      id: createHash('sha1').update(relativePath).digest('hex').slice(0, 16),
      title: humanTitle(relativePath),
      path: relativePath,
      url: `/workspace-file?path=${encodeURIComponent(relativePath)}`,
      mediaType,
      extension: extension.slice(1),
      categoryId: category.id,
      categoryLabel: category.label,
      artifactState: artifactState(normalized),
      bytes: details.size,
      updatedAt: details.mtime.toISOString()
    });
  }));
}

export function createContentGallery({ workspaceRoot, cacheMilliseconds = 5000, now = () => Date.now() } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const mediaRoots = [
    path.join(root, 'assets'),
    path.join(root, 'content', 'video'),
    path.join(root, 'catalog', 'audio')
  ];
  let cache = null;
  let cachedAt = 0;

  async function observe({ force = false } = {}) {
    if (!force && cache && now() - cachedAt < cacheMilliseconds) return structuredClone(cache);
    const items = [];
    await Promise.all(mediaRoots.map((directory) => walk(directory, root, items)));
    items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.path.localeCompare(b.path));
    const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0]));
    const typeCounts = { image: 0, video: 0, audio: 0 };
    const stateCounts = {};
    for (const item of items) {
      categoryCounts[item.categoryId] += 1;
      typeCounts[item.mediaType] += 1;
      stateCounts[item.artifactState] = (stateCounts[item.artifactState] || 0) + 1;
    }
    cache = {
      schema: SCHEMA,
      mode: 'READ_ONLY_LOCAL_MEDIA',
      generatedAt: new Date(now()).toISOString(),
      categories: CATEGORIES.map(({ id, label }) => ({ id, label, count: categoryCounts[id] })),
      counts: { total: items.length, byType: typeCounts, byArtifactState: stateCounts },
      items,
      boundaries: {
        readOnly: true,
        pathStateIsApproval: false,
        rendering: false,
        publishing: false
      }
    };
    cachedAt = now();
    return structuredClone(cache);
  }

  return { observe };
}
