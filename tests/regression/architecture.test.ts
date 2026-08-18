import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';
import { createMetaCapi } from '../../src/server/pageView.js';

describe('regression/architecture', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalFetch = (globalThis as any).fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fbqCalls: unknown[][] = [];
  let capturedBrowserPayloads: Record<string, unknown>[] = [];
  let capturedMetaBodies: Record<string, unknown>[] = [];
  const store = new Map<string, string>();

  before(() => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    } as unknown as Storage;

    (globalThis as any).document = {
      cookie: '',
      head: { appendChild: (el: any) => { if (typeof el.onload === 'function') setTimeout(() => el.onload(), 0); } },
      getElementById: () => null,
      createElement: (tag: string) => {
        const el: Record<string, unknown> = { tag };
        return new Proxy(el, { set: (target, prop, value) => { target[prop as string] = value; return true; } }) as unknown as HTMLElement;
      },
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/', search: '' },
      fbq: (...args: unknown[]) => { fbqCalls.push(args); },
    };
    (globalThis as any).location = (globalThis as any).window.location;

    (globalThis as any).fetch = async (url: string | URL, init: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (init && init.body) {
        const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
        if (u.includes('graph.facebook.com')) {
          capturedMetaBodies.push(parsed);
          return new Response(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'ARCH' }), { status: 200 });
        }
        capturedBrowserPayloads.push(parsed);
      }
      return new Response(JSON.stringify({ ok: true, events_received: 1 }), { status: 200 });
    };
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  function reset() {
    fbqCalls = [];
    capturedBrowserPayloads = [];
    capturedMetaBodies = [];
    store.clear();
    (globalThis as any).document.cookie = '';
    (globalThis as any).window.location.href = 'https://example.com/';
    (globalThis as any).window.location.search = '';
    (globalThis as any).window.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
    (globalThis as any).window.__vvInitializedPixelIds = undefined;
    (globalThis as any).window.__vvPixelLoaded = undefined;
    (globalThis as any).window.__vvPixelLoadPromise = undefined;
  }

  function metaBrowser() {
    return createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'ng',
      viewContent: { scrollPercent: 20 },
    });
  }

  function browserEventId(name: string): string {
    const call = fbqCalls.find((c) => c[0] === 'track' && c[1] === name);
    if (!call) return '';
    return ((call[3] as { eventID?: string }) || {}).eventID || '';
  }

  function capiEventId(name: string): string {
    const body = capturedBrowserPayloads.find((b) => (b as any).event_name === name);
    if (!body) return '';
    return (body as any).event_id as string;
  }

  it('browser funnel emits one Pixel init and matching browser/CAPI event ids', async () => {
    reset();
    const m = metaBrowser();

    await m.firePageView();
    await m.fireViewContent();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });

    assert.equal(fbqCalls.filter((c) => c[0] === 'init').length, 1, 'Pixel ID must init exactly once');
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length, 1);
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'ViewContent').length, 1);
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'InitiateCheckout').length, 1);

    ['PageView', 'ViewContent', 'InitiateCheckout'].forEach((name) => {
      assert.ok(browserEventId(name).startsWith(name === 'PageView' ? 'pv_' : name === 'ViewContent' ? 'vc_' : 'ic_'));
      assert.equal(browserEventId(name), capiEventId(name), `${name} browser/CAPI ids must match`);
    });

    capturedBrowserPayloads.forEach((body) => {
      assert.ok((body as any).user_data.external_id, 'external_id must be present');
      assert.equal('fbp' in (body as any).user_data, false, 'no fabricated fbp');
      assert.equal('fbc' in (body as any).user_data, false, 'no fabricated fbc');
    });
  });

  it('Purchase is server-only and preserves the consumer order id as the event id', async () => {
    const m = createMetaBrowser({ pixelId: '987654321098765', capiEndpoint: '/api/capi' });
    assert.equal('firePurchase' in m, false, 'createMetaBrowser must not expose a browser Purchase path');

    const capi = createMetaCapi({
      pixelId: '987654321098765',
      accessToken: 'test-token',
      apiVersion: 'v18.0',
    });

    const orderId = 'ARCH-ORDER-001';
    const result = await capi.sendPurchase({
      body: {
        event_name: 'Purchase',
        event_id: orderId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://example.com/complete',
        user_data: { external_id: 'ext-1' },
        custom_data: { order_id: orderId, value: 100, currency: 'NGN' },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });

    assert.equal(result.eventId, orderId, 'Purchase event_id must equal the consumer order id');
    const body = capturedMetaBodies[capturedMetaBodies.length - 1];
    assert.equal((body as any).data[0].event_id, orderId);
    assert.equal(((body as any).data[0].custom_data as any).order_id, orderId);
  });

  it('customer PII is hashed once, fbp/fbc remain unhashed, and test_event_code is top-level', async () => {
    reset();
    const capi = createMetaCapi({
      pixelId: '987654321098765',
      accessToken: 'test-token',
      apiVersion: 'v18.0',
      testEventCode: 'TEST999',
    });

    const result = await capi.sendInitiateCheckout({
      body: {
        event_name: 'InitiateCheckout',
        event_id: 'ic_1234567890abcdef',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://example.com/checkout',
        user_data: {
          external_id: 'ext-1',
          phone: '08012345678',
          first_name: 'Bola',
          surname: 'Ategbe',
          email: 'bola@example.com',
          city: 'Lagos',
          state: 'Lagos',
          country: 'ng',
          fbp: 'fb.1.1234567890.browserid',
          fbc: 'fb.1.1234567890.clickid',
        },
      },
      headers: { origin: 'https://example.com', host: 'example.com' },
    });

    assert.equal(result.ok, true);
    const body = capturedMetaBodies[capturedMetaBodies.length - 1];
    assert.equal((body as any).test_event_code, 'TEST999', 'test_event_code must be top-level');
    assert.equal('test_event_code' in (body as any).data[0], false, 'test_event_code must not be inside data[0]');

    const ud = (body as any).data[0].user_data as Record<string, unknown>;
    assert.equal((ud.fbp as string), 'fb.1.1234567890.browserid', 'fbp must be unhashed');
    assert.equal((ud.fbc as string), 'fb.1.1234567890.clickid', 'fbc must be unhashed');

    const hashPattern = /^[0-9a-f]{64}$/;
    assert.ok(hashPattern.test(ud.fn as string), 'first name should be SHA-256 hex');
    assert.ok(hashPattern.test(ud.ln as string), 'surname should be SHA-256 hex');
    assert.ok(hashPattern.test(ud.ph as string), 'phone should be SHA-256 hex');
    assert.ok(hashPattern.test(ud.em as string), 'email should be SHA-256 hex');
    assert.notEqual(ud.fn, 'Bola', 'first name must not be raw');
    assert.notEqual(ud.fn, 'bola', 'first name must not be lowercase raw');
  });
});
