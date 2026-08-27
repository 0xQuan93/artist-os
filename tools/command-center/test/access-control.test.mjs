import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AccessControlError,
  accessConfig,
  assertSafeAccessConfig,
  constantTimeSecretEqual,
  createAccessControl,
  isLoopbackHost
} from '../access-control.mjs';

const PASSCODE = 'fixture passcode that must stay private';

function cookieHeader(loginResult) {
  return loginResult.setCookie.split(';', 1)[0];
}

describe('ArtistOS access control', () => {
  it('stays disabled and locally open when no passcode is configured', () => {
    const access = createAccessControl({ env: {} });
    assert.deepEqual(access.publicStatus(), {
      schema: 'artistos-access/1.0',
      enabled: false,
      mode: 'local-open',
      passcodeRequired: false,
      authenticatedByDefault: true,
      sessionStorage: 'disabled',
      csrfRequiredForMutations: false,
      publicOriginConfigured: false,
      secureCookies: false
    });
    assert.equal(access.authenticate().authenticated, true);
    assert.equal(access.authorizeMutation().authenticated, true);
    assert.equal(access.login({ passcode: 'ignored', ip: '127.0.0.1' }).setCookie, undefined);
  });

  it('keeps the configured passcode out of config, status, results, and errors', () => {
    const config = accessConfig({ ARTISTOS_ACCESS_PASSCODE: PASSCODE });
    assert.equal(config.passcodeConfigured, true);
    assert.equal(JSON.stringify(config).includes(PASSCODE), false);
    const access = createAccessControl({ config });
    assert.equal(JSON.stringify(access.publicStatus()).includes(PASSCODE), false);
    assert.throws(
      () => access.login({ passcode: 'wrong', ip: '198.51.100.2' }),
      (error) => error instanceof AccessControlError
        && error.status === 401
        && !JSON.stringify(error).includes(PASSCODE)
        && !error.message.includes(PASSCODE)
    );
    const result = access.login({ passcode: PASSCODE, ip: '198.51.100.2' });
    assert.equal(JSON.stringify(result).includes(PASSCODE), false);
    assert.equal(JSON.stringify(result).includes(cookieHeader(result).split('=')[1]), false);
  });

  it('uses fixed-length constant-time digest comparison for passcodes of any length', () => {
    assert.equal(constantTimeSecretEqual('same secret', 'same secret'), true);
    assert.equal(constantTimeSecretEqual('same secret', 'same secret with more bytes'), false);
    assert.equal(constantTimeSecretEqual('', 'x'), false);
  });

  it('rejects unsafe remote binding unless passcode strength and HTTPS origin are valid', () => {
    assert.equal(isLoopbackHost('127.0.0.9'), true);
    assert.equal(isLoopbackHost('[::1]'), true);
    assert.equal(isLoopbackHost('0.0.0.0'), false);
    assert.doesNotThrow(() => assertSafeAccessConfig({ host: '127.0.0.1' }));
    assert.throws(
      () => assertSafeAccessConfig({ host: '0.0.0.0' }),
      (error) => error.code === 'REMOTE_PASSCODE_REQUIRED'
    );
    assert.throws(
      () => assertSafeAccessConfig({
        host: '0.0.0.0',
        passcodeConfigured: true,
        remotePasscodeReady: true,
        publicOrigin: 'http://artistos.example.test'
      }),
      (error) => error.code === 'REMOTE_HTTPS_REQUIRED'
    );
    assert.throws(
      () => createAccessControl({
        host: '0.0.0.0',
        passcode: 'replace-with-a-long-random-passcode',
        publicOrigin: 'https://artistos.example.test'
      }),
      (error) => error.code === 'REMOTE_PASSCODE_TOO_WEAK'
    );
    const remoteConfig = accessConfig({
      ARTISTOS_BIND_HOST: '0.0.0.0',
      ARTISTOS_PUBLIC_ORIGIN: 'https://artistos.example.test',
      ARTISTOS_ACCESS_PASSCODE: PASSCODE
    });
    assert.doesNotThrow(() => assertSafeAccessConfig(remoteConfig));
    assert.doesNotThrow(() => assertSafeAccessConfig({
      host: '0.0.0.0',
      allowInsecureRemote: true
    }));
  });

  it('rechecks the actual listen host against the original safe configuration', () => {
    const open = createAccessControl({ env: {} });
    assert.throws(
      () => open.assertSafeHost('0.0.0.0'),
      (error) => error.code === 'REMOTE_PASSCODE_REQUIRED'
    );
    const protectedAccess = createAccessControl({
      passcode: PASSCODE,
      host: '127.0.0.1',
      publicOrigin: 'https://artistos.example.test'
    });
    assert.doesNotThrow(() => protectedAccess.assertSafeHost('0.0.0.0'));
  });

  it('trusts proxy client addressing only for the explicit value 1', () => {
    assert.equal(accessConfig({}).trustProxy, false);
    assert.equal(accessConfig({ ARTISTOS_TRUST_PROXY: 'true' }).trustProxy, false);
    assert.equal(accessConfig({ ARTISTOS_TRUST_PROXY: '1' }).trustProxy, true);
  });

  it('creates memory-only random sessions with strict HttpOnly cookies and CSRF', () => {
    let now = Date.parse('2026-08-27T12:00:00.000Z');
    const options = {
      passcode: PASSCODE,
      host: '0.0.0.0',
      publicOrigin: 'https://artistos.example.test',
      now: () => now,
      sessionTtlMs: 60_000
    };
    const access = createAccessControl(options);
    const login = access.login({ passcode: PASSCODE, ip: '203.0.113.8' });
    const cookie = cookieHeader(login);
    assert.match(login.setCookie, /^artistos_session=[A-Za-z0-9_-]{43};/);
    assert.match(login.setCookie, /; HttpOnly;/);
    assert.match(login.setCookie, /; SameSite=Strict;/);
    assert.match(login.setCookie, /; Secure$/);
    assert.equal(login.authenticated, true);
    assert.match(login.csrfToken, /^[A-Za-z0-9_-]{43}$/);

    const session = access.authenticate({ cookieHeader: cookie });
    assert.equal(session.authenticated, true);
    assert.equal(session.csrfToken, login.csrfToken);
    assert.throws(
      () => access.authorizeMutation({ cookieHeader: cookie }),
      (error) => error.status === 403 && error.code === 'CSRF_REQUIRED'
    );
    assert.throws(
      () => access.authorizeMutation({ cookieHeader: cookie, csrfToken: 'wrong' }),
      (error) => error.status === 403 && error.code === 'CSRF_REQUIRED'
    );
    assert.equal(access.authorizeMutation({
      cookieHeader: cookie,
      csrfToken: login.csrfToken
    }).authenticated, true);

    const separateProcessLayer = createAccessControl(options);
    assert.equal(separateProcessLayer.authenticate({ cookieHeader: cookie }).authenticated, false);

    now += 60_001;
    assert.equal(access.authenticate({ cookieHeader: cookie }).authenticated, false);
  });

  it('invalidates a session on CSRF-authorized logout', () => {
    const access = createAccessControl({ passcode: PASSCODE });
    const login = access.login({ passcode: PASSCODE, ip: '127.0.0.1' });
    const cookie = cookieHeader(login);
    const logout = access.logout({ cookieHeader: cookie, csrfToken: login.csrfToken });
    assert.match(logout.setCookie, /^artistos_session=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
    assert.equal(access.authenticate({ cookieHeader: cookie }).authenticated, false);
  });

  it('rate-limits failed logins per IP and releases the bucket after its window', () => {
    let now = 1_000_000;
    const access = createAccessControl({
      passcode: PASSCODE,
      now: () => now,
      maxLoginFailures: 2,
      loginWindowMs: 30_000
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(
        () => access.login({ passcode: 'wrong', ip: '198.51.100.10' }),
        (error) => error.status === 401
      );
    }
    assert.throws(
      () => access.login({ passcode: PASSCODE, ip: '198.51.100.10' }),
      (error) => error.status === 429
        && error.code === 'LOGIN_RATE_LIMITED'
        && error.retryAfterSeconds === 30
    );
    assert.throws(
      () => access.login({ passcode: 'wrong', ip: '198.51.100.11' }),
      (error) => error.status === 401
    );
    now += 30_001;
    assert.equal(
      access.login({ passcode: PASSCODE, ip: '198.51.100.10' }).authenticated,
      true
    );
  });
});
