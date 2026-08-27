import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MEDIA_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4']
]);

export class PostizError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'PostizError';
    this.status = status;
    this.details = details;
  }
}

export function postizConfig(environment = process.env) {
  const enabled = /^(1|true|yes)$/i.test(String(environment.ARTISTOS_ENABLE_POSTIZ || '').trim());
  const suppliedApiKey = String(environment.POSTIZ_API_KEY || '').trim();
  const apiKey = enabled ? suppliedApiKey : '';
  const apiUrl = String(environment.POSTIZ_API_URL || 'https://api.postiz.com')
    .trim()
    .replace(/\/+$/, '');
  return {
    configured: enabled && Boolean(apiKey),
    enabled,
    apiKey,
    apiUrl,
    label: apiUrl.includes('api.postiz.com') ? 'Postiz Cloud' : 'Self-hosted Postiz'
  };
}

export function settingsForIntegration(identifier) {
  if (identifier === 'x') {
    return {
      __type: 'x',
      who_can_reply_post: 'everyone',
      made_with_ai: true,
      paid_partnership: false
    };
  }
  return { __type: identifier };
}

export class PostizClient {
  constructor({ apiKey, apiUrl, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new PostizError('Postiz is not configured', 503);
    this.apiKey = apiKey;
    this.apiUrl = String(apiUrl || 'https://api.postiz.com').replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  async request(endpoint, options = {}) {
    let response;
    try {
      response = await this.fetch(`${this.apiUrl}/public/v1${endpoint}`, {
        ...options,
        headers: {
          Authorization: this.apiKey,
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(options.headers || {})
        },
        signal: options.signal || AbortSignal.timeout(15_000)
      });
    } catch (error) {
      throw new PostizError(`Could not reach Postiz: ${error.message}`, 502);
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    }
    if (!response.ok) {
      const message = payload?.msg || payload?.message || payload?.error || `Postiz returned HTTP ${response.status}`;
      throw new PostizError(message, response.status, payload);
    }
    return payload;
  }

  integrations() {
    return this.request('/integrations', { method: 'GET' });
  }

  connected() {
    return this.request('/is-connected', { method: 'GET' });
  }

  async status() {
    const [connection, integrations] = await Promise.all([this.connected(), this.integrations()]);
    return { connected: connection?.connected === true, integrations: Array.isArray(integrations) ? integrations : [] };
  }

  async upload(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MEDIA_TYPES.get(extension);
    if (!contentType) throw new PostizError(`Postiz upload does not support ${extension || 'this file type'}`, 400);
    const details = await stat(filePath);
    if (!details.isFile()) throw new PostizError('Publishing asset is not a file', 400);
    const data = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([data], { type: contentType }), path.basename(filePath));
    return this.request('/upload', { method: 'POST', body: form });
  }

  createPost(payload) {
    return this.request('/posts', { method: 'POST', body: JSON.stringify(payload) });
  }
}

export function buildPostizPayload({ item, action, integration, media = null, now = new Date() }) {
  if (!['draft', 'schedule', 'now'].includes(action)) throw new PostizError('Invalid Postiz action', 400);
  if (!item?.content?.trim()) throw new PostizError('Post copy is required', 400);
  if (!integration?.id || !integration?.identifier) throw new PostizError('A connected Postiz channel is required', 400);

  let date = now.toISOString();
  if (action === 'schedule') {
    const scheduled = new Date(item.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw new PostizError('A valid scheduled time is required', 400);
    if (scheduled.getTime() <= now.getTime() + 60_000) throw new PostizError('Scheduled time must be at least one minute in the future', 400);
    date = scheduled.toISOString();
  }

  return {
    type: action,
    date,
    shortLink: false,
    tags: [],
    creationMethod: 'API',
    posts: [{
      integration: { id: integration.id },
      settings: settingsForIntegration(integration.identifier),
      value: [{
        content: item.content.trim(),
        image: media ? [{ id: media.id, path: media.path, alt: item.altText || undefined }] : []
      }]
    }]
  };
}
