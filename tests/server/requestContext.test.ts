import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractClientContext } from '../../src/server/requestContext.js';

describe('server/requestContext', () => {
  it('extracts client ip from x-forwarded-for', () => {
    const ctx = extractClientContext({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'user-agent': 'TestAgent/1.0',
      host: 'example.com',
      origin: 'https://example.com',
    });
    assert.equal(ctx.clientIp, '1.2.3.4');
    assert.equal(ctx.userAgent, 'TestAgent/1.0');
    assert.equal(ctx.host, 'example.com');
    assert.equal(ctx.origin, 'https://example.com');
  });

  it('falls back to x-real-ip', () => {
    const ctx = extractClientContext({
      'x-real-ip': '9.9.9.9',
      'user-agent': 'TestAgent/1.0',
      host: 'example.com',
    });
    assert.equal(ctx.clientIp, '9.9.9.9');
  });

  it('works with a Headers-like get method', () => {
    const headers = new Map<string, string | null>();
    headers.set('x-forwarded-for', '4.3.2.1');
    headers.set('user-agent', 'Other/2.0');
    headers.set('host', 'api.example.com');
    headers.set('origin', 'https://example.com');

    const ctx = extractClientContext(
      {
        get: (name: string) => headers.get(name) ?? null,
      } as unknown as import('../../src/server/requestContext.js').HeadersLike,
      '1.1.1.1',
    );
    assert.equal(ctx.clientIp, '4.3.2.1');
    assert.equal(ctx.userAgent, 'Other/2.0');
    assert.equal(ctx.host, 'api.example.com');
  });
});
