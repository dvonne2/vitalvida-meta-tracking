import type { SanitizeSourceUrlOptions } from './types.js';

const DEFAULT_TRACKING_PARAMS = ['fbclid'];

export function sanitizeSourceUrl(
  raw: string,
  options: SanitizeSourceUrlOptions = {},
): string | null {
  const removeParams = options.removeParams ?? DEFAULT_TRACKING_PARAMS;
  const stripHash = options.stripHash ?? true;

  try {
    const url = new URL(raw);
    for (const param of removeParams) {
      url.searchParams.delete(param);
    }
    if (stripHash) {
      url.hash = '';
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isAllowedHost(host: string, allowedHosts: string[]): boolean {
  const normalized = host.toLowerCase();
  return allowedHosts.includes(normalized);
}
