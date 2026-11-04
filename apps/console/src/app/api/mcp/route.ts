import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createGatewayServer } from '@courier/gateway';
import { courierEnv, runtime } from '@/lib/runtime';

/**
 * Courier gateway over Streamable HTTP, for the hosted DEMO only (mock
 * Bitrefill, no credentials). Point an MCP client at /api/mcp to try it.
 * In live mode this endpoint is disabled: use the stdio gateway locally.
 * Stateless: one MCP server per request, shared Courier runtime behind it.
 */
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  if (courierEnv().COURIER_MODE !== 'demo') {
    return Response.json(
      { error: 'The HTTP gateway is only enabled in demo mode.' },
      { status: 404 },
    );
  }
  const rt = await runtime();
  const server = createGatewayServer(rt.agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
