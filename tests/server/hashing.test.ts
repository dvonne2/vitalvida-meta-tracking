import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sha256, hashExternalId, looksLikeSha256 } from '../../src/server/hashing.js';

describe('server/hashing', () => {
  it('sha256 produces a 64-character hex string', async () => {
    const h = await sha256('hello');
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('hashExternalId hashes a raw value', async () => {
    const h = await hashExternalId('visitor-123');
    assert.equal(h.length, 64);
  });

  it('hashExternalId does not double-hash a sha256-looking value', async () => {
    const existing = 'a'.repeat(64);
    const h = await hashExternalId(existing);
    assert.equal(h, existing);
  });

  it('looksLikeSha256 recognizes 64-character hex strings', () => {
    assert.equal(looksLikeSha256('a'.repeat(64)), true);
    assert.equal(looksLikeSha256('not-hex'), false);
  });
});
