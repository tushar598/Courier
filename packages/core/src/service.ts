import type { BitrefillClient } from './bitrefill/types.js';
import { UpstreamError } from './bitrefill/types.js';
import type { HandleStore } from './handles.js';
import { isHandle, newHandle } from './handles.js';
import type { Order, OrderEvent, OrderStatus, OrderStore } from './orders.js';
import type { PolicyConfig } from './policy.js';
import { evaluatePolicy } from './policy.js';
import {
  centsToDisplay,
  isSafePackageValue,
  isSafeSlug,
  isSupportedProduct,
  productTypeOf,
  toSafeDetails,
  toSafePackages,
  toSafeProduct,
  cleanLabel,
  type SafeDetails,
  type SafeProduct,
} from './sanitize.js';

// ---------------------------------------------------------------------------
// Agent-facing API: the ONLY surface the gateway (and therefore the model)
// can reach. It has no approve method and never returns vault contents.
// ---------------------------------------------------------------------------

export class AgentError extends Error {
  constructor(
    readonly code:
      | 'invalid_argument'
      | 'product_not_found'
      | 'unknown_package'
      | 'unsupported_product'
      | 'out_of_stock'
      | 'order_not_found'
      | 'upstream_unavailable'
      | 'blocked',
    message: string,
  ) {
    super(message);
  }
}

export interface AgentOrderView {
  order: string;
  status: OrderStatus;
  product_id: string;
  product_name: string;
  package_value: string;
  amount: string;
  currency: string;
  requires_human_approval: boolean;
  deny_reasons?: string[];
  message: string;
}

export interface AgentApi {
  searchProducts(args: {
    query?: string;
    intent: string;
    country?: string;
    category?: string;
  }): Promise<{ products: SafeProduct[]; found: number }>;
  getProductDetails(args: { product_id: string }): Promise<SafeDetails>;
  proposeOrder(args: {
    product_id: string;
    package_value: string;
    intent?: string;
  }): Promise<AgentOrderView>;
  getOrderStatus(args: { order: string }): Promise<AgentOrderView>;
}

// ---------------------------------------------------------------------------
// Operator-facing API: human approval console only. Never wired to MCP.
// ---------------------------------------------------------------------------

export interface RevealedSecrets {
  invoiceId: string;
  items: { label: string; value: string }[];
}

export interface OperatorApi {
  listOrders(): Order[];
  getOrder(handle: string): Order | undefined;
  approve(handle: string, operator: string): Promise<Order>;
  reject(handle: string, operator: string): Order;
  advance(handle: string): Promise<Order>;
  advanceAll(): Promise<void>;
  reveal(handle: string, operator: string): RevealedSecrets | undefined;
  events(): OrderEvent[];
  spentTodayCents(): number;
  policy(): PolicyConfig;
}

export interface CourierOptions {
  client: BitrefillClient;
  orders: OrderStore;
  vault: HandleStore;
  policy: PolicyConfig;
  payment: { method: string; balanceCurrency?: string };
  /** Refuse to pay `-syldavia` test products from balance (Bitrefill rule). */
  live: boolean;
  invoicePollIntervalMs?: number;
  now?: () => number;
  onEvent?: (e: { level: 'info' | 'warn'; msg: string; order?: string }) => void;
}

interface VaultPayload {
  buy: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
}

const MESSAGES: Record<OrderStatus, string> = {
  denied: 'Denied by purchase policy. Nothing was bought.',
  pending_approval:
    'Waiting for the human to approve in the Courier console. The assistant cannot approve orders.',
  rejected: 'The human rejected this order. Nothing was bought.',
  approved: 'Approved. Purchase is starting.',
  purchasing: 'Purchase in progress.',
  awaiting_payment: 'Invoice created; waiting for payment to settle.',
  paid: 'Paid; waiting for the merchant to deliver.',
  delivered:
    "Delivered to the buyer's Courier vault. Codes, links and invoice credentials are never shown to the assistant; the human reads them in the Courier console.",
  failed: 'The purchase failed. Nothing further will happen for this order.',
};

const SENSITIVE_KEY =
  /token|secret|code|pin|link|url|redemption|install|password|key|voucher|serial|activation|qr|invoice_id|address|lpa|iccid/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** Collect every string that must never reach the model from a vault payload. */
export function secretValuesOf(payload: unknown, publicValues: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (publicValues.has(s)) return;
      const sensitive = SENSITIVE_KEY.test(key) && s.length >= 4;
      const opaque = s.length >= 8 && !/^[a-z _.,:;'"()-]+$/i.test(s) && /\d/.test(s);
      if (sensitive || opaque) out.add(s);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, key));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(payload, '');
  return out;
}

const INVOICE_DONE = new Set(['complete', 'completed', 'delivered', 'all_delivered', 'success']);
const INVOICE_PAID = new Set([
  'paid',
  'payment_confirmed',
  'payment_received',
  'payment_detected',
  'processing',
  'confirmed',
]);
const INVOICE_FAILED = new Set([
  'expired',
  'failed',
  'refunded',
  'cancelled',
  'canceled',
  'payment_error',
  'denied',
  'error',
]);

export function classifyInvoice(
  raw: Record<string, unknown>,
): 'delivered' | 'paid' | 'failed' | 'pending' {
  const inv = (raw.invoice as Record<string, unknown> | undefined) ?? raw;
  const status = String(inv.status ?? '').toLowerCase();
  if (INVOICE_DONE.has(status)) return 'delivered';
  if (INVOICE_FAILED.has(status)) return 'failed';
  if (INVOICE_PAID.has(status)) return 'paid';
  return 'pending';
}

/**
 * The exact projection of an order the model receives. Exported so the
 * console can show the human precisely what the assistant saw.
 */
export function toAgentView(o: Order): AgentOrderView {
  const v: AgentOrderView = {
    order: o.handle,
    status: o.status,
    product_id: o.productId,
    product_name: o.productName,
    package_value: o.packageValue,
    amount: centsToDisplay(o.amountCents),
    currency: o.currency,
    requires_human_approval: o.status === 'pending_approval',
    message: MESSAGES[o.status],
  };
  if (o.denyReasons.length > 0) v.deny_reasons = o.denyReasons;
  return v;
}

function startOfUtcDay(ms: number): number {
  return ms - (ms % 86_400_000);
}

export class Courier {
  readonly #o: Required<Omit<CourierOptions, 'onEvent'>> & Pick<CourierOptions, 'onEvent'>;

  constructor(opts: CourierOptions) {
    this.#o = { invoicePollIntervalMs: 10_000, now: Date.now, ...opts };
  }

  #emit(level: 'info' | 'warn', msg: string, order?: string): void {
    this.#o.onEvent?.({ level, msg, ...(order ? { order } : {}) });
  }

  // ----- leak guard (defence in depth; outputs are already allowlisted) -----

  #guard<T>(result: T): T {
    const text = JSON.stringify(result);
    if (UUID_RE.test(text)) {
      this.#emit('warn', 'leak guard: uuid-shaped value blocked');
      throw new AgentError('blocked', 'Result withheld by Courier leak guard.');
    }
    for (const o of this.#o.orders.list(500)) {
      if (!o.vaultHandle) continue;
      const payload = this.#o.vault.get<VaultPayload>(o.vaultHandle);
      if (!payload) continue;
      const pub = new Set([
        o.productId,
        o.productName,
        o.packageValue,
        o.currency,
        o.country,
        o.handle,
      ]);
      for (const secret of secretValuesOf(payload, pub)) {
        if (text.includes(secret)) {
          this.#o.orders.log(o.handle, 'gateway', 'leak_blocked', '');
          this.#emit('warn', 'leak guard: vault value blocked', o.handle);
          throw new AgentError('blocked', 'Result withheld by Courier leak guard.');
        }
      }
    }
    return result;
  }

  #view(o: Order): AgentOrderView {
    return toAgentView(o);
  }

  async #upstream<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UpstreamError && e.code === 'not_found') {
        throw new AgentError('product_not_found', 'No such product.');
      }
      this.#emit(
        'warn',
        `upstream: ${e instanceof UpstreamError ? e.detail : (e as Error).message}`,
      );
      throw new AgentError(
        'upstream_unavailable',
        'The merchant could not be reached. Try again shortly.',
      );
    }
  }

  // ----- agent API -----

  agent(): AgentApi {
    // A plain object with exactly four functions: no prototype, no way to reach approve().
    return Object.freeze({
      searchProducts: async (args) => {
        const intent = cleanLabel(args.intent, 200);
        if (!intent) throw new AgentError('invalid_argument', 'intent is required.');
        const req: { query?: string; intent: string; country?: string; category?: string } = {
          intent,
        };
        if (args.query) req.query = cleanLabel(args.query, 80);
        if (args.country) req.country = args.country.toUpperCase().slice(0, 2);
        if (args.category) req.category = args.category;
        const res = await this.#upstream(() =>
          this.#o.client.searchProducts({ ...req, per_page: 20 }),
        );
        const products = res.products.map(toSafeProduct).filter((p): p is SafeProduct => !!p);
        return this.#guard({ products, found: res.found ?? products.length });
      },

      getProductDetails: async ({ product_id }) => {
        if (!isSafeSlug(product_id))
          throw new AgentError('invalid_argument', 'Invalid product_id.');
        const d = await this.#upstream(() =>
          this.#o.client.getProductDetails({ product_id, currency: 'USD' }),
        );
        const safe = toSafeDetails(d);
        if (!safe) throw new AgentError('product_not_found', 'No such product.');
        return this.#guard(safe);
      },

      proposeOrder: async ({ product_id, package_value, intent }) => {
        if (!isSafeSlug(product_id))
          throw new AgentError('invalid_argument', 'Invalid product_id.');
        if (!isSafePackageValue(package_value)) {
          throw new AgentError('invalid_argument', 'Invalid package_value.');
        }
        // Price and product facts come from Bitrefill at order time, never from the model.
        const d = await this.#upstream(() =>
          this.#o.client.getProductDetails({ product_id, currency: 'USD' }),
        );
        if (d.in_stock === false) throw new AgentError('out_of_stock', 'Product is out of stock.');
        if (!isSupportedProduct(d)) {
          throw new AgentError(
            'unsupported_product',
            'Courier does not support products that need recipient details or prepayment steps.',
          );
        }
        const pkg = toSafePackages(d).find((p) => p.package_value === package_value);
        if (!pkg) {
          throw new AgentError(
            'unknown_package',
            'Unknown package_value; call get_product_details.',
          );
        }
        const productType = productTypeOf(d.categories);
        const country = (d.country_code ?? 'XX').toUpperCase();
        const decision = evaluatePolicy(
          this.#o.policy,
          { productType, country, amountCents: pkg.cents },
          this.#o.orders.committedSince(startOfUtcDay(this.#o.now())),
        );
        const status: OrderStatus =
          decision.decision === 'deny'
            ? 'denied'
            : decision.decision === 'needs_approval'
              ? 'pending_approval'
              : 'approved';
        const order = this.#o.orders.insert(
          {
            handle: newHandle('ord'),
            status,
            productId: product_id,
            productName: cleanLabel(d.name, 80),
            productType,
            country,
            packageValue: package_value,
            amountCents: pkg.cents,
            currency: pkg.price_currency,
            intent: cleanLabel(intent ?? '', 200),
            denyReasons: decision.decision === 'deny' ? decision.reasons : [],
          },
          'agent',
        );
        if (status === 'approved') {
          this.#o.orders.log(order.handle, 'policy', 'auto_approved', 'below approval threshold');
          await this.advance(order.handle);
        }
        return this.#guard(this.#view(this.#o.orders.get(order.handle) as Order));
      },

      getOrderStatus: async ({ order }) => {
        if (!isHandle(order, 'ord'))
          throw new AgentError('invalid_argument', 'Invalid order handle.');
        if (!this.#o.orders.get(order)) throw new AgentError('order_not_found', 'No such order.');
        const o = await this.advance(order);
        return this.#guard(this.#view(o));
      },
    } satisfies AgentApi);
  }

  // ----- order execution (shared by both surfaces; idempotent) -----

  async advance(handle: string): Promise<Order> {
    let o = this.#o.orders.get(handle);
    if (!o) throw new AgentError('order_not_found', 'No such order.');
    if (o.status === 'approved') {
      await this.#purchase(o);
      o = this.#o.orders.get(handle) as Order;
    }
    if (
      (o.status === 'awaiting_payment' || o.status === 'paid') &&
      this.#o.now() - o.lastPolledAt >= this.#o.invoicePollIntervalMs
    ) {
      await this.#poll(o);
      o = this.#o.orders.get(handle) as Order;
    }
    return o;
  }

  async #purchase(o: Order): Promise<void> {
    if (!this.#o.orders.transition(o.handle, ['approved'], 'purchasing', 'courier')) return;
    if (this.#o.live && this.#o.payment.method === 'balance' && o.productId.endsWith('-syldavia')) {
      this.#o.orders.transition(o.handle, ['purchasing'], 'failed', 'courier', {
        failure: 'refused: test products must not be paid from balance',
      });
      return;
    }
    try {
      const buy = await this.#o.client.buyProducts({
        cart_items: [{ product_id: o.productId, package_value: o.packageValue }],
        payment_method: this.#o.payment.method,
        ...(this.#o.payment.balanceCurrency
          ? { balance_currency: this.#o.payment.balanceCurrency }
          : {}),
      });
      const vaultHandle = this.#o.vault.put('sec', {
        buy: buy.raw,
        invoice: null,
      } satisfies VaultPayload);
      this.#o.orders.transition(o.handle, ['purchasing'], 'awaiting_payment', 'courier', {
        vaultHandle,
      });
      this.#emit('info', 'invoice created', o.handle);
    } catch (e) {
      const detail = e instanceof UpstreamError ? e.code : 'error';
      this.#emit(
        'warn',
        `buy failed: ${e instanceof UpstreamError ? e.detail : (e as Error).message}`,
        o.handle,
      );
      this.#o.orders.transition(o.handle, ['purchasing'], 'failed', 'courier', {
        failure: `buy ${detail}`,
      });
    }
  }

  async #poll(o: Order): Promise<void> {
    const payload = o.vaultHandle ? this.#o.vault.get<VaultPayload>(o.vaultHandle) : undefined;
    if (!payload || !o.vaultHandle) {
      this.#o.orders.transition(o.handle, ['awaiting_payment', 'paid'], 'failed', 'courier', {
        failure: 'vault entry missing or expired',
      });
      return;
    }
    this.#o.orders.touchPolled(o.handle);
    const token = payload.buy.invoice_access_token;
    try {
      const inv = await this.#o.client.getInvoice({
        invoice_id: String(payload.buy.invoice_id),
        ...(typeof token === 'string' ? { invoice_access_token: token } : {}),
      });
      this.#o.vault.put(
        'sec',
        { ...payload, invoice: inv.raw } satisfies VaultPayload,
        o.vaultHandle,
      );
      const state = classifyInvoice(inv.raw);
      if (state === 'delivered') {
        this.#o.orders.transition(o.handle, ['awaiting_payment', 'paid'], 'delivered', 'courier');
      } else if (state === 'paid') {
        this.#o.orders.transition(o.handle, ['awaiting_payment'], 'paid', 'courier');
      } else if (state === 'failed') {
        this.#o.orders.transition(o.handle, ['awaiting_payment', 'paid'], 'failed', 'courier', {
          failure: 'invoice failed or expired',
        });
      }
    } catch (e) {
      this.#emit(
        'warn',
        `poll failed: ${e instanceof UpstreamError ? e.detail : (e as Error).message}`,
        o.handle,
      );
    }
  }

  // ----- operator API -----

  operator(): OperatorApi {
    return {
      listOrders: () => this.#o.orders.list(),
      getOrder: (h) => this.#o.orders.get(h),
      approve: async (h, operator) => {
        if (
          !this.#o.orders.transition(h, ['pending_approval'], 'approved', `human:${operator}`, {
            decidedBy: operator,
          })
        ) {
          throw new Error('order is not pending approval');
        }
        return this.advance(h);
      },
      reject: (h, operator) => {
        if (
          !this.#o.orders.transition(h, ['pending_approval'], 'rejected', `human:${operator}`, {
            decidedBy: operator,
          })
        ) {
          throw new Error('order is not pending approval');
        }
        return this.#o.orders.get(h) as Order;
      },
      advance: (h) => this.advance(h),
      advanceAll: async () => {
        for (const o of this.#o.orders.list(100)) {
          if (['approved', 'awaiting_payment', 'paid'].includes(o.status))
            await this.advance(o.handle);
        }
      },
      reveal: (h, operator) => {
        const o = this.#o.orders.get(h);
        if (!o?.vaultHandle) return undefined;
        const payload = this.#o.vault.get<VaultPayload>(o.vaultHandle);
        if (!payload) return undefined;
        this.#o.orders.log(h, `human:${operator}`, 'vault_viewed', '');
        return revealSecrets(payload);
      },
      events: () => this.#o.orders.events(),
      spentTodayCents: () => this.#o.orders.committedSince(startOfUtcDay(this.#o.now())),
      policy: () => this.#o.policy,
    };
  }
}

/** Pull human-useful secrets (codes, PINs, install links) out of the raw vault payload. */
export function revealSecrets(payload: VaultPayload): RevealedSecrets {
  const items: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown, path: string, key: string): void => {
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v);
      if (SENSITIVE_KEY.test(key) && s.length >= 4 && !seen.has(s)) {
        seen.add(s);
        items.push({ label: path, value: s });
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, k);
    }
  };
  if (payload.invoice) walk(payload.invoice, 'invoice', '');
  walk(payload.buy, 'purchase', '');
  return { invoiceId: String(payload.buy.invoice_id), items };
}
