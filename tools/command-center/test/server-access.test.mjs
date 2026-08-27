import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createAccessControl } from '../access-control.mjs';
import { createCommandCenterServer } from '../server.mjs';

const PASSCODE = 'fixture-passcode-that-must-never-leak';

describe('Command Center passcode boundary', () => {
  let baseUrl;
  let launchCalls = 0;
  let server;

  before(async () => {
    const accessControl = createAccessControl({
      passcode: PASSCODE,
      host: '127.0.0.1'
    });
    const musicMaker = {
      async observe() {
        return { schema: 'fixture-music-maker/1.0', available: true };
      },
      async launch(body) {
        launchCalls += 1;
        return { launched: true, confirmed: body?.confirmed === true };
      }
    };
    server = createCommandCenterServer({ accessControl, musicMaker });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
  });

  it('serves the shell while protecting data and mutations behind a session and CSRF token', async () => {
    const responseBodies = [];

    const shellResponse = await fetch(`${baseUrl}/`);
    const shell = await shellResponse.text();
    responseBodies.push(shell);
    assert.equal(shellResponse.status, 200);
    assert.match(shellResponse.headers.get('content-type'), /^text\/html/);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthText = await healthResponse.text();
    const health = JSON.parse(healthText);
    responseBodies.push(healthText);
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);
    assert.equal(health.access.enabled, true);
    assert.equal(health.workspaceRoot, undefined);
    assert.equal(health.node, undefined);

    const statusResponse = await fetch(`${baseUrl}/api/access/status`);
    const statusText = await statusResponse.text();
    const initialStatus = JSON.parse(statusText);
    responseBodies.push(statusText);
    assert.equal(statusResponse.status, 200);
    assert.equal(initialStatus.mode, 'passcode');
    assert.equal(initialStatus.authenticated, false);
    assert.equal(initialStatus.csrfToken, null);

    const blockedDashboard = await fetch(`${baseUrl}/api/dashboard`);
    const blockedDashboardText = await blockedDashboard.text();
    responseBodies.push(blockedDashboardText);
    assert.equal(blockedDashboard.status, 401);
    assert.equal(JSON.parse(blockedDashboardText).code, 'AUTHENTICATION_REQUIRED');

    const blockedMedia = await fetch(
      `${baseUrl}/workspace-file?path=${encodeURIComponent('assets/private-fixture.png')}`
    );
    const blockedMediaText = await blockedMedia.text();
    responseBodies.push(blockedMediaText);
    assert.equal(blockedMedia.status, 401);
    assert.equal(JSON.parse(blockedMediaText).code, 'AUTHENTICATION_REQUIRED');

    const loginResponse = await fetch(`${baseUrl}/api/access/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: PASSCODE })
    });
    const loginText = await loginResponse.text();
    const login = JSON.parse(loginText);
    const setCookie = loginResponse.headers.get('set-cookie');
    responseBodies.push(loginText);
    assert.equal(loginResponse.status, 200);
    assert.equal(login.authenticated, true);
    assert.match(login.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(setCookie, /^artistos_session=[A-Za-z0-9_-]{43};/);
    assert.match(setCookie, /; HttpOnly;/);
    assert.match(setCookie, /; SameSite=Strict;/);
    const cookie = setCookie.split(';', 1)[0];
    const sessionToken = cookie.slice(cookie.indexOf('=') + 1);
    assert.equal(loginText.includes(sessionToken), false);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: cookie }
    });
    const dashboardText = await dashboardResponse.text();
    responseBodies.push(dashboardText);
    assert.equal(dashboardResponse.status, 200);
    assert.equal(JSON.parse(dashboardText).mode, 'LOCAL_PRIVATE');

    const mutationWithoutCsrf = await fetch(`${baseUrl}/api/music-maker/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({ confirmed: true })
    });
    const mutationWithoutCsrfText = await mutationWithoutCsrf.text();
    responseBodies.push(mutationWithoutCsrfText);
    assert.equal(mutationWithoutCsrf.status, 403);
    assert.equal(JSON.parse(mutationWithoutCsrfText).code, 'CSRF_REQUIRED');
    assert.equal(launchCalls, 0);

    const mutationWithCsrf = await fetch(`${baseUrl}/api/music-maker/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-ArtistOS-CSRF': login.csrfToken
      },
      body: JSON.stringify({ confirmed: true })
    });
    const mutationWithCsrfText = await mutationWithCsrf.text();
    responseBodies.push(mutationWithCsrfText);
    assert.equal(mutationWithCsrf.status, 202);
    assert.equal(JSON.parse(mutationWithCsrfText).launched, true);
    assert.equal(launchCalls, 1);

    const logoutResponse = await fetch(`${baseUrl}/api/access/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-ArtistOS-CSRF': login.csrfToken
      }
    });
    const logoutText = await logoutResponse.text();
    responseBodies.push(logoutText);
    assert.equal(logoutResponse.status, 200);
    assert.equal(JSON.parse(logoutText).authenticated, false);
    assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/);

    const clearedStatusResponse = await fetch(`${baseUrl}/api/access/status`, {
      headers: { Cookie: cookie }
    });
    const clearedStatusText = await clearedStatusResponse.text();
    responseBodies.push(clearedStatusText);
    assert.equal(clearedStatusResponse.status, 200);
    assert.equal(JSON.parse(clearedStatusText).authenticated, false);

    const clearedDashboard = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: cookie }
    });
    const clearedDashboardText = await clearedDashboard.text();
    responseBodies.push(clearedDashboardText);
    assert.equal(clearedDashboard.status, 401);

    for (const body of responseBodies) assert.equal(body.includes(PASSCODE), false);
    assert.equal(setCookie.includes(PASSCODE), false);
    assert.equal(logoutResponse.headers.get('set-cookie').includes(PASSCODE), false);
  });
});
