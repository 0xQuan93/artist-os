import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const commandCenterRoot = path.resolve(import.meta.dirname, '..');

async function readUiSources() {
  const [html, app, wrapperCss, creativeTools] = await Promise.all([
    readFile(path.join(commandCenterRoot, 'public', 'index.html'), 'utf8'),
    readFile(path.join(commandCenterRoot, 'public', 'app.js'), 'utf8'),
    readFile(path.join(commandCenterRoot, 'public', 'artistos-wrapper.css'), 'utf8'),
    readFile(path.join(commandCenterRoot, 'creative-tools.mjs'), 'utf8')
  ]);
  return { html, app, wrapperCss, creativeTools };
}

describe('first-party ArtistOS maker shell', () => {
  it('keeps protected identity media dormant until the session authenticates', async () => {
    const { html, app } = await readUiSources();

    assert.match(html, /id="identity-sigil"/);
    assert.match(html, /id="identity-sigil"[^>]*>89<\/span>/);
    assert.doesNotMatch(html, /<img[^>]+\ssrc="\/workspace-file\?path=[^>]+REGALIA Crown Engine/);
    assert.match(app, /identitySigil\.setAttribute\('src', identitySigil\.dataset\.authSrc\)/);
    assert.match(app, /if \(!authenticated\) identitySigil\.removeAttribute\('src'\)/);
  });

  it('preserves explicit blank drafts and reports valid forms before confirmation', async () => {
    const { app } = await readUiSources();

    assert.match(app, /let musicDraftMode = false/);
    assert.match(app, /let visualDraftMode = false/);
    assert.match(app, /musicDraftMode = true/);
    assert.match(app, /visualDraftMode = true/);
    assert.match(app, /const selected = musicDraftMode \? null/);
    assert.match(app, /const selected = visualDraftMode \? null/);
    assert.equal((app.match(/!form\.reportValidity\(\)/g) || []).length, 2);
  });

  it('renders the immediate one-candidate job lifecycle including terminal failure detail', async () => {
    const { app, creativeTools } = await readUiSources();

    assert.match(app, /jobs: \[job, \.\.\.currentJobs\.filter/);
    assert.match(app, /scheduleMusicMakerPoll\(\)/);
    assert.match(app, /job\.status === 'failed'/);
    assert.match(app, /job\.error \|\|/);
    assert.match(app, /job\.status === 'succeeded' && outputs\.length === 1/);
    assert.match(app, /ONE GENERATED CANDIDATE/);
    assert.match(app, /name='bpm'[^>]+step='1'/);
    const musicTool = creativeTools.match(/id: 'music-maker'[\s\S]*?\n  },/)?.[0] || '';
    assert.doesNotMatch(musicTool, /'Repaint'/);
  });

  it('exposes selected project state and legible responsive maker styling', async () => {
    const { app, wrapperCss } = await readUiSources();

    assert.match(app, /data-music-project[^`]+aria-pressed=/);
    assert.match(app, /data-visual-project[^`]+aria-pressed=/);
    assert.match(app, /data-forge-project[^`]+aria-pressed=/);
    assert.match(wrapperCss, /--artistos-type-micro: 0\.6875rem/);
    assert.match(wrapperCss, /grid-template-columns: 30px minmax\(0, 1fr\)/);
    assert.match(wrapperCss, /\.maker-job-body/);
    assert.doesNotMatch(wrapperCss, /font(?:-size)?:[^;\n]*\b[67]px\b/);
    assert.match(wrapperCss, /@media \(max-width: 900px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  });

  it('does not expose native GUI markup, links, ports, or event paths', async () => {
    const { html, app, creativeTools } = await readUiSources();
    const assetForge = await readFile(path.join(commandCenterRoot, 'asset-forge.mjs'), 'utf8');
    const serialized = [html, app, creativeTools, assetForge].join('\n');

    assert.doesNotMatch(serialized, /<iframe|<embed|<object|embedUrl|data-forge-studio|Remotion Studio|Gradio/i);
    assert.doesNotMatch(serialized, /127\.0\.0\.1:(?:7860|8990|8992)/);
    assert.doesNotMatch(serialized, /data-tool-launch|window\.open/);
  });
});
