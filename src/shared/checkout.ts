const NIGERIAN_PHONE_PATTERN = /^\d{11,13}$/;

export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  cleaned = cleaned.replace(/\D/g, '');

  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '234' + cleaned.slice(1);
  }

  if (!NIGERIAN_PHONE_PATTERN.test(cleaned)) return null;
  if (!cleaned.startsWith('234')) return null;
  if (cleaned.length !== 13) return null;

  return cleaned;
}

export interface SplitName {
  firstName: string;
  surname?: string;
}

export function splitName(raw: string | undefined | null): SplitName | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const surname = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  return { firstName, surname };
}

export function isValidEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}
