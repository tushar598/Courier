import { decode as decodeToon } from '@toon-format/toon';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ZodType } from 'zod';
import {
  UpstreamBuySchema,
  UpstreamDetailsSchema,
  UpstreamError,
  UpstreamInvoiceSchema,
  UpstreamSearchSchema,
  type BitrefillClient,
  type BuyArgs,
  type BuyResult,
  type InvoiceResult,
  type SearchArgs,
  type UpstreamDetails,
  type UpstreamSearch,
} from './types.js';

/** Bitrefill read tools answer in TOON, buy-products in JSON. Accept both. */
export function decodeToolText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to TOON
    }
  }
  return decodeToon(text);
}

/** Serialises calls and spaces them out. Bitrefill allows 60 per 30 s; we stay well under. */
class Throttle {
  #last = 0;
  #chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly minIntervalMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#chain.then(async () => {
      const wait = this.#last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.#last = Date.now();
      return fn();
    });
    this.#chain = next.catch(() => undefined);
    return next;
  }
}

export class McpBitrefillClient implements BitrefillClient {
  readonly #client: Client;
  readonly #throttle: Throttle;

  private constructor(client: Client, minIntervalMs: number) {
    this.#client = client;
    this.#throttle = new Throttle(minIntervalMs);
  }

  /** Real Bitrefill: Bearer auth (the documented /mcp/<key> URL now returns 410). */
  static async connectHttp(url: string, apiKey: string): Promise<McpBitrefillClient> {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    return McpBitrefillClient.connect(transport, 600);
  }

  static async connect(transport: Transport, minIntervalMs = 0): Promise<McpBitrefillClient> {
    const client = new Client({ name: 'courier-gateway', version: '0.1.0' });
    await client.connect(transport);
    return new McpBitrefillClient(client, minIntervalMs);
  }

  async close(): Promise<void> {
    await this.#client.close();
  }

  async #call<T>(name: string, args: Record<string, unknown>, schema: ZodType<T>): Promise<T> {
    const result = await this.#throttle.run(() => this.#client.callTool({ name, arguments: args }));
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .filter((c): c is { type: 'text'; text: string } => c?.type === 'text')
      .map((c) => c.text)
      .join('\n');
    let decoded: unknown;
    try {
      decoded = decodeToolText(text);
    } catch (e) {
      throw new UpstreamError('bad_response', `${name}: undecodable (${(e as Error).message})`);
    }
    if (result.isError) {
      const status = (decoded as { details?: { status?: string } })?.details?.status ?? '';
      throw new UpstreamError(
        /not_found/.test(status) ? 'not_found' : 'upstream_error',
        `${name}: ${status || 'isError'}`,
      );
    }
    const parsed = schema.safeParse(decoded);
    if (!parsed.success) {
      throw new UpstreamError('bad_response', `${name}: ${parsed.error.issues[0]?.message ?? ''}`);
    }
    return parsed.data;
  }

  searchProducts(args: SearchArgs): Promise<UpstreamSearch> {
    return this.#call('search-products', { ...args }, UpstreamSearchSchema);
  }

  getProductDetails(args: { product_id: string; currency?: string }): Promise<UpstreamDetails> {
    return this.#call('get-product-details', { ...args }, UpstreamDetailsSchema);
  }

  async buyProducts(args: BuyArgs): Promise<BuyResult> {
    const raw = await this.#call('buy-products', { ...args }, UpstreamBuySchema);
    return { invoiceId: raw.invoice_id, raw };
  }

  async getInvoice(args: {
    invoice_id: string;
    invoice_access_token?: string;
  }): Promise<InvoiceResult> {
    const raw = await this.#call('get-invoice-by-id', { ...args }, UpstreamInvoiceSchema);
    return { raw };
  }
}
