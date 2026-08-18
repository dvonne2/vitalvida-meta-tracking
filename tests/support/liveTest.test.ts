import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMetaLiveTestContext, isSuspiciousUserAgent, META_LIVE_TEST_USER_AGENT } from './liveTest.js';

describe('support/liveTest', () => {
  it('provides a realistic non-headless Chrome user agent', () => {
    const ctx = createMetaLiveTestContext();
    assert.equal(ctx.userAgent, META_LIVE_TEST_USER_AGENT);
    assert.ok(ctx.userAgent.includes('Chrome/'));
    assert.ok(ctx.userAgent.includes('Safari/'));
    assert.equal(isSuspiciousUserAgent(ctx.userAgent), false);
  });

  it('rejects common headless, bot, and Playwright identifiers', () => {
    assert.equal(isSuspiciousUserAgent('Mozilla/5.0 HeadlessChrome/125.0.0.0 Safari/537.36'), true);
    assert.equal(isSuspiciousUserAgent('Mozilla/5.0 Chrome/125.0 Playwright/1.0.0'), true);
    assert.equal(isSuspiciousUserAgent('Mozilla/5.0 (compatible; SomeBot/1.0)'), true);
    assert.equal(isSuspiciousUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'), false);
  });

  it('preserves consumer overrides while keeping a default viewport', () => {
    const ctx = createMetaLiveTestContext({ userAgent: 'Custom/1.0', extraHTTPHeaders: { 'Accept-Language': 'en' } });
    assert.equal(ctx.userAgent, 'Custom/1.0');
    assert.equal(ctx.viewport.width, 1280);
    assert.equal(ctx.viewport.height, 800);
    assert.deepEqual(ctx.extraHTTPHeaders, { 'Accept-Language': 'en' });
  });
});
