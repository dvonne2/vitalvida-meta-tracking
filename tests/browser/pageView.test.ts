import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';

describe('browser/pageView', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalFetch = (globalThis as any).fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  before(() => {
    const store = new Map<string, string>();
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
      head: { appendChild: (el: any) => {
        if (typeof el.onload === 'function') {
          setTimeout(() => el.onload(), 0);
        }
      } },
      getElementById: () => null,
      createElement: (tag: string) => {
        const el: Record<string, unknown> = { tag };
        return new Proxy(el, {
          set: (target, prop, value) => {
            target[prop as string] = value;
            return true;
          },
        }) as unknown as HTMLElement;
      },
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/?utm_source=newsletter&fbclid=xyz' },
      fbq: undefined,
    };
    (globalThis as any).location = (globalThis as any).window.location;

    (globalThis as any).fetch = async (_url: string, _init: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    };
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('returns a valid result and sends the browser Pixel PageView when fbq exists', async () => {
    const fbqCalls: unknown[][] = [];
    (globalThis as any).window.fbq = (...args: unknown[]) => {
      fbqCalls.push(args);
    };

    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'us',
    });

    const result = await meta.firePageView();
    assert.ok(result.browserSent);
    assert.ok(result.eventId.startsWith('pv_'));
    assert.equal(result.capiResult?.ok, true);
    assert.equal(fbqCalls.length, 2);
    assert.deepEqual(fbqCalls[0][0], 'init');
    assert.deepEqual(fbqCalls[1][0], 'track');
    assert.deepEqual(fbqCalls[1][1], 'PageView');
    assert.deepEqual(fbqCalls[1][3], { eventID: result.eventId });
  });

  it('still attempts CAPI when the Pixel is blocked', async () => {
    (globalThis as any).window.fbq = undefined;

    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
    });

    const result = await meta.firePageView();
    assert.equal(result.browserSent, false);
    assert.equal(result.capiResult?.ok, true);
  });

  it('uses different event ids for two separate PageViews', async () => {
    (globalThis as any).window.fbq = () => {};

    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
    });

    const first = await meta.firePageView();
    const second = await meta.firePageView();
    assert.notEqual(first.eventId, second.eventId);
  });

  it('strips fbclid from the CAPI source URL while keeping legitimate query params', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    (globalThis as any).window.fbq = () => {};
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    };

    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
    });

    await meta.firePageView();
    assert.ok(capturedBody);
    const url = (capturedBody! as { event_source_url: string }).event_source_url;
    assert.equal(url.includes('fbclid'), false);
    assert.equal(url.includes('utm_source=newsletter'), true);
  });
});
