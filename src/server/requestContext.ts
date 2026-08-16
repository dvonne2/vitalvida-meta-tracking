import type { RequestContext } from '../shared/types.js';

export type HeaderValue = string | string[] | undefined;

export type HeadersLike =
  | Record<string, HeaderValue>
  | { get(name: string): string | null };

function firstHeader(value: HeaderValue): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function isHeadersGet(value: unknown): value is { get(name: string): string | null } {
  return !!value && typeof (value as { get?: unknown }).get === 'function';
}

function getHeader(headers: HeadersLike, name: string): string {
  if (isHeadersGet(headers)) {
    return headers.get(name) || '';
  }

  const lower = name.toLowerCase();
  const exact = headers[name] ?? headers[lower];
  if (exact !== undefined) return firstHeader(exact);

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return firstHeader(value);
    }
  }
  return '';
}

export function extractClientContext(
  headers: HeadersLike,
  remoteAddress?: string,
): RequestContext {
  const forwardedFor = getHeader(headers, 'x-forwarded-for');
  const realIp = getHeader(headers, 'x-real-ip');
  const origin = getHeader(headers, 'origin');
  const host = getHeader(headers, 'host');
  const userAgent = getHeader(headers, 'user-agent');

  const clientIp = forwardedFor.split(',')[0]?.trim()
    || realIp
    || remoteAddress
    || '';

  return {
    clientIp,
    userAgent,
    origin: origin || '',
    host: (host || '').split(':')[0].toLowerCase(),
  };
}
