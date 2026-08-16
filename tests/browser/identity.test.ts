import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { getVisitorId } from '../../src/browser/identity.js';

describe('browser/identity', () => {
  const originalLocalStorage = (globalThis as any).localStorage;

  after(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('generates a stable visitor id with the default storage key', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    } as unknown as Storage;

    const first = getVisitorId('__vv_visitor_id');
    const second = getVisitorId('__vv_visitor_id');
    assert.equal(first, second);
    assert.match(first, /^[0-9a-z]+_[0-9a-z]+$/);
  });

  it('falls back to a new id when localStorage is unavailable', () => {
    (globalThis as any).localStorage = undefined;
    const id = getVisitorId('__vv_visitor_id');
    assert.ok(id.length > 0);
  });
});
