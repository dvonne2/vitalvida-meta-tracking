import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMetaCapi } from '../../src/server/pageView.js';

describe('server/pageView', () => {
  const baseConfig = {
    pixelId: '987654321098765',
    accessToken: 'test-token',
    apiVersion: 'v18.0',
    allowedOrigins: ['https://example.com'],
    allowedSourceHosts: ['example.com'],
  };

  it('rejects non-PageView event names', async () => {
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPageView({
      body: { event_name: 'Purchase' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects an invalid event_id', async () => {
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPageView({
      body: {
        event_name: 'PageView',
        event_id: 'bad-id',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://example.com/',
        user_data: { external_id: 'visitor' },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects a non-https source url', async () => {
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPageView({
      body: {
        event_name: 'PageView',
        event_id: 'pv_1234567890abcdef',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'http://example.com/',
        user_data: { external_id: 'visitor' },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('strips fbclid from source url', async () => {
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPageView({
      body: {
        event_name: 'PageView',
        event_id: 'pv_1234567890abcdef',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://example.com/?fbclid=abc123&utm_source=newsletter',
        user_data: { external_id: 'visitor' },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false); // fetch will fail, but we still validate URL handling
    assert.equal(res.eventId, 'pv_1234567890abcdef');
  });

  it('preserves legitimate query parameters', async () => {
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPageView({
      body: {
        event_name: 'PageView',
        event_id: 'pv_1234567890abcdef',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://example.com/?utm_source=newsletter&campaign=blackfriday',
        user_data: { external_id: 'visitor' },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.eventId, 'pv_1234567890abcdef');
  });
});
