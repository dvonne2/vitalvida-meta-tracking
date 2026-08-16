import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';

describe('integration/pageview', () => {
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
        if (typeof el.onload === 'function') setTimeout(() => el.onload(), 0);
      }},
      getElementById: () => null,
      createElement: (tag: string) => {
        const el: Record<string, unknown> = { tag };
        return new Proxy(el, { set: (target, prop, value) => { target[prop as string] = value; return true; }}) as unknown as HTMLElement;
      },
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/' },
      fbq: undefined,
    };
    (globalThis as any).location = (globalThis as any).window.location;

    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('browser and CAPI use the same event_id', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const calls: unknown[][] = [];

    (globalThis as any).window.fbq = (...args: unknown[]) => { calls.push(args); };
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    };

    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'us',
    });

    const result = await meta.firePageView();
    const trackEventId = (calls.find(c => c[0] === 'track')?.[3] as { eventID: string }).eventID;
    const capiEventId = (capturedBody! as { event_id: string }).event_id;

    assert.equal(result.eventId, trackEventId);
    assert.equal(result.eventId, capiEventId);
    assert.equal(capiEventId, trackEventId);
  });

  it('does not include the access token in the browser payload', async () => {
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
    const body = JSON.stringify(capturedBody);
    assert.equal(body.includes('access_token'), false);
    assert.equal(body.includes('test_token'), false);
  });
});
