/**
 * Structured log lines (one JSON object per line). They show up in
 * `wrangler dev` / `wrangler tail` and, with Workers Logs enabled
 * (wrangler.toml [observability]), are searchable in the Cloudflare dashboard.
 * No emails, passwords, tokens or message text — only ids and numbers.
 */
export type LogEvent =
  | 'request'
  | 'register'
  | 'login'
  | 'login_failed'
  | 'password_reset_requested'
  | 'password_changed'
  | 'admin_update'
  | 'account_deleted'
  | 'sync'
  | 'ai'
  | 'orc'
  | 'ais'
  | 'rate_limited'
  | 'error';

export function log(evt: LogEvent, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ evt, ...fields });
  if (evt === 'error') console.error(line);
  else console.log(line);
}

/** Token usage of one Claude call (or the sum over an agent's steps). */
export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function addUsage(a: Required<Record<keyof Usage, number>>, u: Usage | undefined) {
  if (!u) return a;
  a.input_tokens += u.input_tokens ?? 0;
  a.output_tokens += u.output_tokens ?? 0;
  a.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  a.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  return a;
}

export const zeroUsage = () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
