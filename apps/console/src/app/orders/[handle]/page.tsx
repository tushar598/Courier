import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { isHandle, toAgentView, type Order, type RevealedSecrets } from '@courier/core';
import { AutoRefresh } from '@/components/auto-refresh';
import { CopyButton } from '@/components/copy-button';
import {
  Handle,
  StatusBadge,
  actorLabel,
  clock,
  eventLabel,
  packageLabel,
  usd,
} from '@/components/ui';
import { requireOperator } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
import { refreshOrder } from '../../actions';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = ['approved', 'purchasing', 'awaiting_payment', 'paid'];

/** Plain-language names for what came out of the vault. */
function describe(path: string): { label: string; group: 'goods' | 'invoice' } {
  const p = path.toLowerCase();
  if (p.endsWith('esim_install_link')) return { label: 'eSIM install link', group: 'goods' };
  if (p.endsWith('activation_code')) return { label: 'eSIM activation code', group: 'goods' };
  if (p.endsWith('.pin')) return { label: 'PIN', group: 'goods' };
  if (p.endsWith('.code') || p.includes('redemption'))
    return { label: 'Redemption code', group: 'goods' };
  if (p.endsWith('invoice_id')) return { label: 'Bitrefill invoice ID', group: 'invoice' };
  if (p.endsWith('invoice_access_token'))
    return { label: 'Invoice access token', group: 'invoice' };
  if (p.endsWith('payment_link')) return { label: 'Payment link', group: 'invoice' };
  if (p.endsWith('x402_payment_url')) return { label: 'x402 payment URL', group: 'invoice' };
  return { label: path.split('.').at(-1)?.replaceAll('_', ' ') ?? path, group: 'invoice' };
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-muted">{label}</div>
        <div className="break-all font-mono text-[13.5px]">{value}</div>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function SealedVault({ order }: { order: Order }) {
  const delivered = order.status === 'delivered';
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5" aria-hidden>
        {[78, 54, 66].map((w) => (
          <div key={w} className="h-3.5 rounded bg-seal-tint" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-seal text-sm font-semibold text-on-ink">
          C
        </span>
        <p className="text-sm text-muted">
          {delivered
            ? 'Sealed. Codes and links are encrypted at rest and have never been shown to your assistant. Opening the vault is recorded.'
            : 'Empty. When Bitrefill delivers, the codes are sealed here, not sent to your assistant.'}
        </p>
      </div>
      {delivered && (
        <Link
          href={`/orders/${order.handle}?reveal=1`}
          className="mt-6 inline-flex w-fit items-center rounded-lg bg-seal px-4 py-2 text-sm font-medium text-on-ink hover:opacity-90"
        >
          Break the seal
        </Link>
      )}
    </div>
  );
}

async function OpenVault({ secrets }: { secrets: RevealedSecrets }) {
  const rows = secrets.items.map((i) => ({ ...describe(i.label), value: i.value }));
  const goods = rows.filter((r) => r.group === 'goods');
  const invoice = rows.filter((r) => r.group === 'invoice');
  const lpa = goods.find((r) => r.value.startsWith('LPA:'))?.value;
  const qr = lpa
    ? await QRCode.toString(lpa, {
        type: 'svg',
        margin: 1,
        width: 168,
        color: { dark: '#14213d', light: '#ffffff' },
      })
    : undefined;
  return (
    <div className="unseal space-y-5">
      {qr && (
        <div className="flex items-center gap-4">
          <div
            className="rounded-lg bg-white p-1.5 ring-1 ring-rule"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-sm text-muted">
            Scan with your phone&apos;s camera to install the eSIM.
          </p>
        </div>
      )}
      {goods.length > 0 && (
        <div className="divide-y divide-rule">
          {goods.map((r) => (
            <SecretRow key={r.label + r.value} label={r.label} value={r.value} />
          ))}
        </div>
      )}
      <details className="rounded-lg border border-rule px-4 py-2">
        <summary className="cursor-pointer text-sm font-medium">Invoice credentials</summary>
        <p className="mt-1 text-[13px] text-muted">
          Anyone holding these can read the codes. Courier keeps them out of the assistant&apos;s
          context.
        </p>
        <div className="divide-y divide-rule">
          {invoice.map((r) => (
            <SecretRow key={r.label + r.value} label={r.label} value={r.value} />
          ))}
        </div>
      </details>
    </div>
  );
}

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
  const agentView = JSON.stringify(toAgentView(order), null, 2);

  return (
    <div className="space-y-8">
      {IN_FLIGHT.includes(order.status) && <AutoRefresh ms={5000} />}
      <Link href="/" className="text-sm text-muted hover:text-ink">
        Back to all orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            {order.productName}
          </h1>
          <p className="mt-1 text-muted">
            {packageLabel(order.packageValue, order.currency)},{' '}
            <span className="tabular-nums">{usd(order.amountCents)}</span>
          </p>
          <div className="mt-3">
            <StatusBadge status={order.status} />
          </div>
        </div>
        {IN_FLIGHT.includes(order.status) && (
          <form action={refreshOrder}>
            <input type="hidden" name="handle" value={order.handle} />
            <button className="rounded-lg border border-rule bg-surface px-3.5 py-2 text-sm font-medium hover:bg-sunken">
              Check with Bitrefill now
            </button>
          </form>
        )}
      </header>

      <div className="grid overflow-hidden rounded-2xl border border-rule bg-surface md:grid-cols-2">
        <section className="border-b border-rule bg-sunken p-6 md:border-b-0 md:border-r">
          <h2 className="font-semibold">What your assistant saw</h2>
          <p className="mt-1 text-sm text-muted">
            This is the whole of it. The assistant holds the handle <Handle value={order.handle} />{' '}
            and nothing that could open the goods.
          </p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-rule bg-surface p-4 font-mono text-[12.5px] leading-relaxed">
            {agentView}
          </pre>
        </section>
        <section className="p-6">
          <h2 className="font-semibold">Your vault</h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            Only you can open this, here in the console.
          </p>
          {secrets ? <OpenVault secrets={secrets} /> : <SealedVault order={order} />}
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Chain of custody</h2>
        <ol className="relative space-y-3 border-l border-rule pl-5">
          {events
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="relative text-sm">
                <span
                  className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-paper ${
                    e.actor.startsWith('human:') ? 'bg-ink' : 'bg-muted'
                  }`}
                  aria-hidden
                />
                <span className="font-medium">{actorLabel(e.actor)}</span>{' '}
                {eventLabel(e.event, e.detail)}
                <span className="text-muted tabular-nums">, {clock(e.at)}</span>
              </li>
            ))}
        </ol>
        {order.failure && <p className="mt-4 text-sm text-bad">Why it failed: {order.failure}</p>}
      </section>
    </div>
  );
}
