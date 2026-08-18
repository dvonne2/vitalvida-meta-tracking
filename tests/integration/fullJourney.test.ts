import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';
import { createMetaCapi } from '../../src/server/pageView.js';

describe('integration/fullJourney', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalLocation = (globalThis as any).location;
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalFetch = (globalThis as any).fetch;

  let capturedBrowserPayloads: Record<string, unknown>[] = [];
  let capturedMetaBodies: Record<string, unknown>[] = [];
  let fbqCalls: unknown[][] = [];
  const store = new Map<string, string>();

  const capiConfig = {
    pixelId: '987654321098765',
    accessToken: 'test-token',
    apiVersion: 'v18.0',
    testEventCode: 'TEST999',
    allowedOrigins: ['https://example.com'],
    allowedSourceHosts: ['example.com'],
  };

  let capi = createMetaCapi(capiConfig);

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
      documentElement: { scrollHeight: 1000 },
      head: { appendChild: (el: any) => { if (typeof el.onload === 'function') setTimeout(() => el.onload(), 0); } },
      getElementById: () => null,
      createElement: (tag: string) => {
        const el: Record<string, unknown> = { tag };
        return new Proxy(el, { set: (target, prop, value) => { target[prop as string] = value; return true; } }) as unknown as HTMLElement;
      },
    };

    (globalThis as any).window = {
      location: { href: 'https://example.com/?utm_source=newsletter#section', search: '' },
      scrollY: 0,
      innerHeight: 500,
      fbq: (...args: unknown[]) => { fbqCalls.push(args); },
      addEventListener: (event: string, listener: EventListener) => { (globalThis as any).window.__listeners = (globalThis as any).window.__listeners || {}; (globalThis as any).window.__listeners[event] = listener; },
      removeEventListener: () => {},
      dispatchEvent: (event: string) => { const l = (globalThis as any).window.__listeners?.[event]; if (l) l(); },
    };

    (globalThis as any).location = (globalThis as any).window.location;

    (globalThis as any).fetch = async (url: string | URL, init: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();

      if (u.startsWith('https://graph.facebook.com')) {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        capturedMetaBodies.push(body);
        return new Response(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'META' }), { status: 200 });
      }

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      capturedBrowserPayloads.push(body);

      const forwarded = {
        origin: 'https://example.com',
        host: 'example.com',
        'x-forwarded-for': '1.2.3.4',
        'user-agent': 'FullJourneyBot/1.0',
      };

      let res: import('../../src/shared/types.js').MetaSendResult;
      switch (body.event_name) {
        case 'PageView':
          res = await capi.sendPageView({ body, headers: forwarded, remoteAddress: '1.2.3.4' });
          break;
        case 'ViewContent':
          res = await capi.sendViewContent({ body, headers: forwarded, remoteAddress: '1.2.3.4' });
          break;
        case 'InitiateCheckout':
          res = await capi.sendInitiateCheckout({ body, headers: forwarded, remoteAddress: '1.2.3.4' });
          break;
        default:
          res = { ok: false, eventName: 'unknown', eventId: '' };
      }

      return new Response(JSON.stringify(res), { status: res.ok ? 200 : 400 });
    };
  });

  after(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).location = originalLocation;
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).fetch = originalFetch;
  });

  function reset() {
    store.clear();
    capturedBrowserPayloads = [];
    capturedMetaBodies = [];
    fbqCalls = [];
    (globalThis as any).document.cookie = '';
    (globalThis as any).window.location.href = 'https://example.com/?utm_source=newsletter#section';
    (globalThis as any).window.location.search = '';
    (globalThis as any).window.scrollY = 0;
    (globalThis as any).window.__listeners = {};
    (globalThis as any).window.__vvInitializedPixelIds = new Set<string>();
    capi = createMetaCapi(capiConfig);
  }

  function meta() {
    return createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'ng',
      viewContent: { scrollPercent: 20 },
    });
  }

  async function scrollTo20() {
    (globalThis as any).window.scrollY = 100;
    (globalThis as any).window.dispatchEvent('scroll');
    await new Promise((r) => setTimeout(r, 30));
  }

  function browserEventId(name: string) {
    const call = fbqCalls.find((c) => c[1] === name);
    if (!call) return '';
    return ((call[3] as { eventID?: string }) || {}).eventID || '';
  }

  function capiEventId(name: string) {
    const body = capturedMetaBodies.find((b) => (b.data as any)?.[0]?.event_name === name);
    if (!body) return '';
    return ((body.data as any)[0] as { event_id: string }).event_id;
  }

  it('Scenario A — Direct traffic completes the funnel in order', async () => {
    reset();
    const m = meta();

    await m.firePageView();
    await scrollTo20();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });

    const purchaseBody = {
      event_name: 'Purchase',
      event_id: 'ORDER-DIRECT-001',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/complete?utm_source=newsletter&fbclid=should-be-removed#section',
      user_data: {
        external_id: (capturedBrowserPayloads[capturedBrowserPayloads.length - 1] as any).user_data.external_id,
        phone: '08012345678',
        name: 'Bola Ategbe',
        email: 'Bola@Example.COM',
        city: 'Lagos',
        state: 'Lagos',
        country: 'ng',
      },
      custom_data: {
        order_id: 'ORDER-DIRECT-001',
        value: 15000,
        currency: 'NGN',
        content_ids: ['vv-hair-vitamin'],
        content_name: 'Generic Hair Vitamin',
        content_type: 'product',
        num_items: 2,
        contents: [{ id: 'vv-hair-vitamin', quantity: 2 }],
      },
    };

    const purchaseRes = await capi.sendPurchase({
      body: purchaseBody,
      headers: { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'FullJourneyBot/1.0' },
    });

    // Funnel order
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length, 1);
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'ViewContent').length, 1);
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'InitiateCheckout').length, 1);
    assert.equal(fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'Purchase').length, 0);

    const metaEventNames = capturedMetaBodies.map((b) => ((b.data as any)[0] as { event_name: string }).event_name);
    assert.deepEqual(metaEventNames, ['PageView', 'ViewContent', 'InitiateCheckout', 'Purchase']);

    // IDs
    assert.ok(browserEventId('PageView').startsWith('pv_'));
    assert.ok(browserEventId('ViewContent').startsWith('vc_'));
    assert.ok(browserEventId('InitiateCheckout').startsWith('ic_'));
    assert.equal(browserEventId('PageView'), capiEventId('PageView'));
    assert.equal(browserEventId('ViewContent'), capiEventId('ViewContent'));
    assert.equal(browserEventId('InitiateCheckout'), capiEventId('InitiateCheckout'));
    assert.equal(capiEventId('Purchase'), 'ORDER-DIRECT-001');

    const pvId = browserEventId('PageView');
    const vcId = browserEventId('ViewContent');
    const icId = browserEventId('InitiateCheckout');
    assert.notEqual(pvId, vcId);
    assert.notEqual(pvId, icId);
    assert.notEqual(vcId, icId);
    assert.notEqual(icId, 'ORDER-DIRECT-001');

    // No fabricated fbc
    capturedMetaBodies.forEach((body) => {
      const userData = (body.data as any)[0].user_data as Record<string, unknown>;
      assert.equal('fbc' in userData, false);
    });

    // Customer data hashed once, fbp not present
    const purchaseMeta = capturedMetaBodies.find((b) => ((b.data as any)[0] as { event_name: string }).event_name === 'Purchase');
    const pud = ((purchaseMeta!.data as any)[0].user_data) as Record<string, unknown>;
    assert.match(pud.ph as string, /^[0-9a-f]{64}$/);
    assert.match(pud.fn as string, /^[0-9a-f]{64}$/);
    assert.match(pud.ln as string, /^[0-9a-f]{64}$/);
    assert.match(pud.em as string, /^[0-9a-f]{64}$/);
    assert.equal('fbp' in pud, false);

    // Source URL sanitized
    capturedMetaBodies.forEach((body) => {
      const url = ((body.data as any)[0] as { event_source_url: string }).event_source_url;
      assert.equal(url.includes('fbclid'), false);
      assert.equal(url.includes('#'), false);
      assert.ok(url.includes('utm_source=newsletter'));
    });

    // Test event code top-level on server, not in browser payload
    capturedMetaBodies.forEach((body) => {
      assert.equal(body.test_event_code, 'TEST999');
    });
    capturedBrowserPayloads.forEach((body) => {
      assert.equal('test_event_code' in body, false);
    });

    assert.equal(purchaseRes.ok, true);
    assert.equal(purchaseRes.eventId, 'ORDER-DIRECT-001');
  });

  it('Scenario B — Meta ad click preserves fbc through the funnel', async () => {
    reset();
    (globalThis as any).window.location.search = '?fbclid=meta-click-789';
    (globalThis as any).window.location.href = 'https://example.com/?fbclid=meta-click-789&utm_source=newsletter#section';

    const m = meta();
    await m.firePageView();
    await scrollTo20();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });

    const lastBrowser = capturedBrowserPayloads[capturedBrowserPayloads.length - 1] as any;
    const fbc = lastBrowser.user_data.fbc as string;
    assert.match(fbc, /^fb\.1\.\d+\.meta-click-789$/);

    const purchaseBody = {
      event_name: 'Purchase',
      event_id: 'ORDER-META-001',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/complete?utm_source=newsletter&fbclid=should-be-removed#section',
      user_data: {
        external_id: lastBrowser.user_data.external_id,
        phone: '08012345678',
        name: 'Bola Ategbe',
        city: 'Lagos',
        state: 'Lagos',
        country: 'ng',
        fbc,
      },
      custom_data: {
        order_id: 'ORDER-META-001',
        value: 15000,
        currency: 'NGN',
      },
    };

    await capi.sendPurchase({
      body: purchaseBody,
      headers: { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'FullJourneyBot/1.0' },
    });

    const fbcValues = capturedMetaBodies.map((b) => (((b.data as any)[0].user_data) as Record<string, unknown>).fbc).filter(Boolean);
    assert.equal(fbcValues.length, 4);
    fbcValues.forEach((v) => assert.equal(v, fbc));
  });

  it('genuine _fbp persists through all events and is not fabricated', async () => {
    reset();
    (globalThis as any).document.cookie = '_fbp=fb.1.1234567890.browserid';

    const m = meta();
    await m.firePageView();
    await scrollTo20();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });

    const lastBrowser = capturedBrowserPayloads[capturedBrowserPayloads.length - 1] as any;
    const fbp = lastBrowser.user_data.fbp as string;
    assert.equal(fbp, 'fb.1.1234567890.browserid');

    const purchaseBody = {
      event_name: 'Purchase',
      event_id: 'ORDER-FBP-001',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://example.com/complete?utm_source=newsletter&fbclid=should-be-removed#section',
      user_data: {
        external_id: lastBrowser.user_data.external_id,
        fbp,
      },
      custom_data: { order_id: 'ORDER-FBP-001', value: 1000, currency: 'NGN' },
    };
    await capi.sendPurchase({ body: purchaseBody, headers: { origin: 'https://example.com', host: 'example.com' } });

    capturedMetaBodies.forEach((b) => {
      const userData = ((b.data as any)[0].user_data) as Record<string, unknown>;
      if ((b.data as any)[0].event_name !== 'PageView') {
        assert.equal(userData.fbp, 'fb.1.1234567890.browserid');
      } else {
        assert.equal(userData.fbp, 'fb.1.1234567890.browserid');
      }
    });
  });

  it('external_id remains consistent across all events', async () => {
    reset();
    const m = meta();
    await m.firePageView();
    await scrollTo20();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });

    const first = (capturedBrowserPayloads[0] as any).user_data.external_id as string;
    capturedBrowserPayloads.forEach((b) => {
      assert.equal((b as any).user_data.external_id, first);
    });

    const hashed = (((capturedMetaBodies[0] as any).data as any)[0].user_data as Record<string, unknown>).external_id as string[];
    capturedMetaBodies.forEach((b) => {
      const externalId = (((b.data as any)[0].user_data) as Record<string, unknown>).external_id as string[];
      assert.deepEqual(externalId, hashed);
    });
  });

  it('Pixel ID is initialized exactly once and checkout does not re-init', async () => {
    reset();
    const m = meta();
    await m.firePageView();
    await m.updateCheckout({
      name: 'Bola Ategbe',
      phone: '08012345678',
      email: 'Bola@Example.COM',
      city: 'Lagos',
      state: 'Lagos',
    });

    const initCalls = fbqCalls.filter((c) => c[0] === 'init');
    assert.equal(initCalls.length, 1, 'fbq init must be called exactly once per Pixel ID');
    const data = initCalls[0][2] as Record<string, unknown>;
    assert.equal(typeof data.external_id, 'string');
    assert.equal(data.country, 'ng');
    assert.equal('ph' in data, false);
    assert.equal('fn' in data, false);
    assert.equal('em' in data, false);
  });

  it('tracking failure does not crash the host application', async () => {
    reset();
    (globalThis as any).window.fbq = undefined;
    (globalThis as any).fetch = async (url: string | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.startsWith('https://graph.facebook.com')) {
        return new Response('bad', { status: 500 });
      }
      return new Response(JSON.stringify({ ok: false, eventName: 'PageView', eventId: '' }), { status: 500 });
    };

    const m = meta();
    const res = await m.firePageView();
    assert.equal(res.browserSent, false);
    assert.equal(res.capiResult?.ok, false);

    (globalThis as any).fetch = async (url: string | URL, init: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.startsWith('https://graph.facebook.com')) {
        capturedMetaBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return new Response(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'META' }), { status: 200 });
      }
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      capturedBrowserPayloads.push(body);
      const forwarded = { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'FullJourneyBot/1.0' };
      let res: import('../../src/shared/types.js').MetaSendResult;
      switch (body.event_name) {
        case 'PageView': res = await capi.sendPageView({ body, headers: forwarded, remoteAddress: '1.2.3.4' }); break;
        case 'ViewContent': res = await capi.sendViewContent({ body, headers: forwarded, remoteAddress: '1.2.3.4' }); break;
        case 'InitiateCheckout': res = await capi.sendInitiateCheckout({ body, headers: forwarded, remoteAddress: '1.2.3.4' }); break;
        default: res = { ok: false, eventName: 'unknown', eventId: '' };
      }
      return new Response(JSON.stringify(res), { status: res.ok ? 200 : 400 });
    };
  });
});
