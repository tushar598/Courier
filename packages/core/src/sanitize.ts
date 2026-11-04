import type { UpstreamDetails, UpstreamProduct } from './bitrefill/types.js';

/**
 * Everything Bitrefill returns as free text (names, descriptions, instructions)
 * is untrusted data: product listings are third-party content and a natural
 * prompt-injection vector. The model gets an allowlisted, typed projection;
 * long-form text is dropped entirely, short labels are normalised.
 */

// C0/C1 controls, zero-width, bidi overrides, BOM.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const TAG_RE = /<[^>]*>/g;

export function cleanLabel(value: unknown, max: number): string {
  const s = String(value ?? '')
    .replace(TAG_RE, ' ')
    .replace(INVISIBLE, ' ')
    .replace(URL_RE, '[link removed]')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const CATEGORY_RE = /^[a-z0-9-]{1,40}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const PACKAGE_RE = /^[\w .,+\-/()%]{1,40}$/;
const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;

export const isSafeSlug = (s: string): boolean => SLUG_RE.test(s);
export const isSafePackageValue = (s: string): boolean => PACKAGE_RE.test(s);

/** "3.89" → 389. Undefined if not a plain decimal. */
export function priceToCents(price: string | undefined): number | undefined {
  if (!price || !PRICE_RE.test(price)) return undefined;
  const [whole = '0', frac = ''] = price.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type ProductType = 'giftcards' | 'esims' | 'refills';

/** get-product-details has no `type`; derive it from categories. */
export function productTypeOf(
  categories: readonly string[] | undefined,
  fallback?: string,
): ProductType {
  if (fallback === 'esims' || fallback === 'refills' || fallback === 'giftcards') return fallback;
  const cats = categories ?? [];
  if (cats.includes('esim')) return 'esims';
  if (cats.includes('refill') || cats.includes('data') || cats.includes('voip')) return 'refills';
  return 'giftcards';
}

export interface SafeProduct {
  product_id: string;
  name: string;
  product_type: ProductType;
  currency?: string;
  in_stock?: boolean;
  categories: string[];
}

export function toSafeProduct(p: UpstreamProduct): SafeProduct | undefined {
  if (!isSafeSlug(p.slug)) return undefined;
  const out: SafeProduct = {
    product_id: p.slug,
    name: cleanLabel(p.name, 80),
    product_type: productTypeOf(p.categories, p.type),
    categories: (p.categories ?? []).filter((c) => CATEGORY_RE.test(c)).slice(0, 5),
  };
  if (p.currency && CURRENCY_RE.test(p.currency)) out.currency = p.currency;
  if (typeof p.in_stock === 'boolean') out.in_stock = p.in_stock;
  return out;
}

export interface SafePackage {
  package_value: string;
  price: string;
  price_currency: string;
}

export interface SafeDetails {
  product_id: string;
  name: string;
  product_type: ProductType;
  country?: string;
  in_stock?: boolean;
  supported_by_courier: boolean;
  packages: SafePackage[];
  note: string;
}

/** Recipient types Courier can buy without collecting personal data. */
const SUPPORTED_RECIPIENT = new Set(['none', 'mixed', '']);

export function isSupportedProduct(d: UpstreamDetails): boolean {
  return SUPPORTED_RECIPIENT.has(d.recipient_type ?? '') && d.prepayment === undefined;
}

export function toSafePackages(d: UpstreamDetails): (SafePackage & { cents: number })[] {
  const out: (SafePackage & { cents: number })[] = [];
  for (const p of d.packages) {
    const cents = priceToCents(p.payment_price);
    const cur = p.payment_currency ?? d.currency ?? '';
    if (!isSafePackageValue(p.package_value) || cents === undefined || !CURRENCY_RE.test(cur))
      continue;
    out.push({
      package_value: p.package_value,
      price: centsToDisplay(cents),
      price_currency: cur,
      cents,
    });
  }
  return out;
}

export function toSafeDetails(d: UpstreamDetails): SafeDetails | undefined {
  if (!isSafeSlug(d.id)) return undefined;
  const out: SafeDetails = {
    product_id: d.id,
    name: cleanLabel(d.name, 80),
    product_type: productTypeOf(d.categories),
    supported_by_courier: isSupportedProduct(d),
    packages: toSafePackages(d)
      .slice(0, 30)
      .map(({ package_value, price, price_currency }) => ({
        package_value,
        price,
        price_currency,
      })),
    note: 'Descriptions and instructions are omitted: upstream free text is untrusted. Prices are fetched again at order time.',
  };
  if (d.country_code && COUNTRY_RE.test(d.country_code)) out.country = d.country_code;
  if (typeof d.in_stock === 'boolean') out.in_stock = d.in_stock;
  return out;
}
