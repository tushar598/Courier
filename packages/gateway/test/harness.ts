import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { DEFAULT_POLICY, EnvSchema, type PolicyConfig } from '@courier/core';
import { MockState, type MockOptions } from '@courier/mock-bitrefill';
import { createGatewayServer, createRuntime } from '@courier/gateway';

export interface Harness {
  /** MCP client playing the AI assistant. Every result text is recorded. */
  call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError: boolean; body: Record<string, unknown> }>;
  /** Every byte the model saw: tools/list plus all tool results. */
  transcript: string[];
  operator: Awaited<ReturnType<typeof createRuntime>>['operator'];
  mock: MockState;
  close(): Promise<void>;
}

export async function makeHarness(
  opts: { policy?: Partial<PolicyConfig>; mock?: MockOptions } = {},
): Promise<Harness> {
  process.env.LOG_LEVEL = 'silent';
  const mock = new MockState({ slowPolls: 3, ...opts.mock });
  const env = EnvSchema.parse({ COURIER_MODE: 'demo', COURIER_POLL_INTERVAL_MS: '0' });
  const runtime = await createRuntime(env, {
    ephemeral: true,
    mockState: mock,
    policy: { ...DEFAULT_POLICY, ...opts.policy },
  });
  const server = createGatewayServer(runtime.agent);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'test-assistant', version: '0' });
  await client.connect(a);

  const transcript: string[] = [JSON.stringify(await client.listTools())];
  return {
    transcript,
    operator: runtime.operator,
    mock,
    async call(name, args) {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { type: string; text?: string }[])
        .map((c) => c.text ?? '')
        .join('');
      transcript.push(JSON.stringify(r));
      return { isError: r.isError === true, body: JSON.parse(text) as Record<string, unknown> };
    },
    async close() {
      await client.close();
      await runtime.close();
    },
  };
}

/** Drive an order to a terminal state the way an assistant would: by polling status. */
export async function pollUntilSettled(h: Harness, order: string, max = 10): Promise<string> {
  let status = '';
  for (let i = 0; i < max; i++) {
    const r = await h.call('get_order_status', { order });
    status = String(r.body.status);
    if (['delivered', 'failed', 'denied', 'rejected', 'pending_approval'].includes(status)) break;
  }
  return status;
}
