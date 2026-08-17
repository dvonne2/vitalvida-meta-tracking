import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaCapi } from '../../src/server/pageView.js';
import { sha256 } from '../../src/server/hashing.js';
import { normalizePhone, splitName, isValidEmail } from '../../src/shared/checkout.js';

describe('server/purchase', () => {
  const originalFetch = (globalThis as any).fetch;
  const baseConfig = {
    pixelId: '987654321098765',
    accessToken: 'test-token',
    apiVersion: 'v18.0',
    allowedOrigins: ['https://example.com'],
    allowedSourceHosts: ['example.com'],
  };

  let capturedRequestBody: Record<string, unknown> | null = null;
  let fetchCalls = 0;

  before(() => {
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  function reset() {
    capturedRequestBody = null;
    fetchCalls = 0;
  }

  function validBody() {
    return {
      event_name: 'Purchase',
      event_id: 'VV-12345',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/',
      user_data: {
        external_id: 'visitor-123',
        phone: '08012345678',
        name: 'Bola Ategbe',
        email: 'Bola@Example.COM',
        city: 'Lagos',
        state: 'Lagos',
        country: 'ng',
      },
      custom_data: {
        order_id: 'VV-12345',
        value: 12000,
        currency: 'NGN',
        content_ids: ['pkg-a'],
        content_name: 'Package A',
        content_type: 'product',
        num_items: 1,
        contents: [{ id: 'pkg-a', quantity: 1 }],
      },
    };
  }

  it('Purchase requires order ID', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: { ...validBody(), event_id: '' },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.eventName, 'Purchase');
  });

  it('Purchase requires value', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).custom_data = { ...body.custom_data };
    (body as any).custom_data.value = undefined;
    const res = await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.eventId, 'VV-12345');
  });

  it('Purchase requires currency', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).custom_data = { ...body.custom_data };
    (body as any).custom_data.currency = '';
    const res = await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.eventId, 'VV-12345');
  });

  it('Purchase uses order ID as event ID', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventId, 'VV-12345');
    assert.equal((capturedRequestBody as any).data[0].event_id, 'VV-12345');
    assert.equal((capturedRequestBody as any).data[0].custom_data.order_id, 'VV-12345');
  });

  it('same order ID always produces the same event ID', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const first = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const second = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(first.eventId, 'VV-12345');
    assert.equal(second.eventId, 'VV-12345');
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  it('customer fields are normalized correctly', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    const normalizedPhone = normalizePhone('08012345678');
    const split = splitName('Bola Ategbe');
    const email = isValidEmail('Bola@Example.COM');
    assert.equal(userData.ph, await sha256(normalizedPhone!));
    assert.equal(userData.fn, await sha256(split!.firstName));
    assert.equal(userData.ln, await sha256(split!.surname!));
    assert.equal(userData.em, await sha256(email!));
  });

  it('customer fields are hashed once for CAPI', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    assert.match(userData.ph as string, /^[0-9a-f]{64}$/);
    assert.match(userData.fn as string, /^[0-9a-f]{64}$/);
    assert.match(userData.ln as string, /^[0-9a-f]{64}$/);
    assert.match(userData.em as string, /^[0-9a-f]{64}$/);
    assert.match(userData.ct as string, /^[0-9a-f]{64}$/);
    assert.match(userData.st as string, /^[0-9a-f]{64}$/);
    assert.match((userData.country as string[])[0], /^[0-9a-f]{64}$/);
    assert.match((userData.external_id as string[])[0], /^[0-9a-f]{64}$/);
  });

  it('fbp remains unhashed', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).user_data = { ...body.user_data, fbp: 'fb.1.1234567890.browserid' };
    await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    assert.equal(userData.fbp, 'fb.1.1234567890.browserid');
  });

  it('fbc remains unhashed', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).user_data = { ...body.user_data, fbc: 'fb.1.1234567890.abc123' };
    await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    assert.equal(userData.fbc, 'fb.1.1234567890.abc123');
  });

  it('direct traffic without fbc remains valid', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    assert.equal('fbc' in userData, false);
  });

  it('external_id is hashed server-side', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    const externalId = (userData.external_id as string[])[0];
    assert.equal(externalId.length, 64);
    assert.match(externalId, /^[0-9a-f]{64}$/);
  });

  it('IP and User Agent are included', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: {
        origin: 'https://example.com',
        host: 'example.com',
        'x-forwarded-for': '1.2.3.4',
        'user-agent': 'TestAgent/1.0',
      },
    });
    const userData = (capturedRequestBody as any).data[0].user_data as Record<string, unknown>;
    assert.equal(userData.client_ip_address, '1.2.3.4');
    assert.equal(userData.client_user_agent, 'TestAgent/1.0');
  });

  it('product data included when supplied', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const custom = (capturedRequestBody as any).data[0].custom_data as Record<string, unknown>;
    assert.equal(custom.content_name, 'Package A');
    assert.deepEqual(custom.content_ids, ['pkg-a']);
    assert.equal(custom.content_type, 'product');
    assert.equal(custom.value, 12000);
    assert.equal(custom.currency, 'NGN');
    assert.equal(custom.num_items, 1);
    assert.ok(Array.isArray(custom.contents));
  });

  it('missing optional product data does not crash', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).custom_data = {
      order_id: 'VV-12345',
      value: 12000,
      currency: 'NGN',
    };
    const res = await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
  });

  it('exact consumer-supplied value and currency are preserved', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const body = { ...validBody() };
    (body as any).custom_data = { ...body.custom_data, value: 999.99, currency: 'USD' };
    await capi.sendPurchase({
      body,
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const custom = (capturedRequestBody as any).data[0].custom_data as Record<string, unknown>;
    assert.equal(custom.value, 999.99);
    assert.equal(custom.currency, 'USD');
  });

  it('test_event_code remains top-level when configured', async () => {
    reset();
    const capi = createMetaCapi({ ...baseConfig, testEventCode: 'TEST123' });
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal((capturedRequestBody as any).test_event_code, 'TEST123');
    assert.ok(Array.isArray((capturedRequestBody as any).data));
  });

  it('Meta 200 response parsed correctly', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.httpStatus, 200);
    assert.equal(res.eventsReceived, 1);
    assert.equal(res.fbtraceId, 'ABC');
  });

  it('Meta error response handled safely', async () => {
    reset();
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'bad request' } }),
    } as unknown as Response);
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.httpStatus, 400);
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  it('network failure handled safely and does not throw', async () => {
    reset();
    (globalThis as any).fetch = async () => { throw new Error('network down'); };
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.eventName, 'Purchase');
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  it('without an idempotency store, Purchase sends normally', async () => {
    reset();
    const capi = createMetaCapi(baseConfig);
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventId, 'VV-12345');
    assert.equal(fetchCalls, 1);
    assert.equal(res.skipped, undefined);
  });

  it('configured store reports already-sent Purchase correctly', async () => {
    reset();
    const capi = createMetaCapi({
      ...baseConfig,
      idempotency: { has: async () => true, mark: async () => {} },
    });
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventId, 'VV-12345');
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_sent');
    assert.equal(fetchCalls, 0);
  });

  it('already-sent Purchase does not call Meta again', async () => {
    reset();
    const sent = new Set<string>();
    const store = {
      has: async (key: string) => sent.has(key),
      mark: async (key: string) => { sent.add(key); },
    };
    const capi = createMetaCapi({ ...baseConfig, idempotency: store });
    const first = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const second = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(first.ok, true);
    assert.equal(first.skipped, undefined);
    assert.equal(second.ok, true);
    assert.equal(second.skipped, true);
    assert.equal(fetchCalls, 1);
  });

  it('successful Meta response causes the order ID to be marked', async () => {
    reset();
    const marked: string[] = [];
    const store = {
      has: async () => false,
      mark: async (key: string) => { marked.push(key); },
    };
    const capi = createMetaCapi({ ...baseConfig, idempotency: store });
    await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.deepEqual(marked, ['VV-12345']);
  });

  it('failed Meta response does not mark it', async () => {
    reset();
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'bad request' } }),
    } as unknown as Response);
    const marked: string[] = [];
    const store = {
      has: async () => false,
      mark: async (key: string) => { marked.push(key); },
    };
    const capi = createMetaCapi({ ...baseConfig, idempotency: store });
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.deepEqual(marked, []);
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  it('network failure does not mark it', async () => {
    reset();
    (globalThis as any).fetch = async () => { throw new Error('network down'); };
    const marked: string[] = [];
    const store = {
      has: async () => false,
      mark: async (key: string) => { marked.push(key); },
    };
    const capi = createMetaCapi({ ...baseConfig, idempotency: store });
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, false);
    assert.deepEqual(marked, []);
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  it('failed Purchase can be retried', async () => {
    reset();
    let attempt = 0;
    (globalThis as any).fetch = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network down');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
    const marked: string[] = [];
    const store = {
      has: async () => false,
      mark: async (key: string) => { marked.push(key); },
    };
    const capi = createMetaCapi({ ...baseConfig, idempotency: store });
    const first = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    const second = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(first.ok, false);
    assert.equal(second.ok, true);
    assert.equal(attempt, 2);
    assert.deepEqual(marked, ['VV-12345']);
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (init && init.body) capturedRequestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ABC' }),
      } as unknown as Response;
    };
  });

  it('no reliance on process-global memory for correctness', async () => {
    reset();
    const capi1 = createMetaCapi(baseConfig);
    const capi2 = createMetaCapi(baseConfig);
    await capi1.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    await capi2.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(fetchCalls, 2);
  });

  it('idempotency store has() failure does not crash and allows send', async () => {
    reset();
    const capi = createMetaCapi({
      ...baseConfig,
      idempotency: { has: async () => { throw new Error('store down'); }, mark: async () => {} },
    });
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(fetchCalls, 1);
  });

  it('idempotency store mark() failure does not crash after successful send', async () => {
    reset();
    const capi = createMetaCapi({
      ...baseConfig,
      idempotency: { has: async () => false, mark: async () => { throw new Error('store down'); } },
    });
    const res = await capi.sendPurchase({
      body: validBody(),
      headers: { origin: 'https://example.com', host: 'example.com' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.eventId, 'VV-12345');
  });
});
