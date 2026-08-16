export const PAGE_VIEW_PREFIX = 'pv';

export function generatePageViewEventId(): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return `${PAGE_VIEW_PREFIX}_${s}`;
}

export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string' && /^pv_[0-9a-f]{16}$/.test(value);
}
