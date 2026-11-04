import { createServer, type Server } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMockBitrefillServer, MockState } from './server.js';

/**
 * Stateless Streamable HTTP endpoint at POST /mcp, like the real Bitrefill MCP.
 * One McpServer per request; invoices persist in the shared MockState.
 */
export function startMockBitrefillHttp(port: number, state = new MockState()): Promise<Server> {
  const http = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/mcp')) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const server = createMockBitrefillServer(state);
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  return new Promise((resolve) => http.listen(port, '127.0.0.1', () => resolve(http)));
}
