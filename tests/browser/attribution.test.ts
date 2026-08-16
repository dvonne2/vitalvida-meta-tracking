import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { captureFbc, getFbp } from '../../src/browser/attribution.js';

describe('browser/attribution', () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;

  before(() => {
    (globalThis as any).window = { location: { search: '' } };
    (globalThis as any).document = { cookie: '' };
  });

  after(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it('does not fabricate fbc for direct traffic', () => {
    (globalThis as any).window.location.search = '';
    (globalThis as any).document.cookie = '';
    const fbc = captureFbc();
    assert.equal(fbc, null);
  });

  it('produces a valid fbc from a real fbclid', () => {
    (globalThis as any).window.location.search = '?fbclid=abc123';
    (globalThis as any).document.cookie = '';
    const fbc = captureFbc();
    assert.ok(fbc);
    assert.match(fbc!, /^fb\.1\.\d+\.abc123$/);
  });

  it('preserves an existing valid _fbc cookie', () => {
    (globalThis as any).window.location.search = '';
    (globalThis as any).document.cookie = '_fbc=fb.1.1234567890.existingClick';
    const fbc = captureFbc();
    assert.equal(fbc, 'fb.1.1234567890.existingClick');
  });

  it('does not fabricate _fbp when the cookie is absent', () => {
    (globalThis as any).document.cookie = '';
    const fbp = getFbp();
    assert.equal(fbp, null);
  });

  it('preserves a genuine _fbp cookie', () => {
    (globalThis as any).document.cookie = '_fbp=fb.1.1234567890.browserid';
    const fbp = getFbp();
    assert.equal(fbp, 'fb.1.1234567890.browserid');
  });
});
