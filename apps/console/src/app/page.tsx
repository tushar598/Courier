import Link from 'next/link';
import type { Order, OrderEvent, PolicyConfig } from '@courier/core';
import { AutoRefresh } from '@/components/auto-refresh';
import {
  DENY_REASON,
  Handle,
  SectionTitle,
  StatusBadge,
  actorLabel,
  clock,
  eventLabel,
  packageLabel,
  usd,
  when,
} from '@/components/ui';
import { approveOrder, logout, rejectOrder } from './actions';
import { consoleIsOpen, requireOperator } from '@/lib/auth';
import { runtime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

const TYPE_NAME: Record<string, string> = {
  giftcards: 'gift cards',
  esims: 'eSIMs',
  refills: 'top-ups',
};
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function ModeChip({ mode }: { mode: string }) {
  return mode === 'live' ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-bad-tint px-3 py-1 text-[13px] font-medium text-bad">
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      Live: real purchases on Bitrefill
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-sunken px-3 py-1 text-[13px] font-medium text-muted">
      <span className="h-2 w-2 rounded-full border border-current" aria-hidden />
      Demo: simulated Bitrefill, no real money
    </span>
  );
}

function PolicySummary({
  policy,
  spent,
  mode,
}: {
  policy: PolicyConfig;
  spent: number;
  mode: string;
}) {
  const pct = Math.min(100, (spent / policy.dailyCapCents) * 100);
  const near = pct >= 80;
  return (
    <section className="rounded-2xl border border-rule bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-[22px] leading-snug tracking-tight">
          Today your assistant has committed{' '}
          <span className="font-semibold tabular-nums">{usd(spent)}</span> of your{' '}
          <span className="font-semibold tabular-nums">{usd(policy.dailyCapCents)}</span> daily
          limit.
        </p>
        <ModeChip mode={mode} />
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={policy.dailyCapCents}
        aria-valuenow={spent}
        aria-label="Daily spend"
      >
        <div
          className={`h-full rounded-full ${near ? 'bg-pending' : 'bg-ink'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-4 max-w-3xl text-sm text-muted">
        Each order is limited to {usd(policy.perOrderCapCents)}. Anything over{' '}
        {usd(policy.approvalThresholdCents)} waits for you here. Your assistant may buy{' '}
        {list(policy.allowedProductTypes.map((t) => TYPE_NAME[t] ?? t))} for{' '}
        {list(policy.allowedCountries.map((c) => regionName.of(c) ?? c))}.
      </p>
    </section>
  );
}

function ApprovalTicket({ o }: { o: Order }) {
  return (
    <li className="relative overflow-hidden rounded-xl border border-rule bg-surface">
      <span className="absolute inset-y-0 left-0 w-1 bg-pending" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 py-4 pl-6 pr-5">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold">{o.productName}</div>
          <div className="text-sm text-muted">
            {packageLabel(o.packageValue, o.currency)} for {regionName.of(o.country) ?? o.country},
            proposed {when(o.createdAt)}
          </div>
          {o.intent && (
            <p className="mt-2 text-sm">
              <span className="text-muted">Your assistant&apos;s reason: </span>
              {o.intent}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tabular-nums tracking-tight">
            {usd(o.amountCents)}
          </div>
          <div className="text-xs text-muted">{o.currency}</div>
        </div>
        <div className="flex gap-2">
          <form action={rejectOrder}>
            <input type="hidden" name="handle" value={o.handle} />
            <button className="rounded-lg border border-rule bg-surface px-3.5 py-2 text-sm font-medium hover:bg-sunken">
              Reject
            </button>
          </form>
          <form action={approveOrder}>
            <input type="hidden" name="handle" value={o.handle} />
            <button className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-on-ink hover:opacity-90">
              Approve and buy
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function Ledger({ orders }: { orders: Order[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-rule text-muted">
          <tr>
            <th className="px-5 py-2.5 font-medium">Item</th>
            <th className="px-3 py-2.5 text-right font-medium">Amount</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 text-right font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {orders.map((o) => (
            <tr key={o.handle} className="hover:bg-sunken/60">
              <td className="px-5 py-3">
                <Link
                  href={`/orders/${o.handle}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {o.productName}
                </Link>
                <div className="text-muted">{packageLabel(o.packageValue, o.currency)}</div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{usd(o.amountCents)}</td>
              <td className="px-3 py-3">
                <StatusBadge status={o.status} />
                {o.denyReasons.length > 0 && (
                  <div className="mt-1 text-[13px] text-muted">
                    {o.denyReasons.map((r) => DENY_REASON[r] ?? r).join(', ')}
                  </div>
                )}
              </td>
              <td className="px-5 py-3 text-right text-muted tabular-nums">{when(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustodyLog({ events, names }: { events: OrderEvent[]; names: Map<string, string> }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">Every step an order takes is recorded here.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-rule pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-paper ${
              e.event === 'leak_blocked'
                ? 'bg-seal'
                : e.actor.startsWith('human:')
                  ? 'bg-ink'
                  : 'bg-muted'
            }`}
            aria-hidden
          />
          <p className="text-sm">
            <span className="font-medium">{actorLabel(e.actor)}</span>{' '}
            {eventLabel(e.event, e.detail)}
          </p>
          <p className="text-[13px] text-muted">
            <Link href={`/orders/${e.orderHandle}`} className="hover:underline">
              {names.get(e.orderHandle) ?? e.orderHandle}
            </Link>
            <span className="tabular-nums">, {clock(e.at)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

export default async function Dashboard() {
  await requireOperator();
  const rt = await runtime();
  // Move in-flight orders forward (buy approved ones, poll invoices).
  await rt.operator.advanceAll().catch(() => undefined);

  const orders = rt.operator.listOrders();
  const pending = orders.filter((o) => o.status === 'pending_approval');
  const names = new Map(orders.map((o) => [o.handle, o.productName]));
  const policy = rt.operator.policy();

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <PolicySummary policy={policy} spent={rt.operator.spentTodayCents()} mode={rt.mode} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <section>
            <SectionTitle aside={pending.length > 0 ? `${pending.length} waiting` : undefined}>
              Needs your approval
            </SectionTitle>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-rule px-5 py-6 text-sm text-muted">
                Nothing is waiting. When your assistant proposes an order over{' '}
                {usd(policy.approvalThresholdCents)}, it appears here for you to approve or reject.
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map((o) => (
                  <ApprovalTicket key={o.handle} o={o} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>Orders</SectionTitle>
            {orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-rule px-5 py-6 text-sm text-muted">
                <p>
                  No orders yet. Connect your assistant to Courier and ask it to buy a gift card or
                  eSIM.
                </p>
                {rt.mode === 'demo' && (
                  <p className="mt-2">
                    To see the flow without an assistant, run <Handle value="pnpm smoke ./data" />{' '}
                    in the repo.
                  </p>
                )}
              </div>
            ) : (
              <Ledger orders={orders} />
            )}
          </section>
        </div>

        <aside>
          <SectionTitle>Chain of custody</SectionTitle>
          <CustodyLog events={rt.operator.events().slice(0, 15)} names={names} />
          {!consoleIsOpen() && (
            <form action={logout} className="mt-8">
              <button className="text-sm text-muted underline underline-offset-4">Sign out</button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
