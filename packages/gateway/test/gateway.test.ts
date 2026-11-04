import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { INJECTION_MARKER, type MockSecrets } from '@courier/mock-bitrefill';
import { GATEWAY_TOOLS } from '@courier/gateway';
import { makeHarness, pollUntilSettled, type Harness } from './harness.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe('tool surface', () => {
  it('exposes exactly the four agent tools, none of which can approve or reveal', async () => {
    h = await makeHarness();
    const listed = JSON.parse(h.transcript[0] ?? '{}') as { tools: { name: string }[] };
    expect(listed.tools.map((t) => t.name).sort()).toEqual([...GATEWAY_TOOLS].sort());
    for (const t of listed.tools)
      expect(t.name).not.toMatch(/approve|reveal|vault|secret|invoice|deny|reject/i);
  });
});

describe('the model cannot approve its own order', () => {
  it('approval tools do not exist, and a pending order stays pending until a human acts', async () => {
    h = await makeHarness();
    const p = await h.call('propose_order', {
      product_id: 'test-esim-data-syldavia',
      package_value: '1GB, 7 Days',
    });
    expect(p.body.status).toBe('pending_approval');
    expect(p.body.requires_human_approval).toBe(true);
    const order = String(p.body.order);

    for (const name of ['approve_order', 'approve', 'operator_approve']) {
      const r = await h
        .call(name, { order })
        .catch((e: Error) => ({ isError: true, body: { error: e.message } }));
      expect(r.isError).toBe(true);
    }
    // Arguments smuggling an approval are ignored by the strict schema.
    await h
      .call('get_order_status', { order, approve: true, status: 'approved' })
      .catch(() => undefined);
    expect((await h.call('get_order_status', { order })).body.status).toBe('pending_approval');
    expect(h.operator.getOrder(order)?.status).toBe('pending_approval');

    // Only the operator (console) API can approve.
    await h.operator.approve(order, 'tushar');
    expect(await pollUntilSettled(h, order)).toBe('delivered');
    const secrets = h.operator.reveal(order, 'tushar');
    expect(secrets?.items.some((i) => i.label.includes('esim_install_link'))).toBe(true);
  });

  it('a rejected order is never bought', async () => {
    h = await makeHarness();
    const p = await h.call('propose_order', {
      product_id: 'test-esim-data-syldavia',
      package_value: '1GB, 7 Days',
    });
    h.operator.reject(String(p.body.order), 'tushar');
    expect((await h.call('get_order_status', { order: p.body.order })).body.status).toBe(
      'rejected',
    );
    expect(h.mock.invoices.size).toBe(0);
  });
});

describe('caps are enforced', () => {
  it('denies above the per-order cap without calling buy', async () => {
    h = await makeHarness({ policy: { perOrderCapCents: 500, dailyCapCents: 1_000 } });
    const r = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '10' });
    expect(r.body.status).toBe('denied');
    expect(r.body.deny_reasons).toContain('per_order_cap_exceeded');
    expect(h.mock.invoices.size).toBe(0);
  });

  it('counts pending orders toward the daily cap', async () => {
    h = await makeHarness({
      policy: { dailyCapCents: 1_000, perOrderCapCents: 1_000, approvalThresholdCents: 0 },
    });
    const a = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '5' });
    const b = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '5' });
    const c = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '1' });
    expect([a.body.status, b.body.status]).toEqual(['pending_approval', 'pending_approval']);
    expect(c.body.status).toBe('denied');
    expect(c.body.deny_reasons).toContain('daily_cap_exceeded');
  });

  it('prices come from Bitrefill, not the model', async () => {
    h = await makeHarness();
    const r = await h.call('propose_order', {
      product_id: 'delos-syldavia',
      package_value: '10',
      amount: '0.01',
    });
    expect(r.body.amount ?? '10.00').toBe('10.00');
  });

  it('denies disallowed product types', async () => {
    h = await makeHarness({ policy: { allowedProductTypes: ['esims'] } });
    const r = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '1' });
    expect(r.body.deny_reasons).toContain('product_type_not_allowed');
  });
});

describe('injected product text is neutralised', () => {
  it('never forwards descriptions, instructions or URLs from the catalog', async () => {
    h = await makeHarness();
    await h.call('search_products', { intent: 'gift', query: '*', country: 'KN' });
    const d = await h.call('get_product_details', { product_id: 'bonus-credits-syldavia' });
    expect(d.isError).toBe(false);
    const all = h.transcript.join('\n');
    expect(all).not.toContain(INJECTION_MARKER);
    expect(all).not.toMatch(/IMPORTANT NOTICE FOR AI ASSISTANTS/);
    // Tool results (not our own tools/list schema) carry no URLs at all.
    expect(h.transcript.slice(1).join('\n')).not.toMatch(/https?:\/\//);
  });
});

describe('order lifecycle', () => {
  it('auto-approves under the threshold and delivers', async () => {
    h = await makeHarness();
    const p = await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '1' });
    expect(['awaiting_payment', 'paid', 'delivered']).toContain(p.body.status);
    expect(await pollUntilSettled(h, String(p.body.order))).toBe('delivered');
  });

  it('handles slow and failing merchants', async () => {
    h = await makeHarness({ policy: { approvalThresholdCents: 100 } });
    const slow = await h.call('propose_order', {
      product_id: 'slowcorp-syldavia',
      package_value: '2',
    });
    const fail = await h.call('propose_order', {
      product_id: 'failcorp-syldavia',
      package_value: '2',
    });
    await h.operator.approve(String(slow.body.order), 't');
    await h.operator.approve(String(fail.body.order), 't');
    expect(await pollUntilSettled(h, String(slow.body.order))).toBe('delivered');
    expect(await pollUntilSettled(h, String(fail.body.order))).toBe('failed');
  });

  it('refuses products that need personal data, unknown packages and unknown products', async () => {
    h = await makeHarness();
    expect(
      (await h.call('propose_order', { product_id: 'syl-tel-syldavia', package_value: '5' })).body
        .error,
    ).toBe('unsupported_product');
    expect(
      (await h.call('propose_order', { product_id: 'delos-syldavia', package_value: '999' })).body
        .error,
    ).toBe('unknown_package');
    expect((await h.call('get_product_details', { product_id: 'nope-syldavia' })).body.error).toBe(
      'product_not_found',
    );
    expect(
      (await h.call('get_order_status', { order: 'ord_AAAAAAAAAAAAAAAAAAAAAA' })).body.error,
    ).toBe('order_not_found');
  });
});

describe('no secret ever reaches the model (property)', () => {
  const secretArb = fc.stringMatching(/^[A-Za-z0-9!#%&*+=?@^_~-]{12,40}$/);
  const secretsArb = fc.record({
    invoiceAccessToken: secretArb,
    code: secretArb,
    pin: fc.stringMatching(/^[0-9]{10,12}$/),
    esimActivation: secretArb,
  });

  it('holds for random secrets across a full buy → approve → deliver flow', async () => {
    await fc.assert(
      fc.asyncProperty(secretsArb, async (s: MockSecrets) => {
        const run = await makeHarness({ mock: { secrets: () => s } });
        try {
          const auto = await run.call('propose_order', {
            product_id: 'delos-syldavia',
            package_value: '1',
          });
          await pollUntilSettled(run, String(auto.body.order));
          const esim = await run.call('propose_order', {
            product_id: 'test-esim-data-syldavia',
            package_value: '1GB, 7 Days',
          });
          await run.operator.approve(String(esim.body.order), 'p');
          await pollUntilSettled(run, String(esim.body.order));

          // Sanity: the secrets really were issued and are in the vault.
          const revealed = run.operator.reveal(String(esim.body.order), 'p');
          expect(revealed?.items.map((i) => i.value).join(' ')).toContain(s.esimActivation);

          const seen = run.transcript.join('\n');
          for (const v of [s.invoiceAccessToken, s.code, s.pin, s.esimActivation])
            expect(seen).not.toContain(v);
          for (const id of run.mock.invoices.keys()) expect(seen).not.toContain(id);
          expect(seen).not.toMatch(UUID_RE);
          expect(seen).not.toMatch(/LPA:1\$/);
        } finally {
          await run.close();
        }
      }),
      { numRuns: 25 },
    );
  });
});
