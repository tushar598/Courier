import { z } from 'zod';

/**
 * Upstream (Bitrefill MCP) shapes. Parsed leniently: Bitrefill adds fields
 * over time, and we only ever read the handful listed here. Everything else
 * stays inside the encrypted vault or is dropped.
 */
export const UpstreamProductSchema = z.looseObject({
  slug: z.string(),
  name: z.string(),
  type: z.string().optional(),
  currency: z.string().optional(),
  in_stock: z.boolean().optional(),
  categories: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
});
export type UpstreamProduct = z.infer<typeof UpstreamProductSchema>;

export const UpstreamSearchSchema = z.looseObject({
  products: z.array(UpstreamProductSchema).default([]),
  found: z.number().optional(),
});
export type UpstreamSearch = z.infer<typeof UpstreamSearchSchema>;

export const UpstreamPackageSchema = z.looseObject({
  package_value: z.union([z.string(), z.number()]).transform(String),
  payment_price: z.union([z.string(), z.number()]).transform(String).optional(),
  payment_currency: z.string().optional(),
  package_currency: z.string().optional(),
});
export type UpstreamPackage = z.infer<typeof UpstreamPackageSchema>;

export const UpstreamDetailsSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  country_code: z.string().optional(),
  currency: z.string().optional(),
  categories: z.array(z.string()).optional(),
  recipient_type: z.string().optional(),
  in_stock: z.boolean().optional(),
  packages: z.array(UpstreamPackageSchema).default([]),
  prepayment: z.unknown().optional(),
});
export type UpstreamDetails = z.infer<typeof UpstreamDetailsSchema>;

/** buy-products returns bearer secrets; we only require invoice_id. */
export const UpstreamBuySchema = z.looseObject({
  invoice_id: z.string().min(1),
});

/** Invoice shape is not documented; the whole object is treated as secret. */
export const UpstreamInvoiceSchema = z.looseObject({});

export interface SearchArgs {
  query?: string;
  intent: string;
  country?: string;
  category?: string;
  per_page?: number;
}

export interface BuyArgs {
  cart_items: { product_id: string; package_value: string }[];
  payment_method: string;
  balance_currency?: string;
}

/** The raw upstream objects that carry secrets. Never leave core unredacted. */
export interface BuyResult {
  invoiceId: string;
  raw: Record<string, unknown>;
}

export interface InvoiceResult {
  raw: Record<string, unknown>;
}

export interface BitrefillClient {
  searchProducts(args: SearchArgs): Promise<UpstreamSearch>;
  getProductDetails(args: { product_id: string; currency?: string }): Promise<UpstreamDetails>;
  buyProducts(args: BuyArgs): Promise<BuyResult>;
  getInvoice(args: { invoice_id: string; invoice_access_token?: string }): Promise<InvoiceResult>;
}

export class UpstreamError extends Error {
  constructor(
    readonly code: 'not_found' | 'upstream_error' | 'bad_response' | 'rate_limited',
    /** Internal detail for logs only. Never returned to the model. */
    readonly detail: string,
  ) {
    super(`bitrefill: ${code}`);
  }
}
