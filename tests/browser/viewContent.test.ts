import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';

describe('browser/viewContent', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalFetch = (globalThis as any).fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fbqCalls: unknown[][] = [];
  let capturedBody: Record<string, unknown> | null = null;

  const store = new Map<string, string>();
  const scrollHandlers: Array<(...args: any[]) => void> = [];
  const removeHandlers: Array<(...args: any[]) => void> = [];

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
      documentElement: { scrollHeight: 1000 } as any,
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/?utm_source=newsletter', search: '?utm_source=newsletter' },
      scrollY: 0,
      innerHeight: 500,
      fbq: (...args: unknown[]) => { fbqCalls.push(args); },
      addEventListener: (type: string, handler: any, _options?: unknown) => { if (type === 'scroll') scrollHandlers.push(handler); },
      removeEventListener: (type: string, handler: any, _options?: unknown) => { if (type === 'scroll') removeHandlers.push(handler); },
    };
    (globalThis as any).location = (globalThis as any).window.location;

    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      if (init && init.body) capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    };
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  function reset() {
    (globalThis as any).window.__vvViewContentCleanup?.();
    (globalThis as any).window.__vvViewContentCleanup = undefined;
    fbqCalls = [];
    capturedBody = null;
    scrollHandlers.length = 0;
    removeHandlers.length = 0;
    store.clear();
    (globalThis as any).document.cookie = '';
    (globalThis as any).window.location.search = '?utm_source=newsletter';
    (globalThis as any).window.scrollY = 0;
  }

  function meta() {
    return createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'us',
      viewContent: {
        scrollPercent: 20,
        contentName: 'Test Product',
        contentIds: ['sku-1'],
        contentType: 'product',
        value: 0,
        currency: 'NGN',
      },
    });
  }

  function metaNoConfig() {
    return createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'us',
    });
  }

  async function waitForScroll() {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
  }

  it('19% scroll does NOT fire ViewContent', async () => {
    reset();
    meta();
    (globalThis as any).window.scrollY = 95; // 19% of 500
    const handler = scrollHandlers[0];
    assert.ok(handler);
    handler();
    await waitForScroll();
    const viewContentCalls = fbqCalls.filter(c => c[1] === 'ViewContent');
    assert.equal(viewContentCalls.length, 0);
    assert.equal(capturedBody, null);
  });

  it('reaching 20% DOES fire ViewContent', async () => {
    reset();
    meta();
    (globalThis as any).window.scrollY = 100; // 20%
    const handler = scrollHandlers[0];
    assert.ok(handler);
    handler();
    await waitForScroll();
    const viewContentCalls = fbqCalls.filter(c => c[1] === 'ViewContent');
    assert.equal(viewContentCalls.length, 1);
    assert.equal(capturedBody?.event_name, 'ViewContent');
  });

  it('21%+ fires if 20% was crossed between scroll events', async () => {
    reset();
    meta();
    const handler = scrollHandlers[0];
    (globalThis as any).window.scrollY = 50; // 10%
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 0);
    (globalThis as any).window.scrollY = 105; // 21%
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 1);
  });

  it('ViewContent fires once only', async () => {
    reset();
    meta();
    const handler = scrollHandlers[0];
    (globalThis as any).window.scrollY = 100;
    handler();
    await waitForScroll();
    (globalThis as any).window.scrollY = 200;
    handler();
    (globalThis as any).window.scrollY = 400;
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 1);
  });

  it('ViewContent ID begins with vc_', async () => {
    reset();
    const m = meta();
    const result = await m.fireViewContent();
    assert.ok(result.eventId.startsWith('vc_'));
  });

  it('PageView and ViewContent IDs are different', async () => {
    reset();
    const m = meta();
    const pageView = await m.firePageView();
    const viewContent = await m.fireViewContent();
    assert.ok(pageView.eventId.startsWith('pv_'));
    assert.ok(viewContent.eventId.startsWith('vc_'));
    assert.notEqual(pageView.eventId, viewContent.eventId);
  });

  it('browser and CAPI ViewContent share the exact same event_id', async () => {
    reset();
    meta();
    (globalThis as any).window.scrollY = 100;
    const handler = scrollHandlers[0];
    handler();
    await waitForScroll();
    const fbqViewContent = fbqCalls.find(c => c[1] === 'ViewContent');
    assert.ok(fbqViewContent);
    const eventId = (fbqViewContent![3] as { eventID: string }).eventID;
    assert.equal((capturedBody as any).event_id, eventId);
    assert.ok(eventId.startsWith('vc_'));
  });

  it('configured product data reaches browser ViewContent', async () => {
    reset();
    const m = meta();
    await m.fireViewContent();
    const fbqViewContent = fbqCalls.find(c => c[1] === 'ViewContent');
    assert.ok(fbqViewContent);
    const data = fbqViewContent![2] as Record<string, unknown>;
    assert.equal(data.content_name, 'Test Product');
    assert.deepEqual(data.content_ids, ['sku-1']);
    assert.equal(data.content_type, 'product');
    assert.equal(data.value, 0);
    assert.equal(data.currency, 'NGN');
  });

  it('configured product data reaches CAPI ViewContent', async () => {
    reset();
    const m = meta();
    await m.fireViewContent();
    assert.equal((capturedBody as any).custom_data.content_name, 'Test Product');
    assert.deepEqual((capturedBody as any).custom_data.content_ids, ['sku-1']);
    assert.equal((capturedBody as any).custom_data.content_type, 'product');
    assert.equal((capturedBody as any).custom_data.value, 0);
    assert.equal((capturedBody as any).custom_data.currency, 'NGN');
  });

  it('fbp behavior remains correct for ViewContent', async () => {
    reset();
    (globalThis as any).document.cookie = '_fbp=fb.1.1234567890.browserid';
    const m = meta();
    await m.fireViewContent();
    assert.equal((capturedBody as any).user_data.fbp, 'fb.1.1234567890.browserid');
  });

  it('genuine fbclid/fbc behavior remains correct for ViewContent', async () => {
    reset();
    (globalThis as any).window.location.search = '?fbclid=abc123';
    const m = meta();
    await m.fireViewContent();
    const fbc = (capturedBody as any).user_data.fbc as string;
    assert.ok(fbc);
    assert.match(fbc, /^fb\.1\.\d+\.abc123$/);
  });

  it('direct traffic does not fabricate fbc for ViewContent', async () => {
    reset();
    (globalThis as any).window.location.search = '';
    (globalThis as any).document.cookie = '';
    const m = meta();
    await m.fireViewContent();
    assert.equal('fbc' in (capturedBody as any).user_data, false);
  });

  it('stable external_id remains shared for PageView and ViewContent', async () => {
    reset();
    const m = meta();
    const pageView = await m.firePageView();
    const pageBody = capturedBody;
    const viewContent = await m.fireViewContent();
    const viewBody = capturedBody;
    assert.ok(pageView.capiResult);
    assert.ok(viewContent.capiResult);
    assert.equal((pageBody as any)?.user_data?.external_id, (viewBody as any)?.user_data?.external_id);
  });

  it('cleanup removes the scroll listener', async () => {
    reset();
    const m = meta();
    m.cleanup();
    assert.equal(removeHandlers.length, 1);
    // After cleanup, scrolling should not fire.
    (globalThis as any).window.scrollY = 100;
    const handler = scrollHandlers[0];
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 0);
  });

  it('creates scroll listener even when no viewContent config is supplied', async () => {
    reset();
    metaNoConfig();
    assert.equal(scrollHandlers.length, 1);
  });

  it('19% scroll does NOT fire ViewContent without config', async () => {
    reset();
    metaNoConfig();
    (globalThis as any).window.scrollY = 95;
    const handler = scrollHandlers[0];
    assert.ok(handler);
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 0);
  });

  it('reaching 20% DOES fire ViewContent without config', async () => {
    reset();
    metaNoConfig();
    (globalThis as any).window.scrollY = 100;
    const handler = scrollHandlers[0];
    assert.ok(handler);
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 1);
    assert.equal((capturedBody as any)?.event_name, 'ViewContent');
  });

  it('ViewContent fires once only without config', async () => {
    reset();
    metaNoConfig();
    const handler = scrollHandlers[0];
    (globalThis as any).window.scrollY = 100;
    handler();
    await waitForScroll();
    (globalThis as any).window.scrollY = 200;
    handler();
    (globalThis as any).window.scrollY = 400;
    handler();
    await waitForScroll();
    assert.equal(fbqCalls.filter(c => c[1] === 'ViewContent').length, 1);
  });

  it('custom ViewContent data remains optional', async () => {
    reset();
    metaNoConfig();
    (globalThis as any).window.scrollY = 100;
    const handler = scrollHandlers[0];
    handler();
    await waitForScroll();
    const custom = (capturedBody as any)?.custom_data ?? {};
    assert.equal(Object.keys(custom).length, 0);
  });
});
