import pino, { type Logger } from 'pino';

/**
 * Structured logs on stderr (stdout carries the MCP stdio protocol).
 * Any field that could hold a secret is censored by path, whatever its depth.
 */
export const REDACT_PATHS = [
  '*.invoice_access_token',
  '*.invoice_id',
  '*.payment_link',
  '*.x402_payment_url',
  '*.redemption_info',
  '*.esim_install_link',
  '*.code',
  '*.pin',
  '*.apiKey',
  '*.authorization',
  '*.Authorization',
  'raw',
  '*.raw',
  'buy',
  'invoice',
];

export function createLogger(name: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino(
    { name, level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
    pino.destination(2),
  );
}

export type { Logger };
