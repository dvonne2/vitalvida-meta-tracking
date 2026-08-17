import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';

describe('browser/purchase', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalFetch = (globalThis as any).fetch;

  before(() => {
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
      fbq: () => {},
    };

    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).fetch = originalFetch;
  });

  it('createMetaBrowser does not expose a firePurchase method', () => {
    const meta = createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'ng',
    });
    assert.equal('firePurchase' in meta, false);
    assert.equal('sendPurchase' in meta, false);
  });
});
