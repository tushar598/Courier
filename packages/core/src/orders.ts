import { DatabaseSync } from 'node:sqlite';
import type { DenyReason } from './policy.js';
import type { ProductType } from './sanitize.js';

/**
 * Order lifecycle. Non-secret metadata lives here in plain SQLite; anything
 * that grants access to the goods (invoice id, access token, payment link,
 * codes) lives only in the encrypted handle store under `vaultHandle`.
 *
 *   denied                         (policy, terminal)
 *   pending_approval → rejected    (human, terminal)
 *   pending_approval → approved → purchasing → awaiting_payment → paid → delivered
 *                                            ↘ failed (from any in-flight state)
 */
export const ORDER_STATUSES = [
  'denied',
  'pending_approval',
  'rejected',
  'approved',
  'purchasing',
  'awaiting_payment',
  'paid',
  'delivered',
  'failed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that count against the daily cap. */
export const COMMITTED_STATUSES: readonly OrderStatus[] = [
  'pending_approval',
  'approved',
  'purchasing',
  'awaiting_payment',
  'paid',
  'delivered',
];

export interface Order {
  handle: string;
  status: OrderStatus;
  productId: string;
  productName: string;
  productType: ProductType;
  country: string;
  packageValue: string;
  amountCents: number;
  currency: string;
  intent: string;
  denyReasons: DenyReason[];
  decidedBy: string | null;
  vaultHandle: string | null;
  failure: string | null;
  createdAt: number;
  updatedAt: number;
  lastPolledAt: number;
}

export interface OrderEvent {
  id: number;
  orderHandle: string;
  at: number;
  actor: string;
  event: string;
  detail: string;
}

type Row = Record<string, string | number | null>;

function toOrder(r: Row): Order {
  return {
    handle: String(r.handle),
    status: r.status as OrderStatus,
    productId: String(r.product_id),
    productName: String(r.product_name),
    productType: r.product_type as ProductType,
    country: String(r.country),
    packageValue: String(r.package_value),
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    intent: String(r.intent),
    denyReasons: JSON.parse(String(r.deny_reasons)) as DenyReason[],
    decidedBy: r.decided_by === null ? null : String(r.decided_by),
    vaultHandle: r.vault_handle === null ? null : String(r.vault_handle),
    failure: r.failure === null ? null : String(r.failure),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    lastPolledAt: Number(r.last_polled_at),
  };
}

export type NewOrder = Omit<
  Order,
  'createdAt' | 'updatedAt' | 'lastPolledAt' | 'decidedBy' | 'vaultHandle' | 'failure'
>;

export type OrderPatch = Partial<
  Pick<Order, 'decidedBy' | 'vaultHandle' | 'failure' | 'lastPolledAt'>
>;

export class OrderStore {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  /** `path` = ':memory:' for tests and the hosted demo. */
  constructor(path: string, now: () => number = Date.now) {
    this.#now = now;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS orders (
        handle TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_type TEXT NOT NULL,
        country TEXT NOT NULL,
        package_value TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        intent TEXT NOT NULL,
        deny_reasons TEXT NOT NULL,
        decided_by TEXT,
        vault_handle TEXT,
        failure TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_polled_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at);
      CREATE TABLE IF NOT EXISTS order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_handle TEXT NOT NULL,
        at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        event TEXT NOT NULL,
        detail TEXT NOT NULL
      );`);
  }

  insert(o: NewOrder, actor: string): Order {
    const now = this.#now();
    this.#db
      .prepare(
        `INSERT INTO orders (handle, status, product_id, product_name, product_type, country,
          package_value, amount_cents, currency, intent, deny_reasons, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        o.handle,
        o.status,
        o.productId,
        o.productName,
        o.productType,
        o.country,
        o.packageValue,
        o.amountCents,
        o.currency,
        o.intent,
        JSON.stringify(o.denyReasons),
        now,
        now,
      );
    this.log(o.handle, actor, 'proposed', o.status);
    return this.get(o.handle) as Order;
  }

  get(handle: string): Order | undefined {
    const r = this.#db.prepare('SELECT * FROM orders WHERE handle = ?').get(handle) as
      Row | undefined;
    return r && toOrder(r);
  }

  list(limit = 100): Order[] {
    return (
      this.#db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as Row[]
    ).map(toOrder);
  }

  /**
   * Atomic compare-and-set. Returns false if the order was not in one of
   * `from` — this is what stops two processes (gateway and console) from
   * buying the same order twice.
   */
  transition(
    handle: string,
    from: readonly OrderStatus[],
    to: OrderStatus,
    actor: string,
    patch: OrderPatch = {},
  ): boolean {
    const sets = ['status = ?', 'updated_at = ?'];
    const vals: (string | number | null)[] = [to, this.#now()];
    const columns: [keyof OrderPatch, string][] = [
      ['decidedBy', 'decided_by'],
      ['vaultHandle', 'vault_handle'],
      ['failure', 'failure'],
      ['lastPolledAt', 'last_polled_at'],
    ];
    for (const [field, column] of columns) {
      const value = patch[field];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        vals.push(value);
      }
    }
    const placeholders = from.map(() => '?').join(', ');
    const res = this.#db
      .prepare(
        `UPDATE orders SET ${sets.join(', ')} WHERE handle = ? AND status IN (${placeholders})`,
      )
      .run(...vals, handle, ...from);
    const ok = Number(res.changes) === 1;
    if (ok) this.log(handle, actor, to, patch.failure ?? '');
    return ok;
  }

  touchPolled(handle: string): void {
    this.#db
      .prepare('UPDATE orders SET last_polled_at = ? WHERE handle = ?')
      .run(this.#now(), handle);
  }

  /** Sum of committed spend since `since` (ms epoch), in cents. */
  committedSince(since: number): number {
    const placeholders = COMMITTED_STATUSES.map(() => '?').join(', ');
    const r = this.#db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM orders
         WHERE created_at >= ? AND status IN (${placeholders})`,
      )
      .get(since, ...COMMITTED_STATUSES) as { total: number };
    return Number(r.total);
  }

  log(orderHandle: string, actor: string, event: string, detail: string): void {
    this.#db
      .prepare(
        'INSERT INTO order_events (order_handle, at, actor, event, detail) VALUES (?, ?, ?, ?, ?)',
      )
      .run(orderHandle, this.#now(), actor, event, detail);
  }

  events(limit = 200): OrderEvent[] {
    return (
      this.#db.prepare('SELECT * FROM order_events ORDER BY id DESC LIMIT ?').all(limit) as Row[]
    ).map((r) => ({
      id: Number(r.id),
      orderHandle: String(r.order_handle),
      at: Number(r.at),
      actor: String(r.actor),
      event: String(r.event),
      detail: String(r.detail),
    }));
  }
}
