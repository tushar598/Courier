import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  Courier,
  HandleStore,
  McpBitrefillClient,
  OrderStore,
  SqliteBlobStore,
  MemoryBlobStore,
  createLogger,
  dataDir,
  loadPolicy,
  loadVaultKey,
  VaultKey,
  type AgentApi,
  type Env,
  type OperatorApi,
  type PolicyConfig,
} from '@courier/core';
import { createMockBitrefillServer, MockState } from '@courier/mock-bitrefill';

export interface Runtime {
  mode: Env['COURIER_MODE'];
  upstream: 'bitrefill' | 'mock-in-process' | 'mock-http';
  agent: AgentApi;
  operator: OperatorApi;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  /** Keep everything in memory (tests, hosted demo). */
  ephemeral?: boolean;
  /** Demo mode: talk to a shared mock over HTTP instead of in-process. */
  mockUrl?: string;
  logName?: string;
  /** Demo/tests: inject the in-process mock's state (e.g. fixed secrets). */
  mockState?: MockState;
  /** Override the policy from env/file. */
  policy?: PolicyConfig;
}

export async function createRuntime(env: Env, opts: RuntimeOptions = {}): Promise<Runtime> {
  const log = createLogger(opts.logName ?? 'courier');
  const live = env.COURIER_MODE === 'live';

  let client: McpBitrefillClient;
  let upstream: Runtime['upstream'];
  if (live) {
    client = await McpBitrefillClient.connectHttp(
      env.BITREFILL_MCP_URL,
      env.BITREFILL_API_KEY ?? '',
    );
    upstream = 'bitrefill';
  } else if (opts.mockUrl) {
    client = await McpBitrefillClient.connect(
      new StreamableHTTPClientTransport(new URL(opts.mockUrl)),
    );
    upstream = 'mock-http';
  } else {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMockBitrefillServer(opts.mockState ?? new MockState()).connect(b);
    client = await McpBitrefillClient.connect(a);
    upstream = 'mock-in-process';
  }

  const ephemeral = opts.ephemeral ?? false;
  const dir = ephemeral ? '' : dataDir(env);
  const dbFile = (name: string) =>
    ephemeral ? ':memory:' : join(dir, `${name}-${env.COURIER_MODE}.db`);

  const courier = new Courier({
    client,
    orders: new OrderStore(dbFile('orders')),
    vault: new HandleStore({
      key: ephemeral ? VaultKey.generate() : loadVaultKey(env),
      store: ephemeral ? new MemoryBlobStore() : new SqliteBlobStore(dbFile('vault')),
      ttlSeconds: env.COURIER_HANDLE_TTL_SECONDS,
    }),
    policy: opts.policy ?? loadPolicy(env),
    payment: { method: env.COURIER_PAYMENT_METHOD, balanceCurrency: env.COURIER_BALANCE_CURRENCY },
    live,
    invoicePollIntervalMs: env.COURIER_POLL_INTERVAL_MS,
    onEvent: (e) => log[e.level]({ order: e.order }, e.msg),
  });

  log.info({ mode: env.COURIER_MODE, upstream }, 'courier runtime ready');
  return {
    mode: env.COURIER_MODE,
    upstream,
    agent: courier.agent(),
    operator: courier.operator(),
    close: () => client.close(),
  };
}
