import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMetaBrowser } from '../../src/browser/pageView.js';

describe('browser/initiateCheckout', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalFetch = (globalThis as any).fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fbqCalls: unknown[][] = [];
  let capturedBody: Record<string, unknown> | null = null;

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
    fbqCalls = [];
    capturedBody = null;
    store.clear();
    (globalThis as any).document.cookie = '';
    (globalThis as any).window.location.search = '';
    (globalThis as any).window.__vvInitializedPixelIds = undefined;
    (globalThis as any).window.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
  }

  function meta() {
    return createMetaBrowser({
      pixelId: '987654321098765',
      capiEndpoint: '/api/capi',
      country: 'ng',
    });
  }

  it('name only does NOT fire InitiateCheckout', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe' });
    assert.equal(result, null);
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 0);
  });

  it('phone only does NOT fire InitiateCheckout', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ phone: '08012345678' });
    assert.equal(result, null);
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 0);
  });

  it('invalid phone + name does NOT fire InitiateCheckout', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '123' });
    assert.equal(result, null);
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 0);
  });

  it('valid phone + name DOES fire InitiateCheckout', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(result);
    assert.ok(result!.eventId.startsWith('ic_'));
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
    assert.equal((capturedBody as any).event_name, 'InitiateCheckout');
  });

  it('email is not required', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(result);
    assert.equal('email' in (capturedBody as any).user_data, false);
  });

  it('package data is not required', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(result);
    assert.equal(Object.keys((capturedBody as any).custom_data).length, 0);
  });

  it('state/city are not required', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(result);
    assert.equal('state' in (capturedBody as any).user_data, false);
    assert.equal('city' in (capturedBody as any).user_data, false);
  });

  it('package data is included if already available', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({
      name: 'Bola Ategbe',
      phone: '08012345678',
      contentName: 'Package A',
      contentIds: ['pkg-a'],
      contentType: 'product',
      value: 12000,
      currency: 'NGN',
      numItems: 1,
    });
    const custom = (capturedBody as any).custom_data as Record<string, unknown>;
    assert.equal(custom.content_name, 'Package A');
    assert.deepEqual(custom.content_ids, ['pkg-a']);
    assert.equal(custom.content_type, 'product');
    assert.equal(custom.value, 12000);
    assert.equal(custom.currency, 'NGN');
    assert.equal(custom.num_items, 1);
    assert.ok(Array.isArray(custom.contents));
  });

  it('package data absent does not block firing', async () => {
    reset();
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola', phone: '08012345678' });
    assert.ok(result);
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
  });

  it('email is included if valid/available', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678', email: 'Bola@Example.COM' });
    assert.equal((capturedBody as any).user_data.email, 'bola@example.com');
    const custom = (capturedBody as any).custom_data as Record<string, unknown>;
    assert.equal('em' in custom, false);
  });

  it('surname omitted when only one name token exists', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola', phone: '08012345678' });
    assert.equal((capturedBody as any).user_data.first_name, 'bola');
    assert.equal('surname' in (capturedBody as any).user_data, false);
  });

  it('phone normalizes from 080...', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.equal((capturedBody as any).user_data.phone, '2348012345678');
  });

  it('phone normalizes from +234...', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '+2348012345678' });
    assert.equal((capturedBody as any).user_data.phone, '2348012345678');
  });

  it('phone normalizes from 234...', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '2348012345678' });
    assert.equal((capturedBody as any).user_data.phone, '2348012345678');
  });

  it('browser InitiateCheckout fires once', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola', phone: '08012345678' });
    await m.updateCheckout({ email: 'bola@example.com' });
    await m.updateCheckout({ contentName: 'Package A', value: 1000 });
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
  });

  it('CAPI InitiateCheckout fires once', async () => {
    reset();
    const m = meta();
    const bodies: unknown[] = [];
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      if (init && init.body) {
        bodies.push(JSON.parse(init.body as string));
        capturedBody = bodies[bodies.length - 1] as Record<string, unknown>;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    };
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.equal(bodies.filter(b => (b as any).event_name === 'InitiateCheckout').length, 1);
    await m.updateCheckout({ email: 'bola@example.com' });
    await m.updateCheckout({ contentName: 'Package A', value: 1000 });
    assert.equal(bodies.filter(b => (b as any).event_name === 'InitiateCheckout').length, 1);
  });

  it('browser and CAPI InitiateCheckout share the exact same event_id', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const trackCall = fbqCalls.find(c => c[1] === 'InitiateCheckout');
    assert.ok(trackCall);
    const eventId = (trackCall![3] as { eventID: string }).eventID;
    assert.equal((capturedBody as any).event_id, eventId);
    assert.ok(eventId.startsWith('ic_'));
  });

  it('pv_, vc_, and ic_ IDs remain distinct', async () => {
    reset();
    const m = meta();
    const pageView = await m.firePageView();
    const pageId = pageView.eventId;
    const viewContent = await m.fireViewContent();
    const viewId = viewContent.eventId;
    const initiate = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const icId = initiate!.eventId;
    assert.ok(pageId.startsWith('pv_'));
    assert.ok(viewId.startsWith('vc_'));
    assert.ok(icId.startsWith('ic_'));
    assert.notEqual(pageId, viewId);
    assert.notEqual(pageId, icId);
    assert.notEqual(viewId, icId);
  });

  it('subsequent updates do not refire', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const first = capturedBody;
    await m.updateCheckout({ email: 'bola@example.com' });
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
    assert.equal((capturedBody as any).event_id, (first as any).event_id);
  });

  it('adding package later does not refire', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const first = capturedBody;
    await m.updateCheckout({ contentName: 'Package A', value: 1000 });
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
    assert.equal((capturedBody as any).event_id, (first as any).event_id);
    assert.equal(Object.keys((capturedBody as any).custom_data).length, 0);
  });

  it('adding email later does not refire', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const first = capturedBody;
    await m.updateCheckout({ email: 'bola@example.com' });
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 1);
    assert.equal((capturedBody as any).event_id, (first as any).event_id);
    assert.equal('email' in (capturedBody as any).user_data, false);
  });

  it('resetCheckout allows a new InitiateCheckout with a new event ID', async () => {
    reset();
    const m = meta();
    const first = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    m.resetCheckout();
    const second = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first!.eventId, second!.eventId);
    assert.equal(fbqCalls.filter(c => c[1] === 'InitiateCheckout').length, 2);
  });

  it('direct traffic does not fabricate fbc', async () => {
    reset();
    (globalThis as any).window.location.search = '';
    (globalThis as any).document.cookie = '';
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.equal('fbc' in (capturedBody as any).user_data, false);
  });

  it('genuine fbc remains available', async () => {
    reset();
    (globalThis as any).window.location.search = '?fbclid=abc123';
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const fbc = (capturedBody as any).user_data.fbc as string;
    assert.ok(fbc);
    assert.match(fbc, /^fb\.1\.\d+\.abc123$/);
  });

  it('genuine _fbp remains available', async () => {
    reset();
    (globalThis as any).document.cookie = '_fbp=fb.1.1234567890.browserid';
    const m = meta();
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.equal((capturedBody as any).user_data.fbp, 'fb.1.1234567890.browserid');
  });

  it('external_id remains stable across PageView and InitiateCheckout', async () => {
    reset();
    const m = meta();
    await m.firePageView();
    const pageBody = capturedBody;
    await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    const icBody = capturedBody;
    assert.equal((pageBody as any).user_data.external_id, (icBody as any).user_data.external_id);
  });

  it('Pixel ID is initialized exactly once and late checkout does not re-init', async () => {
    reset();
    const m = meta();
    await m.firePageView();
    const afterPageView = fbqCalls.filter(c => c[0] === 'init').length;
    await m.updateCheckout({
      name: 'Bola Ategbe',
      phone: '08012345678',
      email: 'Bola@Example.COM',
      city: 'Lagos',
      state: 'Lagos',
    });
    const initCalls = fbqCalls.filter(c => c[0] === 'init');
    assert.equal(initCalls.length, 1, 'Pixel ID must be initialized only once');
    assert.equal(afterPageView, 1);
    // The first and only init contains the initial known matching data only.
    const initData = initCalls[0][2] as Record<string, unknown>;
    assert.equal(typeof initData.external_id, 'string');
    assert.equal(initData.country, 'ng');
    assert.equal('ph' in initData, false);
    assert.equal('fn' in initData, false);
    assert.equal('em' in initData, false);
    // CAPI still receives the full customer matching data.
    const userData = (capturedBody as any).user_data;
    assert.equal(userData.phone, '2348012345678');
    assert.equal(userData.first_name, 'bola');
    assert.equal(userData.surname, 'ategbe');
    assert.equal(userData.email, 'bola@example.com');
    assert.equal(userData.city, 'lagos');
    assert.equal(userData.state, 'lagos');
  });

  it('CAPI InitiateCheckout payload is normalized raw; customer fields not pre-hashed', async () => {
    reset();
    const m = meta();
    await m.updateCheckout({
      name: 'Bola Ategbe',
      phone: '08012345678',
      email: 'Bola@Example.COM',
      city: 'Lagos',
      state: 'Lagos',
    });
    const userData = (capturedBody as any).user_data as Record<string, unknown>;
    // CAPI payload is normalized raw; the server hashes before Meta.
    assert.equal(userData.phone, '2348012345678');
    assert.equal(userData.first_name, 'bola');
    assert.equal(userData.surname, 'ategbe');
    assert.equal(userData.email, 'bola@example.com');
    assert.equal(userData.city, 'lagos');
    assert.equal(userData.state, 'lagos');
    // Verify it is not a 64-char hex hash (no double hashing).
    assert.equal(/^[0-9a-f]{64}$/.test(userData.phone as string), false);
    assert.equal(/^[0-9a-f]{64}$/.test(userData.first_name as string), false);
  });

  it('failures do not break host application', async () => {
    reset();
    (globalThis as any).window.fbq = undefined;
    (globalThis as any).fetch = async () => { throw new Error('network down'); };
    const m = meta();
    const result = await m.updateCheckout({ name: 'Bola Ategbe', phone: '08012345678' });
    assert.ok(result);
    assert.equal(result!.browserSent, false);
    assert.equal(result!.capiResult?.ok, false);
    (globalThis as any).fetch = originalFetch;
  });
});
