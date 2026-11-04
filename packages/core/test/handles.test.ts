import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HandleStore,
  MemoryBlobStore,
  SqliteBlobStore,
  VaultKey,
  isHandle,
  newHandle,
  type BlobStore,
} from '../src/index.js';

const SECRET = { invoice_access_token: 'tok_SUPERSECRET_123', code: 'GIFT-AAAA-BBBB' };

describe('VaultKey', () => {
  it('round-trips and rejects a different AAD', () => {
    const key = VaultKey.generate();
    const blob = key.seal(Buffer.from('hello'), 'ord_a');
    expect(key.open(blob, 'ord_a').toString()).toBe('hello');
    expect(() => key.open(blob, 'ord_b')).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const key = VaultKey.generate();
    const blob = key.seal(Buffer.from('hello'), 'x');
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 1;
    expect(() => key.open(blob, 'x')).toThrow();
  });

  it('never serialises key material', () => {
    const key = VaultKey.generate();
    expect(JSON.stringify({ key })).toBe('{"key":"[VaultKey]"}');
  });

  it('rejects keys of the wrong length', () => {
    expect(() => VaultKey.fromBase64(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('handles', () => {
  it('are opaque and well-formed', () => {
    const h = newHandle('ord');
    expect(isHandle(h, 'ord')).toBe(true);
    expect(isHandle(h, 'sec')).toBe(false);
    expect(isHandle('ord_../../etc/passwd')).toBe(false);
  });
});

const backends: [string, () => BlobStore][] = [
  ['memory', () => new MemoryBlobStore()],
  ['sqlite', () => new SqliteBlobStore(join(mkdtempSync(join(tmpdir(), 'courier-')), 'h.db'))],
];

describe.each(backends)('HandleStore (%s)', (_name, makeStore) => {
  it('stores only ciphertext and returns plaintext by handle', () => {
    const blobs = makeStore();
    const store = new HandleStore({ key: VaultKey.generate(), store: blobs, ttlSeconds: 60 });
    const h = store.put('sec', SECRET);
    expect(store.get(h)).toEqual(SECRET);
    const raw = blobs.get(h)?.blob.toString('latin1') ?? '';
    expect(raw).not.toContain('SUPERSECRET');
    expect(raw).not.toContain('GIFT-AAAA');
  });

  it('expires after TTL', () => {
    let t = 1_000_000;
    const store = new HandleStore({
      key: VaultKey.generate(),
      store: makeStore(),
      ttlSeconds: 10,
      now: () => t,
    });
    const h = store.put('sec', SECRET);
    t += 9_999;
    expect(store.get(h)).toEqual(SECRET);
    t += 1;
    expect(store.get(h)).toBeUndefined();
  });

  it('cannot be read with a different key', () => {
    const blobs = makeStore();
    const a = new HandleStore({ key: VaultKey.generate(), store: blobs, ttlSeconds: 60 });
    const b = new HandleStore({ key: VaultKey.generate(), store: blobs, ttlSeconds: 60 });
    const h = a.put('sec', SECRET);
    expect(() => b.get(h)).toThrow();
  });

  it('returns undefined for unknown or malformed handles', () => {
    const store = new HandleStore({ key: VaultKey.generate(), store: makeStore(), ttlSeconds: 60 });
    expect(store.get(newHandle('sec'))).toBeUndefined();
    expect(store.get('not-a-handle')).toBeUndefined();
  });
});
