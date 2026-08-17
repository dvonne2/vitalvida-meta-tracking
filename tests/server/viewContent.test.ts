import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaCapi } from '../../src/server/pageView.js';

describe('server/viewContent', () => {
  const originalFetch = (globalThis as any).fetch;
  const baseConfig = {
    pixelId: '987654321098765',
    accessToken: 'test-token',
    apiVersion: 'v18.0',
    allowedOrigins: ['https://example.com'],
    allowedSourceHosts: ['example.com'],
  };

  let capturedRequestBody: Record<string, unknown> | null = null;

  before(() => {
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [] }),
      } as unknown as Response;
    };
  });

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  function reset() {
    capturedRequestBody = null;
  }

  function validBody() {
    return {
      event_name: 'ViewContent',
      event_id: 'vc_1234567890abcdef',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/',
      user_data: { external_id: 'visitor-123' },
      custom_data: {
        content_name: 'Test Product',
        content_ids: ['sku-1'],
        content_type: 'product',
        value: 0,
        currency: 'NGN',
      },
    };
  }

  it('accepts a ViewContent event and sends it to Meta', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendViewContent({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventName, 'ViewContent');
    assert.equal(res.eventId, 'vc_1234567890abcdef');
    assert.ok(capturedRequestBody);
    const data = (capturedRequestBody as any).data as unknown[];
    assert.ok(Array.isArray(data));
    assert.equal((data[0] as any).event_name, 'ViewContent');
    assert.equal((data[0] as any).event_id, 'vc_1234567890abcdef');
  });

  it('rejects a non-ViewContent event name', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendViewContent({
      body: { ...validBody(), event_name: 'PageView' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects an invalid ViewContent event_id', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendViewContent({
      body: { ...validBody(), event_id: 'pv_1234567890abcdef' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('hashes external_id for ViewContent', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendViewContent({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const externalId = (data[0] as any).user_data.external_id as string[];
    assert.ok(Array.isArray(externalId));
    assert.equal(externalId[0].length, 64);
    assert.match(externalId[0], /^[0-9a-f]{64}$/);
  });

  it('passes configured product data through to Meta', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendViewContent({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const custom = (data[0] as any).custom_data as Record<string, unknown>;
    assert.equal(custom.content_name, 'Test Product');
    assert.deepEqual(custom.content_ids, ['sku-1']);
    assert.equal(custom.content_type, 'product');
    assert.equal(custom.value, 0);
    assert.equal(custom.currency, 'NGN');
  });

  it('strips fbclid from ViewContent source url', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendViewContent({
      body: { ...validBody(), event_source_url: 'https://example.com/?fbclid=abc&utm_source=newsletter' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const url = (data[0] as any).event_source_url as string;
    assert.equal(url.includes('fbclid'), false);
    assert.equal(url.includes('utm_source=newsletter'), true);
  });

  it('passes fbp and fbc through to ViewContent', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendViewContent({
      body: {
        ...validBody(),
        user_data: {
          external_id: 'visitor-123',
          fbp: 'fb.1.1234567890.browserid',
          fbc: 'fb.1.1234567890.abc123',
        },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const userData = (data[0] as any).user_data as Record<string, unknown>;
    assert.equal(userData.fbp, 'fb.1.1234567890.browserid');
    assert.equal(userData.fbc, 'fb.1.1234567890.abc123');
  });
});
