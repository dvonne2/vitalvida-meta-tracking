export async function sha256(value: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error('vitalvida-meta-tracking: no SHA-256 implementation available');
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function looksLikeSha256(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value.toLowerCase());
}

export async function hashExternalId(value: string): Promise<string> {
  if (looksLikeSha256(value)) return value;
  return sha256(value.trim());
}

export function normalizeCountry(value: string): string | null {
  const raw = value.toLowerCase().trim();
  if (!/^[a-z]{2}$/.test(raw)) return null;
  return raw;
}
