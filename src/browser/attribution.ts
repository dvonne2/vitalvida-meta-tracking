const FBC_COOKIE = '_fbc';
const FBP_COOKIE = '_fbp';

const FBC_PREFIX = 'fb.1';
const CLICK_ID_PATTERN = /^fb\.1\.\d+\..+$/;

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function setCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax; Secure`;
}

export function isValidClickId(value: string | null | undefined): value is string {
  return !!value && CLICK_ID_PATTERN.test(value);
}

export function extractFbclid(fbc: string): string | null {
  const match = fbc.match(/^fb\.1\.\d+\.(.+)$/);
  return match ? match[1] : null;
}

export function captureFbc(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get('fbclid');
  const cookie = getCookie(FBC_COOKIE);

  if (fbclid) {
    if (isValidClickId(cookie) && extractFbclid(cookie) === fbclid) {
      return cookie;
    }
    const fbc = `${FBC_PREFIX}.${Date.now()}.${fbclid}`;
    setCookie(FBC_COOKIE, fbc, 30);
    return fbc;
  }

  if (isValidClickId(cookie)) {
    return cookie;
  }

  return null;
}

export function getFbp(): string | null {
  const cookie = getCookie(FBP_COOKIE);
  return isValidClickId(cookie) ? cookie : null;
}
