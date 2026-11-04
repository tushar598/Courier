import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { VaultKey } from './crypto.js';

/**
 * Opaque handle ids. 128 bits of randomness; the prefix only says what kind
 * of thing it points at, never anything about the contents.
 */
export type HandleKind = 'ord' | 'sec';
const HANDLE_RE = /^(ord|sec)_[A-Za-z0-9_-]{22}$/;

export function newHandle(kind: HandleKind): string {
  return `${kind}_${randomBytes(16).toString('base64url')}`;
}

export function isHandle(value: string, kind?: HandleKind): boolean {
  const m = HANDLE_RE.exec(value);
  return m !== null && (kind === undefined || m[1] === kind);
}

/** Storage backend: stores only ciphertext. */
export interface BlobStore {
  put(id: string, blob: Buffer, expiresAt: number): void;
  get(id: string): { blob: Buffer; expiresAt: number } | undefined;
  delete(id: string): void;
  purgeExpired(now: number): number;
}

export class MemoryBlobStore implements BlobStore {
  readonly #rows = new Map<string, { blob: Buffer; expiresAt: number }>();
  put(id: string, blob: Buffer, expiresAt: number): void {
    this.#rows.set(id, { blob, expiresAt });
  }
  get(id: string): { blob: Buffer; expiresAt: number } | undefined {
    return this.#rows.get(id);
  }
  delete(id: string): void {
    this.#rows.delete(id);
  }
  purgeExpired(now: number): number {
    let n = 0;
    for (const [id, row] of this.#rows) {
      if (row.expiresAt <= now) {
        this.#rows.delete(id);
        n++;
      }
    }
    return n;
  }
}

export class SqliteBlobStore implements BlobStore {
  readonly #db: DatabaseSync;
  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS handles (
        id TEXT PRIMARY KEY, blob BLOB NOT NULL, expires_at INTEGER NOT NULL)`);
  }
  put(id: string, blob: Buffer, expiresAt: number): void {
    this.#db
      .prepare('INSERT OR REPLACE INTO handles (id, blob, expires_at) VALUES (?, ?, ?)')
      .run(id, blob, expiresAt);
  }
  get(id: string): { blob: Buffer; expiresAt: number } | undefined {
    const row = this.#db.prepare('SELECT blob, expires_at FROM handles WHERE id = ?').get(id) as
      { blob: Uint8Array; expires_at: number } | undefined;
    return row && { blob: Buffer.from(row.blob), expiresAt: row.expires_at };
  }
  delete(id: string): void {
    this.#db.prepare('DELETE FROM handles WHERE id = ?').run(id);
  }
  purgeExpired(now: number): number {
    return Number(this.#db.prepare('DELETE FROM handles WHERE expires_at <= ?').run(now).changes);
  }
}

export interface HandleStoreOptions {
  key: VaultKey;
  store: BlobStore;
  ttlSeconds: number;
  now?: () => number;
}

/** Maps opaque handles to encrypted JSON payloads, with expiry. */
export class HandleStore {
  readonly #key: VaultKey;
  readonly #store: BlobStore;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(opts: HandleStoreOptions) {
    this.#key = opts.key;
    this.#store = opts.store;
    this.#ttlMs = opts.ttlSeconds * 1000;
    this.#now = opts.now ?? Date.now;
  }

  put(kind: HandleKind, payload: unknown, id: string = newHandle(kind)): string {
    if (!isHandle(id, kind)) throw new Error('handle store: invalid handle id');
    const blob = this.#key.seal(Buffer.from(JSON.stringify(payload), 'utf8'), id);
    this.#store.put(id, blob, this.#now() + this.#ttlMs);
    return id;
  }

  get<T = unknown>(id: string): T | undefined {
    if (!isHandle(id)) return undefined;
    const row = this.#store.get(id);
    if (!row) return undefined;
    if (row.expiresAt <= this.#now()) {
      this.#store.delete(id);
      return undefined;
    }
    return JSON.parse(this.#key.open(row.blob, id).toString('utf8')) as T;
  }

  delete(id: string): void {
    this.#store.delete(id);
  }

  purgeExpired(): number {
    return this.#store.purgeExpired(this.#now());
  }
}
