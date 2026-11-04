import type { OrderStatus } from '@courier/core';

type Tone = 'pending' | 'info' | 'ok' | 'bad' | 'neutral';

const TONE: Record<Tone, string> = {
  pending: 'bg-pending-tint text-pending',
  info: 'bg-info-tint text-info',
  ok: 'bg-ok-tint text-ok',
  bad: 'bg-bad-tint text-bad',
  neutral: 'bg-sunken text-muted',
};

const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending_approval: { label: 'Needs your approval', tone: 'pending' },
  approved: { label: 'Approved', tone: 'info' },
  purchasing: { label: 'Buying', tone: 'info' },
  awaiting_payment: { label: 'Awaiting payment', tone: 'info' },
  paid: { label: 'Paid, awaiting delivery', tone: 'info' },
  delivered: { label: 'Delivered to vault', tone: 'ok' },
  denied: { label: 'Blocked by policy', tone: 'neutral' },
  rejected: { label: 'Rejected by you', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${TONE[s.tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </span>
  );
}

export const DENY_REASON: Record<string, string> = {
  product_type_not_allowed: 'product type not allowed',
  country_not_allowed: 'country not allowed',
  invalid_amount: 'invalid amount',
  per_order_cap_exceeded: 'over the per-order limit',
  daily_cap_exceeded: 'over the daily limit',
};

/** Gift card packages are bare denominations ("10"); say what they are. */
export function packageLabel(value: string, currency = 'USD'): string {
  return /^\d+(\.\d+)?$/.test(value) ? `${currency === 'USD' ? '$' : ''}${value} card` : value;
}

export const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export const when = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });

export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** An opaque handle: the only thing the assistant ever holds. */
export function Handle({ value }: { value: string }) {
  return (
    <code className="whitespace-nowrap rounded bg-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-muted">
      {value}
    </code>
  );
}

export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[17px] font-semibold tracking-tight">{children}</h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

/** Human-readable actor names for the custody log. */
export function actorLabel(actor: string): string {
  if (actor === 'agent') return 'Assistant';
  if (actor === 'policy') return 'Policy';
  if (actor === 'courier') return 'Courier';
  if (actor === 'gateway') return 'Leak guard';
  if (actor.startsWith('human:')) return 'You';
  return actor;
}

const EVENT: Record<string, string> = {
  proposed: 'proposed an order',
  auto_approved: 'approved it (under your threshold)',
  approved: 'approved',
  rejected: 'rejected',
  purchasing: 'started the purchase',
  awaiting_payment: 'created the invoice',
  paid: 'saw payment settle',
  delivered: 'sealed the goods in your vault',
  failed: 'marked it failed',
  denied: 'blocked it',
  vault_viewed: 'opened the vault',
  leak_blocked: 'withheld a result containing a secret',
};

export function eventLabel(event: string, detail: string): string {
  if (event === 'proposed') {
    return detail === 'denied' ? 'proposed an order, blocked by policy' : 'proposed an order';
  }
  return EVENT[event] ?? event.replaceAll('_', ' ');
}
