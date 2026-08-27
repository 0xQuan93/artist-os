import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

describe('portable Command Center core', () => {
  let baseUrl;
  let previousWorkspaceRoot;
  let server;
  let workspaceRoot;

  before(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'artistos-command-center-'));
    previousWorkspaceRoot = process.env.ARTISTOS_WORKSPACE_ROOT;
    process.env.ARTISTOS_WORKSPACE_ROOT = workspaceRoot;
    const module = await import(`../server.mjs?portable=${Date.now()}`);
    server = module.createCommandCenterServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousWorkspaceRoot === undefined) delete process.env.ARTISTOS_WORKSPACE_ROOT;
    else process.env.ARTISTOS_WORKSPACE_ROOT = previousWorkspaceRoot;
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('starts with empty optional source packs', async () => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.deepEqual(dashboard.journey.chapters, []);
    assert.deepEqual(dashboard.approvals, []);
    assert.deepEqual(dashboard.musicLab.items, []);
    assert.equal(dashboard.musicLab.assemblyStatus, 'not configured');
  });

  it('creates local operational state on the first save', async () => {
    const response = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentPipeline: [], activity: [] })
    });
    assert.equal(response.status, 200);
    const statePath = path.join(workspaceRoot, 'catalog', 'operations', 'command-center-state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.schemaVersion, 2);
  });
});
