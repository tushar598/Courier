import { randomBytes, randomUUID } from 'node:crypto';
import { encode as encodeToon } from '@toon-format/toon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CATALOG, type MockProduct } from './catalog.js';

export interface MockSecrets {
  invoiceAccessToken: string;
  code: string;
  pin: string;
  esimActivation: string;
}

export interface MockOptions {
  /** Override secret generation (used by the no-leak property test). */
  secrets?: () => MockSecrets;
  /** Polls before a `slow` product delivers. */
  slowPolls?: number;
}

interface MockInvoice {
  id: string;
  accessToken: string;
  product: MockProduct;
  packageValue: string;
  paymentMethod: string;
  polls: number;
  secrets: MockSecrets;
  createdAt: string;
}

const hex = (n: number) => randomBytes(n).toString('hex');
const group = () => randomBytes(3).toString('hex').toUpperCase().slice(0, 4);

export function defaultSecrets(): MockSecrets {
  return {
    invoiceAccessToken: hex(24),
    code: `DELO-${group()}-${group()}-${group()}`,
    pin: String(100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)),
    esimActivation: hex(16).toUpperCase(),
  };
}

/** Shared state so a stateless HTTP server (one McpServer per request) keeps invoices. */
export class MockState {
  readonly invoices = new Map<string, MockInvoice>();
  constructor(readonly opts: MockOptions = {}) {}
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const toon = (v: unknown) => text(encodeToon(v as never));
const notFound = (what: string) => ({
  ...toon({
    error: `${what} was not found.`,
    code: 'not_found',
    details: { suggestions: [], status: 'product_not_found' },
  }),
  isError: true,
});

function invoiceView(inv: MockInvoice, slowPolls: number) {
  const { behaviour } = inv.product;
  const delivered =
    behaviour === 'instant'
      ? inv.polls >= 1
      : behaviour === 'slow'
        ? inv.polls >= slowPolls
        : false;
  const failed = behaviour === 'fail' && inv.polls >= 1;
  const status = failed
    ? 'failed'
    : delivered
      ? 'complete'
      : inv.paymentMethod === 'balance'
        ? 'paid'
        : 'unpaid';
  const order: Record<string, unknown> = {
    product_id: inv.product.slug,
    package_value: inv.packageValue,
    status: delivered ? 'delivered' : failed ? 'failed' : 'pending',
  };
  if (delivered) {
    if (inv.product.type === 'esims') {
      order.esim_install_link = `LPA:1$smdp.mock-bitrefill.test$${inv.secrets.esimActivation}`;
      order.redemption_info = { activation_code: inv.secrets.esimActivation };
    } else {
      order.redemption_info = { code: inv.secrets.code, pin: inv.secrets.pin };
    }
  }
  return {
    id: inv.id,
    status,
    created_at: inv.createdAt,
    payment_method: inv.paymentMethod,
    orders: [order],
  };
}

export function createMockBitrefillServer(state: MockState = new MockState()): McpServer {
  const server = new McpServer({
    name: 'Mock Bitrefill MCP (Courier test double)',
    version: '1.0.0',
  });
  const slowPolls = state.opts.slowPolls ?? 3;
  const secrets = state.opts.secrets ?? defaultSecrets;

  server.registerTool(
    'search-products',
    {
      description: 'Search gift cards, eSIMs and refills (mock).',
      inputSchema: {
        query: z.string().optional(),
        intent: z.string().min(1),
        country: z.string().optional(),
        category: z.string().optional(),
        per_page: z.number().optional(),
      },
    },
    async ({ query, country, category }) => {
      const q = (query ?? '*').toLowerCase();
      const products = CATALOG.filter(
        (p) =>
          (!country || p.country_code === country.toUpperCase()) &&
          (!category || p.categories.includes(category)) &&
          (q === '*' || p.name.toLowerCase().includes(q) || p.slug.includes(q)),
      ).map((p) => ({
        _id: p.slug,
        categories: p.categories,
        countries: [p.country_code],
        currency: 'USD',
        in_stock: true,
        keywords: [],
        name: p.name,
        slug: p.slug,
        type: p.type,
        product_url: `https://mock-bitrefill.test/${p.slug}/`,
        description: p.descriptions,
      }));
      return toon({ categories: [], products, found: products.length, page: 1, per_page: 25 });
    },
  );

  server.registerTool(
    'get-product-details',
    {
      description: 'Product details including packages (mock).',
      inputSchema: {
        product_id: z.string(),
        language: z.string().optional(),
        currency: z.string().optional(),
      },
    },
    async ({ product_id }) => {
      const p = CATALOG.find((x) => x.slug === product_id);
      if (!p) return notFound(`Product '${product_id}'`);
      return toon({
        id: p.slug,
        name: p.name,
        country_code: p.country_code,
        currency: 'USD',
        categories: p.categories,
        recipient_type: p.recipient_type,
        in_stock: true,
        packages: p.packages.map((k) => ({
          package_value: k.package_value,
          package_currency: 'USD',
          payment_price: k.payment_price,
          payment_currency: 'USD',
        })),
        url: `https://mock-bitrefill.test/${p.slug}/`,
        descriptions: p.descriptions,
        instructions: p.instructions,
      });
    },
  );

  server.registerTool(
    'buy-products',
    {
      description: 'Create an invoice (mock). Returns bearer secrets like the real API.',
      inputSchema: {
        cart_items: z
          .array(z.object({ product_id: z.string(), package_value: z.string() }).loose())
          .min(1),
        payment_method: z.string(),
        balance_currency: z.string().optional(),
      },
    },
    async ({ cart_items, payment_method }) => {
      const item = cart_items[0];
      const p = CATALOG.find((x) => x.slug === item?.product_id);
      if (!item || !p) return notFound(`Product '${item?.product_id ?? ''}'`);
      if (!p.packages.some((k) => k.package_value === item.package_value))
        return notFound('Package');
      const s = secrets();
      const inv: MockInvoice = {
        id: randomUUID(),
        accessToken: s.invoiceAccessToken,
        product: p,
        packageValue: item.package_value,
        paymentMethod: payment_method,
        polls: 0,
        secrets: s,
        createdAt: new Date().toISOString(),
      };
      state.invoices.set(inv.id, inv);
      const link = `https://mock-bitrefill.test/invoice/${inv.id}?token=${inv.accessToken}`;
      return text(
        JSON.stringify({
          invoice_id: inv.id,
          invoice_access_token: inv.accessToken,
          payment_info: {
            method: payment_method,
            status: payment_method === 'balance' ? 'paid' : 'unpaid',
          },
          payment_link: link,
          x402_payment_url: `https://mock-bitrefill.test/x402/${inv.id}`,
          agent_instructions:
            'Poll get-invoice-by-id every 10-30 seconds until status is complete.',
        }),
      );
    },
  );

  server.registerTool(
    'get-invoice-by-id',
    {
      description: 'Invoice with orders and codes (mock).',
      inputSchema: { invoice_id: z.string(), invoice_access_token: z.string().optional() },
    },
    async ({ invoice_id }) => {
      const inv = state.invoices.get(invoice_id);
      if (!inv) return notFound(`Invoice '${invoice_id}'`);
      inv.polls++;
      return toon(invoiceView(inv, slowPolls));
    },
  );

  server.registerTool(
    'list-invoices',
    { description: "The user's invoices (mock).", inputSchema: { limit: z.number().optional() } },
    async () =>
      toon({
        invoices: [...state.invoices.values()].map((i) => ({
          id: i.id,
          product: i.product.slug,
          created_at: i.createdAt,
        })),
      }),
  );

  return server;
}
