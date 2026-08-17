import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaCapi } from '../../src/server/pageView.js';

describe('server/initiateCheckout', () => {
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
      event_name: 'InitiateCheckout',
      event_id: 'ic_1234567890abcdef',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/',
      user_data: {
        external_id: 'visitor-123',
        phone: '2348012345678',
        first_name: 'bola',
        surname: 'ategbe',
        email: 'bola@example.com',
        state: 'lagos',
        city: 'ikeja',
        country: 'ng',
        fbp: 'fb.1.1234567890.browserid',
        fbc: 'fb.1.1234567890.abc123',
      },
      custom_data: {
        content_name: 'Package A',
        content_ids: ['pkg-a'],
        content_type: 'product',
        value: 12000,
        currency: 'NGN',
        num_items: 1,
        contents: [{ id: 'pkg-a', quantity: 1 }],
      },
    };
  }

  it('accepts an InitiateCheckout event and sends it to Meta', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendInitiateCheckout({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventName, 'InitiateCheckout');
    assert.equal(res.eventId, 'ic_1234567890abcdef');
    assert.ok(capturedRequestBody);
    const data = (capturedRequestBody as any).data as unknown[];
    assert.ok(Array.isArray(data));
    assert.equal((data[0] as any).event_name, 'InitiateCheckout');
  });

  it('rejects a non-InitiateCheckout event name', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendInitiateCheckout({
      body: { ...validBody(), event_name: 'PageView' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects an invalid InitiateCheckout event_id', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendInitiateCheckout({
      body: { ...validBody(), event_id: 'bad-id' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects a missing phone', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).user_data = { ...body.user_data, phone: undefined };
    const res = await capi.sendInitiateCheckout({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('rejects a missing first name', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).user_data = { ...body.user_data, first_name: '' };
    const res = await capi.sendInitiateCheckout({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
  });

  it('hashes customer data for CAPI', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendInitiateCheckout({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const userData = (data[0] as any).user_data as Record<string, unknown>;
    assert.equal((userData.external_id as string[])[0].length, 64);
    assert.match((userData.ph as string), /^[0-9a-f]{64}$/);
    assert.match((userData.fn as string), /^[0-9a-f]{64}$/);
    assert.match((userData.ln as string), /^[0-9a-f]{64}$/);
    assert.match((userData.em as string), /^[0-9a-f]{64}$/);
    assert.match((userData.ct as string), /^[0-9a-f]{64}$/);
    assert.match((userData.st as string), /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(userData.country));
    assert.match((userData.country as string[])[0], /^[0-9a-f]{64}$/);
  });

  it('passes fbp and fbc through', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendInitiateCheckout({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const userData = (data[0] as any).user_data as Record<string, unknown>;
    assert.equal(userData.fbp, 'fb.1.1234567890.browserid');
    assert.equal(userData.fbc, 'fb.1.1234567890.abc123');
  });

  it('passes product data through to Meta', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendInitiateCheckout({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const custom = (data[0] as any).custom_data as Record<string, unknown>;
    assert.equal(custom.content_name, 'Package A');
    assert.deepEqual(custom.content_ids, ['pkg-a']);
    assert.equal(custom.content_type, 'product');
    assert.equal(custom.value, 12000);
    assert.equal(custom.currency, 'NGN');
    assert.equal(custom.num_items, 1);
    assert.ok(Array.isArray(custom.contents));
  });

  it('strips fbclid from source url', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendInitiateCheckout({
      body: { ...validBody(), event_source_url: 'https://example.com/?fbclid=abc&utm_source=newsletter' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const url = (data[0] as any).event_source_url as string;
    assert.equal(url.includes('fbclid'), false);
    assert.equal(url.includes('utm_source=newsletter'), true);
  });

  it('does not place hashed customer fields in custom_data', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendInitiateCheckout({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const data = (capturedRequestBody as any).data as unknown[];
    const custom = (data[0] as any).custom_data as Record<string, unknown>;
    assert.equal('ph' in custom, false);
    assert.equal('em' in custom, false);
    assert.equal('fn' in custom, false);
    assert.equal('ln' in custom, false);
  });

  it('normalizes phone before hashing', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).user_data = { ...body.user_data, phone: '08012345678' };
    const res = await capi.sendInitiateCheckout({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    const data = (capturedRequestBody as any).data as unknown[];
    const userData = (data[0] as any).user_data as Record<string, unknown>;
    assert.match((userData.ph as string), /^[0-9a-f]{64}$/);
  });
});
