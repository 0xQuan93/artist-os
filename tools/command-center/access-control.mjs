import {
  createHash,
  randomBytes as cryptoRandomBytes,
  timingSafeEqual
} from 'node:crypto';

export const ACCESS_SESSION_COOKIE = 'artistos_session';

const ACCESS_SCHEMA = 'artistos-access/1.0';
const SESSION_SCHEMA = 'artistos-access-session/1.0';
const CONFIG_SECRETS = new WeakMap();
const LOOPBACK_HOSTS = new Set(['localhost', '::1', '0:0:0:0:0:0:0:1']);
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const MIN_REMOTE_PASSCODE_LENGTH = 16;
const KNOWN_PLACEHOLDER_PASSCODES = new Set([
  'replace-with-a-long-random-passcode',
  'change-me'
]);

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function enabledFlag(value) {
  return stringValue(value).trim() === '1';
}

function remotePasscodeReady(value) {
  const candidate = stringValue(value).trim();
  return candidate.length >= MIN_REMOTE_PASSCODE_LENGTH
    && !KNOWN_PLACEHOLDER_PASSCODES.has(candidate.toLowerCase())
    && new Set(candidate).size > 1;
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined) return object[key];
  }
  return undefined;
}

function normalizedHost(value) {
  const host = stringValue(value, '127.0.0.1').trim().toLowerCase();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function isLoopbackHost(value) {
  const host = normalizedHost(value);
  return LOOPBACK_HOSTS.has(host)
    || host.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(host)
    || host.startsWith('::ffff:127.');
}

function parsePublicOrigin(value) {
  const candidate = stringValue(value).trim();
  if (!candidate) return null;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AccessControlError(
      'ARTISTOS_PUBLIC_ORIGIN must be an HTTP(S) origin.',
      500,
      'INVALID_PUBLIC_ORIGIN'
    );
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.pathname && parsed.pathname !== '/')
    || parsed.search
    || parsed.hash
  ) {
    throw new AccessControlError(
      'ARTISTOS_PUBLIC_ORIGIN must be a credential-free HTTP(S) origin without a path.',
      500,
      'INVALID_PUBLIC_ORIGIN'
    );
  }
  return parsed;
}

function digest(value) {
  return createHash('sha256').update(stringValue(value), 'utf8').digest();
}

function digestKey(value) {
  return digest(value).toString('base64url');
}

/**
 * Compares secrets through fixed-length digests so differing passcode lengths do
 * not create an early-return comparison path.
 */
export function constantTimeSecretEqual(expected, supplied) {
  return timingSafeEqual(digest(expected), digest(supplied));
}

export class AccessControlError extends Error {
  constructor(message, status = 400, code = 'ACCESS_ERROR', options = {}) {
    super(message);
    this.name = 'AccessControlError';
    this.status = status;
    this.code = code;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

/**
 * Reads access settings without making the passcode enumerable. JSON output and
 * ordinary object logging therefore contain configuration state, never the
 * credential itself.
 */
export function accessConfig(env = process.env, overrides = {}) {
  const passcode = Object.hasOwn(overrides, 'passcode')
    ? stringValue(overrides.passcode)
    : stringValue(firstDefined(env, ['ARTISTOS_ACCESS_PASSCODE', 'ARTISTOS_PASSCODE']));
  const host = normalizedHost(
    overrides.host
      ?? firstDefined(env, ['ARTISTOS_BIND_HOST', 'ARTISTOS_HOST'])
      ?? '127.0.0.1'
  );
  const publicOrigin = stringValue(
    overrides.publicOrigin ?? env?.ARTISTOS_PUBLIC_ORIGIN
  ).trim() || null;
  const allowInsecureRemote = Object.hasOwn(overrides, 'allowInsecureRemote')
    ? overrides.allowInsecureRemote === true
    : enabledFlag(firstDefined(env, [
      'ARTISTOS_ALLOW_INSECURE_REMOTE',
      'ARTISTOS_ACCESS_ALLOW_INSECURE_REMOTE'
    ]));
  const parsedOrigin = publicOrigin ? parsePublicOrigin(publicOrigin) : null;
  const trustProxy = Object.hasOwn(overrides, 'trustProxy')
    ? overrides.trustProxy === true
    : enabledFlag(env?.ARTISTOS_TRUST_PROXY);
  const config = Object.freeze({
    schema: ACCESS_SCHEMA,
    enabled: passcode.length > 0,
    passcodeConfigured: passcode.length > 0,
    remotePasscodeReady: remotePasscodeReady(passcode),
    host,
    publicOrigin,
    publicOriginConfigured: Boolean(publicOrigin),
    allowInsecureRemote,
    trustProxy,
    secureCookies: parsedOrigin?.protocol === 'https:',
    sessionTtlMs: integer(
      overrides.sessionTtlMs ?? env?.ARTISTOS_ACCESS_SESSION_TTL_MS,
      8 * 60 * 60 * 1000,
      5 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000
    ),
    loginWindowMs: integer(
      overrides.loginWindowMs ?? env?.ARTISTOS_ACCESS_LOGIN_WINDOW_MS,
      15 * 60 * 1000,
      10_000,
      24 * 60 * 60 * 1000
    ),
    maxLoginFailures: integer(
      overrides.maxLoginFailures ?? env?.ARTISTOS_ACCESS_MAX_LOGIN_FAILURES,
      5,
      1,
      100
    ),
    maxSessions: integer(
      overrides.maxSessions ?? env?.ARTISTOS_ACCESS_MAX_SESSIONS,
      1_000,
      1,
      10_000
    )
  });
  CONFIG_SECRETS.set(config, passcode);
  return config;
}

/**
 * Refuses an accidentally public, unprotected listener. The override is
 * intentionally explicit because it permits both HTTP and an open remote bind.
 */
export function assertSafeAccessConfig(config) {
  const host = normalizedHost(config?.host);
  if (isLoopbackHost(host) || config?.allowInsecureRemote === true) return true;

  const passcodeConfigured = config?.passcodeConfigured === true
    || config?.enabled === true
    || stringValue(config?.passcode).length > 0;
  if (!passcodeConfigured) {
    throw new AccessControlError(
      'A passcode is required when ArtistOS binds beyond loopback.',
      500,
      'REMOTE_PASSCODE_REQUIRED'
    );
  }

  const origin = parsePublicOrigin(config?.publicOrigin);
  if (!origin || origin.protocol !== 'https:') {
    throw new AccessControlError(
      'An HTTPS ARTISTOS_PUBLIC_ORIGIN is required when ArtistOS binds beyond loopback.',
      500,
      'REMOTE_HTTPS_REQUIRED'
    );
  }
  if (config?.remotePasscodeReady !== true) {
    throw new AccessControlError(
      `A non-placeholder passcode of at least ${MIN_REMOTE_PASSCODE_LENGTH} characters is required beyond loopback.`,
      500,
      'REMOTE_PASSCODE_TOO_WEAK'
    );
  }
  return true;
}

function normalizeIp(value) {
  const candidate = stringValue(value, 'unknown').trim();
  return (candidate || 'unknown').slice(0, 128);
}

function cookieValue(cookieHeader, name) {
  const source = Array.isArray(cookieHeader) ? cookieHeader.join(';') : stringValue(cookieHeader);
  for (const part of source.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null;
  }
  return null;
}

function resultWithCookie(payload, setCookie) {
  Object.defineProperty(payload, 'setCookie', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: setCookie
  });
  return payload;
}

function milliseconds(value) {
  const candidate = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(candidate)) throw new TypeError('Access-control clock returned an invalid time');
  return candidate;
}

export class ArtistOsAccessControl {
  constructor(options = {}) {
    const base = options.config ?? accessConfig(options.env ?? process.env, options);
    const configuredPasscode = Object.hasOwn(options, 'passcode')
      ? stringValue(options.passcode)
      : CONFIG_SECRETS.get(base) ?? stringValue(base?.passcode);
    const publicOrigin = options.publicOrigin ?? base.publicOrigin ?? null;
    const parsedOrigin = publicOrigin ? parsePublicOrigin(publicOrigin) : null;
    this.config = Object.freeze({
      schema: ACCESS_SCHEMA,
      enabled: configuredPasscode.length > 0,
      passcodeConfigured: configuredPasscode.length > 0,
      remotePasscodeReady: remotePasscodeReady(configuredPasscode),
      host: normalizedHost(options.host ?? base.host),
      publicOrigin,
      publicOriginConfigured: Boolean(publicOrigin),
      allowInsecureRemote: options.allowInsecureRemote ?? base.allowInsecureRemote === true,
      trustProxy: options.trustProxy ?? base.trustProxy === true,
      secureCookies: options.secureCookies ?? base.secureCookies ?? parsedOrigin?.protocol === 'https:',
      sessionTtlMs: integer(options.sessionTtlMs ?? base.sessionTtlMs, 8 * 60 * 60 * 1000, 1, 7 * 24 * 60 * 60 * 1000),
      loginWindowMs: integer(options.loginWindowMs ?? base.loginWindowMs, 15 * 60 * 1000, 1, 24 * 60 * 60 * 1000),
      maxLoginFailures: integer(options.maxLoginFailures ?? base.maxLoginFailures, 5, 1, 100),
      maxSessions: integer(options.maxSessions ?? base.maxSessions, 1_000, 1, 10_000)
    });
    assertSafeAccessConfig(this.config);

    this.enabled = this.config.enabled;
    this.cookieName = options.cookieName ?? ACCESS_SESSION_COOKIE;
    this.passcodeDigest = digest(configuredPasscode);
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? cryptoRandomBytes;
    this.sessions = new Map();
    this.loginFailures = new Map();
  }

  assertSafeHost(host) {
    return assertSafeAccessConfig({ ...this.config, host: normalizedHost(host) });
  }

  publicStatus() {
    return {
      schema: ACCESS_SCHEMA,
      enabled: this.enabled,
      mode: this.enabled ? 'passcode' : 'local-open',
      passcodeRequired: this.enabled,
      authenticatedByDefault: !this.enabled,
      sessionStorage: this.enabled ? 'memory-only' : 'disabled',
      csrfRequiredForMutations: this.enabled,
      publicOriginConfigured: this.config.publicOriginConfigured,
      secureCookies: this.config.secureCookies
    };
  }

  status(input = {}) {
    const authentication = this.authenticate(input);
    return {
      ...this.publicStatus(),
      authenticated: authentication.authenticated,
      csrfToken: authentication.csrfToken,
      expiresAt: authentication.expiresAt
    };
  }

  login(input = {}, legacyIp) {
    const suppliedPasscode = typeof input === 'object' && input !== null
      ? input.passcode
      : input;
    const ip = typeof input === 'object' && input !== null ? input.ip : legacyIp;
    if (!this.enabled) return this.#openSessionProjection();

    const now = this.#now();
    this.#prune(now);
    const ipKey = normalizeIp(ip);
    const bucket = this.loginFailures.get(ipKey);
    if (bucket && bucket.resetAt > now && bucket.failures >= this.config.maxLoginFailures) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new AccessControlError(
        'Too many passcode attempts. Try again later.',
        429,
        'LOGIN_RATE_LIMITED',
        { retryAfterSeconds }
      );
    }

    const matches = timingSafeEqual(this.passcodeDigest, digest(suppliedPasscode));
    if (!matches) {
      this.#recordLoginFailure(ipKey, now);
      throw new AccessControlError('Passcode authentication failed.', 401, 'INVALID_PASSCODE');
    }

    this.loginFailures.delete(ipKey);
    while (this.sessions.size >= this.config.maxSessions) {
      this.sessions.delete(this.sessions.keys().next().value);
    }
    const sessionToken = this.#randomToken();
    const csrfToken = this.#randomToken();
    const expiresAtMs = now + this.config.sessionTtlMs;
    this.sessions.set(digestKey(sessionToken), {
      csrfToken,
      createdAtMs: now,
      expiresAtMs
    });
    return resultWithCookie({
      schema: SESSION_SCHEMA,
      authenticated: true,
      mode: 'passcode',
      csrfToken,
      expiresAt: new Date(expiresAtMs).toISOString()
    }, this.#sessionCookie(sessionToken));
  }

  authenticate(input = {}) {
    if (!this.enabled) return this.#openSessionProjection();
    const cookieHeader = typeof input === 'string' || Array.isArray(input)
      ? input
      : input?.cookieHeader;
    const now = this.#now();
    this.#prune(now);
    const token = cookieValue(cookieHeader, this.cookieName);
    const session = token ? this.sessions.get(digestKey(token)) : null;
    if (!session || session.expiresAtMs <= now) {
      if (token) this.sessions.delete(digestKey(token));
      return {
        schema: SESSION_SCHEMA,
        authenticated: false,
        mode: 'passcode',
        csrfToken: null,
        expiresAt: null
      };
    }
    return {
      schema: SESSION_SCHEMA,
      authenticated: true,
      mode: 'passcode',
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAtMs).toISOString()
    };
  }

  authorizeMutation(input = {}) {
    if (!this.enabled) return this.#openSessionProjection();
    const authentication = this.authenticate({ cookieHeader: input?.cookieHeader });
    if (!authentication.authenticated) {
      throw new AccessControlError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
    }
    if (!constantTimeSecretEqual(authentication.csrfToken, input?.csrfToken)) {
      throw new AccessControlError('A valid CSRF token is required.', 403, 'CSRF_REQUIRED');
    }
    return authentication;
  }

  logout(input = {}) {
    if (this.enabled) {
      this.authorizeMutation(input);
      const token = cookieValue(input?.cookieHeader, this.cookieName);
      if (token) this.sessions.delete(digestKey(token));
    }
    return resultWithCookie({
      schema: SESSION_SCHEMA,
      authenticated: !this.enabled,
      mode: this.enabled ? 'passcode' : 'local-open',
      csrfToken: null,
      expiresAt: null
    }, this.clearSessionCookie());
  }

  clearSessionCookie() {
    return [
      `${this.cookieName}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=0',
      ...(this.config.secureCookies ? ['Secure'] : [])
    ].join('; ');
  }

  #openSessionProjection() {
    return {
      schema: SESSION_SCHEMA,
      authenticated: true,
      mode: 'local-open',
      csrfToken: null,
      expiresAt: null
    };
  }

  #now() {
    return milliseconds(this.now());
  }

  #randomToken() {
    const bytes = this.randomBytes(32);
    if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
      throw new TypeError('Access-control random source must return bytes');
    }
    return Buffer.from(bytes).toString('base64url');
  }

  #sessionCookie(token) {
    return [
      `${this.cookieName}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${Math.floor(this.config.sessionTtlMs / 1000)}`,
      ...(this.config.secureCookies ? ['Secure'] : [])
    ].join('; ');
  }

  #recordLoginFailure(ip, now) {
    const current = this.loginFailures.get(ip);
    if (current && current.resetAt > now) {
      current.failures += 1;
      current.lastAttemptAt = now;
      return;
    }
    if (this.loginFailures.size >= MAX_RATE_LIMIT_BUCKETS) {
      this.loginFailures.delete(this.loginFailures.keys().next().value);
    }
    this.loginFailures.set(ip, {
      failures: 1,
      lastAttemptAt: now,
      resetAt: now + this.config.loginWindowMs
    });
  }

  #prune(now) {
    for (const [key, session] of this.sessions) {
      if (session.expiresAtMs <= now) this.sessions.delete(key);
    }
    for (const [ip, bucket] of this.loginFailures) {
      if (bucket.resetAt <= now) this.loginFailures.delete(ip);
    }
  }
}

export function createAccessControl(options = {}) {
  return new ArtistOsAccessControl(options);
}
