import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { isHandle } from '@courier/core';
import { Card, Handle, StatusPill, time, usd } from '@/components/ui';
import { AutoRefresh } from '@/components/auto-refresh';
import { requireOperator } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
import { refreshOrder } from '../../actions';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = ['approved', 'purchasing', 'awaiting_payment', 'paid'];

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ reveal?: string }>;
}) {
  const operator = await requireOperator();
  const { handle } = await params;
  const { reveal } = await searchParams;
  if (!isHandle(handle, 'ord')) notFound();

  const rt = await runtime();
  const order = await rt.operator.advance(handle).catch(() => rt.operator.getOrder(handle));
  if (!order) notFound();

  const secrets =
    reveal === '1' && order.status === 'delivered'
      ? rt.operator.reveal(handle, operator)
      : undefined;
  const events = rt.operator.events().filter((e) => e.orderHandle === handle);
  const lpa = secrets?.items.find((i) => i.value.startsWith('LPA:'))?.value;
  const qr = lpa ? await QRCode.toString(lpa, { type: 'svg', margin: 1, width: 180 }) : undefined;

  return (
    <div className="space-y-6">
      {IN_FLIGHT.includes(order.status) && <AutoRefresh ms={5000} />}
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{order.productName}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {order.packageValue} · {usd(order.amountCents)} {order.currency} · {order.productType} ·{' '}
            {order.country}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill status={order.status} />
            <Handle value={order.handle} />
          </div>
        </div>
        {IN_FLIGHT.includes(order.status) && (
          <form action={refreshOrder}>
            <input type="hidden" name="handle" value={order.handle} />
            <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">
              Check now
            </button>
          </form>
        )}
      </div>

      <Card
        title="Vault"
        action={
          order.status === 'delivered' && !secrets ? (
            <Link
              href={`/orders/${order.handle}?reveal=1`}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Reveal secrets
            </Link>
          ) : undefined
        }
      >
        {order.status !== 'delivered' ? (
          <p className="text-sm text-zinc-500">Secrets appear here once the merchant delivers.</p>
        ) : !secrets ? (
          <p className="text-sm text-zinc-500">
            Delivered and encrypted at rest (AES-256-GCM). The assistant only ever saw{' '}
            <Handle value={order.handle} />. Revealing is logged.
          </p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <dl className="min-w-0 flex-1 space-y-3">
              {secrets.items.map((i) => (
                <div key={i.label}>
                  <dt className="font-mono text-xs text-zinc-500">{i.label}</dt>
                  <dd className="break-all font-mono text-sm">{i.value}</dd>
                </div>
              ))}
            </dl>
            {qr && (
              <div className="text-center">
                <div
                  className="rounded-lg border border-zinc-200 bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
                <div className="mt-1 text-xs text-zinc-500">Scan to install eSIM</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Timeline">
        <ol className="space-y-2 text-sm">
          {events
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-36 shrink-0 font-mono text-xs text-zinc-400">{time(e.at)}</span>
                <span className="w-28 shrink-0 text-zinc-500">{e.actor}</span>
                <span className="font-medium">{e.event}</span>
                {e.detail && <span className="text-zinc-500">{e.detail}</span>}
              </li>
            ))}
        </ol>
        {order.failure && <p className="mt-3 text-sm text-rose-700">Failure: {order.failure}</p>}
      </Card>
    </div>
  );
}
