import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { loadPixel, initializePixel, trackPageView, trackInitiateCheckout } from '../../src/browser/pixel.js';

describe('browser/pixel', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;

  let appended: any[] = [];
  let fbqCalls: unknown[][] = [];

  before(() => {
    (globalThis as any).document = {
      cookie: '',
      head: {
        appendChild: (el: any) => { appended.push(el); },
      },
      getElementById: () => null,
      createElement: (tag: string) => {
        const el: Record<string, unknown> = { tag };
        return new Proxy(el, { set: (target, prop, value) => { target[prop as string] = value; return true; } }) as unknown as HTMLElement;
      },
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/', search: '' },
    };
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  function reset() {
    appended = [];
    fbqCalls = [];
    (globalThis as any).window.fbq = undefined;
    (globalThis as any).window.__vvPixelLoaded = undefined;
    (globalThis as any).window.__vvPixelLoadPromise = undefined;
    (globalThis as any).window.__vvPixelsInitialized = undefined;
  }

  it('creates window.fbq stub before fbevents.js loads', async () => {
    reset();
    const p = loadPixel();
    assert.equal(appended.length, 1);
    const script = appended[0];
    assert.ok(script);
    // Stub should be created before onload resolves
    assert.ok(typeof (globalThis as any).window.fbq === 'function');
    assert.ok(Array.isArray((globalThis as any).window.fbq.queue));
    script.onload();
    await p;
    assert.ok((globalThis as any).window.__vvPixelLoaded);
  });

  it('first loadPixel() resolves when the script loads', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];
    assert.ok(script);
    script.onload();
    await p;
    assert.equal((globalThis as any).window.__vvPixelLoaded, true);
  });

  it('repeated loadPixel() resolves immediately and does not inject a second script', async () => {
    reset();
    const first = loadPixel();
    const script = appended[0];
    script.onload();
    await first;

    const second = loadPixel();
    assert.equal(appended.length, 1);
    await second;
    assert.equal((globalThis as any).window.__vvPixelLoaded, true);
  });

  it('repeated loadPixel() resolves immediately when the script element already exists', async () => {
    reset();
    (globalThis as any).document.getElementById = (id: string) => {
      return id === 'vitalvida-fbevents' ? appended[0] : null;
    };
    const first = loadPixel();
    const script = appended[0];
    script.onload();
    await first;

    const second = loadPixel();
    assert.equal(appended.length, 1);
    await second;
    (globalThis as any).document.getElementById = () => null;
  });

  it('browser PageView can actually fire after the Pixel is ready', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];
    script.onload();
    await p;

    (globalThis as any).window.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
    const sent = trackPageView('pv_test123');
    assert.equal(sent, true);
    assert.equal(fbqCalls.length, 1);
    assert.deepEqual(fbqCalls[0][0], 'track');
    assert.deepEqual(fbqCalls[0][1], 'PageView');
  });

  it('later InitiateCheckout does not hang and can fire after PageView', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];
    script.onload();
    await p;

    (globalThis as any).window.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
    const pageView = trackPageView('pv_test456');
    assert.equal(pageView, true);

    const checkout = trackInitiateCheckout('ic_test456', { value: 100, currency: 'NGN' });
    assert.equal(checkout, true);
    assert.equal(fbqCalls.length, 2);
    assert.equal(fbqCalls[1][1], 'InitiateCheckout');
  });

  it('fbq init runs only once per Pixel lifecycle', async () => {
    reset();
    const p = loadPixel();
    appended[0].onload();
    await p;

    (globalThis as any).window.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
    const first = initializePixel('987654321098765', { external_id: 'ext-1' });
    const second = initializePixel('987654321098765', { external_id: 'ext-1' });
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(fbqCalls.length, 1);
  });
});
