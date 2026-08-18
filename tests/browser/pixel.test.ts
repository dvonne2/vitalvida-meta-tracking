import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { loadPixel, initializePixel, trackPageView, trackViewContent, trackInitiateCheckout } from '../../src/browser/pixel.js';

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
    (globalThis as any).window._fbq = undefined;
    (globalThis as any).window.__vvPixelLoaded = undefined;
    (globalThis as any).window.__vvPixelLoadPromise = undefined;
    (globalThis as any).window.__vvPixelsInitialized = undefined;
  }

  function simulateLibraryTakeover() {
    const fbq = (globalThis as any).window.fbq;
    if (typeof fbq !== 'function') return;
    fbq.callMethod = (...args: unknown[]) => { fbqCalls.push(args); };
    const q = fbq.queue as unknown[][];
    fbq.queue = [];
    q.forEach((args) => fbq(...args));
  }

  it('creates a standards-compatible fbq stub before fbevents.js loads', async () => {
    reset();
    const p = loadPixel();
    assert.equal(appended.length, 1);
    const script = appended[0];
    assert.ok(script);

    const fbq = (globalThis as any).window.fbq;
    assert.equal(typeof fbq, 'function');
    assert.equal(fbq.loaded, true);
    assert.equal(fbq.version, '2.0');
    assert.ok(Array.isArray(fbq.queue));
    assert.equal(fbq, (globalThis as any).window._fbq);

    script.onload();
    await p;
    assert.equal((globalThis as any).window.__vvPixelLoaded, true);
  });

  it('first loadPixel() resolves when the script loads', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];
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

  it('repeated loadPixel() resolves when the script element already exists', async () => {
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

  it('reuses an existing official fbq instead of creating a conflicting stub', async () => {
    reset();
    const existingFbq = (...args: unknown[]) => { fbqCalls.push(args); };
    (existingFbq as any).loaded = true;
    (existingFbq as any).version = '2.0';
    (globalThis as any).window.fbq = existingFbq;

    await loadPixel();
    assert.equal(appended.length, 0);
    assert.equal((globalThis as any).window.fbq, existingFbq);
    assert.equal((globalThis as any).window.__vvPixelLoaded, true);
  });

  it('PageView queued before library readiness is ultimately processed', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];

    trackPageView('pv_before');
    const fbq = (globalThis as any).window.fbq;
    assert.equal(fbq.queue.length, 1);

    script.onload();
    await p;

    simulateLibraryTakeover();
    assert.equal(fbqCalls.length, 1);
    assert.deepEqual(fbqCalls[0][0], 'track');
    assert.deepEqual(fbqCalls[0][1], 'PageView');
    assert.equal(fbq.queue.length, 0);
  });

  it('browser PageView can actually fire after the Pixel is ready', async () => {
    reset();
    const p = loadPixel();
    const script = appended[0];
    script.onload();
    await p;
    simulateLibraryTakeover();

    const sent = trackPageView('pv_test123');
    assert.equal(sent, true);
    assert.equal(fbqCalls.length, 1);
    assert.deepEqual(fbqCalls[0][0], 'track');
    assert.deepEqual(fbqCalls[0][1], 'PageView');
  });

  it('browser ViewContent event emits', async () => {
    reset();
    const p = loadPixel();
    appended[0].onload();
    await p;
    simulateLibraryTakeover();

    const sent = trackViewContent('vc_test123', { content_name: 'Test', value: 100 });
    assert.equal(sent, true);
    assert.equal(fbqCalls.length, 1);
    assert.equal(fbqCalls[0][1], 'ViewContent');
  });

  it('browser InitiateCheckout event emits after PageView without hanging', async () => {
    reset();
    const p = loadPixel();
    appended[0].onload();
    await p;
    simulateLibraryTakeover();

    trackPageView('pv_test456');
    const checkout = trackInitiateCheckout('ic_test456', { value: 100, currency: 'NGN' });
    assert.equal(checkout, true);
    assert.equal(fbqCalls.length, 2);
    assert.equal(fbqCalls[0][1], 'PageView');
    assert.equal(fbqCalls[1][1], 'InitiateCheckout');
  });

  it('fbq init runs only once per Pixel lifecycle', async () => {
    reset();
    const p = loadPixel();
    appended[0].onload();
    await p;
    simulateLibraryTakeover();

    const first = initializePixel('987654321098765', { external_id: 'ext-1' });
    const second = initializePixel('987654321098765', { external_id: 'ext-1' });
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(fbqCalls.length, 1);
  });
});
