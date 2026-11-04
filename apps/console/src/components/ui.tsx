import type { OrderStatus } from '@courier/core';

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending_approval: 'bg-amber-100 text-amber-900 ring-amber-300',
  approved: 'bg-sky-100 text-sky-900 ring-sky-300',
  purchasing: 'bg-sky-100 text-sky-900 ring-sky-300',
  awaiting_payment: 'bg-indigo-100 text-indigo-900 ring-indigo-300',
  paid: 'bg-violet-100 text-violet-900 ring-violet-300',
  delivered: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  denied: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  rejected: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  failed: 'bg-rose-100 text-rose-900 ring-rose-300',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  purchasing: 'Purchasing',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  delivered: 'Delivered',
  denied: 'Denied by policy',
  rejected: 'Rejected',
  failed: 'Failed',
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const time = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  });

export function Handle({ value }: { value: string }) {
  return (
    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
      {value}
    </code>
  );
}
