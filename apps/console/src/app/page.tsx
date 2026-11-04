import Link from 'next/link';
import type { Order } from '@courier/core';
import { AutoRefresh } from '@/components/auto-refresh';
import { Card, Handle, StatusPill, time, usd } from '@/components/ui';
import { approveOrder, logout, rejectOrder } from './actions';
import { consoleIsOpen, requireOperator } from '@/lib/auth';
import { runtime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

function PendingCard({ o }: { o: Order }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{o.productName}</span>
          <span className="text-sm text-zinc-600">· {o.packageValue}</span>
        </div>
        <div className="mt-1 text-sm text-zinc-600">
          {usd(o.amountCents)} {o.currency} · {o.productType} · {o.country} · proposed{' '}
          {time(o.createdAt)}
        </div>
        {o.intent && (
          <div className="mt-1 truncate text-sm text-zinc-500">
            Agent&apos;s reason: “{o.intent}”
          </div>
        )}
        <div className="mt-2">
          <Handle value={o.handle} />
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={rejectOrder}>
          <input type="hidden" name="handle" value={o.handle} />
          <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">
            Reject
          </button>
        </form>
        <form action={approveOrder}>
          <input type="hidden" name="handle" value={o.handle} />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Approve &amp; buy
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function Dashboard() {
  await requireOperator();
  const rt = await runtime();
  // Move in-flight orders forward (buy approved ones, poll invoices).
  await rt.operator.advanceAll().catch(() => undefined);

  const orders = rt.operator.listOrders();
  const pending = orders.filter((o) => o.status === 'pending_approval');
  const policy = rt.operator.policy();
  const spent = rt.operator.spentTodayCents();
  const pct = Math.min(100, Math.round((spent / policy.dailyCapCents) * 100));
  const events = rt.operator.events().slice(0, 25);

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            rt.mode === 'live' ? 'bg-rose-600 text-white' : 'bg-zinc-200 text-zinc-800'
          }`}
        >
          {rt.mode === 'live' ? 'LIVE · real Bitrefill' : 'DEMO · mock Bitrefill (test double)'}
        </span>
        {consoleIsOpen() ? (
          <span className="text-zinc-500">Open demo console: no token configured.</span>
        ) : (
          <form action={logout}>
            <button className="text-zinc-500 underline">Sign out</button>
          </form>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Committed today</div>
          <div className="mt-1 text-2xl font-semibold">
            {usd(spent)}{' '}
            <span className="text-sm font-normal text-zinc-500">/ {usd(policy.dailyCapCents)}</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-zinc-100">
            <div className="h-1.5 rounded-full bg-zinc-900" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Per-order cap</div>
          <div className="mt-1 text-2xl font-semibold">{usd(policy.perOrderCapCents)}</div>
          <div className="mt-1 text-sm text-zinc-500">
            Human approval above {usd(policy.approvalThresholdCents)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Allowed</div>
          <div className="mt-1 text-sm">{policy.allowedProductTypes.join(', ')}</div>
          <div className="mt-1 text-sm text-zinc-500">{policy.allowedCountries.join(' · ')}</div>
        </div>
      </div>

      <Card title={`Waiting for you (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing to approve. Ask your assistant to buy something through Courier.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((o) => (
              <PendingCard key={o.handle} o={o} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Orders">
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Created</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((o) => (
                <tr key={o.handle}>
                  <td className="py-2.5">
                    <div className="font-medium">{o.productName}</div>
                    <div className="text-xs text-zinc-500">{o.packageValue}</div>
                  </td>
                  <td className="py-2.5">{usd(o.amountCents)}</td>
                  <td className="py-2.5">
                    <StatusPill status={o.status} />
                    {o.denyReasons.length > 0 && (
                      <div className="mt-1 text-xs text-zinc-500">{o.denyReasons.join(', ')}</div>
                    )}
                  </td>
                  <td className="py-2.5 text-zinc-500">{time(o.createdAt)}</td>
                  <td className="py-2.5 text-right">
                    <Link
                      href={`/orders/${o.handle}`}
                      className="text-sm font-medium text-zinc-900 underline"
                    >
                      {o.status === 'delivered' ? 'Open vault' : 'Details'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Activity log">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-36 shrink-0 text-zinc-400">{time(e.at)}</span>
                <span className="w-28 shrink-0 text-zinc-500">{e.actor}</span>
                <span className="font-semibold">{e.event}</span>
                <span className="truncate text-zinc-500">{e.orderHandle}</span>
                {e.detail && <span className="truncate text-zinc-400">{e.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
