export const PAGE_VIEW_PREFIX = 'pv';
export const VIEW_CONTENT_PREFIX = 'vc';

function generateId(prefix: string): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return `${prefix}_${s}`;
}

export function generatePageViewEventId(): string {
  return generateId(PAGE_VIEW_PREFIX);
}

export function generateViewContentEventId(): string {
  return generateId(VIEW_CONTENT_PREFIX);
}

export function isValidPageViewEventId(value: unknown): value is string {
  return typeof value === 'string' && /^pv_[0-9a-f]{16}$/.test(value);
}

export function isValidViewContentEventId(value: unknown): value is string {
  return typeof value === 'string' && /^vc_[0-9a-f]{16}$/.test(value);
}

export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string' && /^(pv|vc)_[0-9a-f]{16}$/.test(value);
}
