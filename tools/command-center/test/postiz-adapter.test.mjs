import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPostizPayload, PostizClient, PostizError, postizConfig, settingsForIntegration } from '../postiz-adapter.mjs';

describe('Postiz adapter', () => {
  it('keeps the integration disabled until an API key is supplied', () => {
    const config = postizConfig({});
    assert.equal(config.configured, false);
    assert.equal(config.apiKey, '');
    assert.equal(config.apiUrl, 'https://api.postiz.com');
  });

  it('does not activate from ambient credentials without explicit opt-in', () => {
    const disabled = postizConfig({ POSTIZ_API_KEY: 'ambient-secret' });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.configured, false);
    assert.equal(disabled.apiKey, '');

    const enabled = postizConfig({
      ARTISTOS_ENABLE_POSTIZ: '1',
      POSTIZ_API_KEY: 'explicit-secret'
    });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.configured, true);
  });

  it('uses safe explicit defaults for X', () => {
    assert.deepEqual(settingsForIntegration('x'), {
      __type: 'x',
      who_can_reply_post: 'everyone',
      made_with_ai: true,
      paid_partnership: false
    });
  });

  it('builds a scheduled payload only for a future time', () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    const payload = buildPostizPayload({
      item: { content: 'The room is live.', scheduledAt: '2026-07-22T13:00:00.000Z' },
      action: 'schedule',
      integration: { id: 'channel-1', identifier: 'x' },
      now
    });
    assert.equal(payload.type, 'schedule');
    assert.equal(payload.creationMethod, 'API');
    assert.equal(payload.posts[0].integration.id, 'channel-1');
    assert.equal(payload.posts[0].value[0].content, 'The room is live.');
    assert.throws(() => buildPostizPayload({
      item: { content: 'Too soon', scheduledAt: '2026-07-22T12:00:30.000Z' },
      action: 'schedule', integration: { id: 'channel-1', identifier: 'x' }, now
    }), PostizError);
  });

  it('authenticates server-side without returning the key', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      const body = url.endsWith('/integrations')
        ? [{ id: 'x-1', name: 'OxQuan', identifier: 'x', disabled: false }]
        : { connected: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const client = new PostizClient({ apiKey: 'secret-key', apiUrl: 'http://postiz.test', fetchImpl });
    const status = await client.status();
    assert.equal(status.connected, true);
    assert.equal(status.integrations.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'secret-key');
    assert.equal(JSON.stringify(status).includes('secret-key'), false);
  });
});
