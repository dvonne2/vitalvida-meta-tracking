const SCRIPT_ID = 'vitalvida-fbevents';
const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __vvPixelsInitialized?: boolean;
  }
}

export function loadPixel(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve();
      return;
    }

    if (window.fbq && typeof window.fbq === 'function' && document.getElementById(SCRIPT_ID)) {
      resolve();
      return;
    }

    if (window.fbq && typeof window.fbq === 'function') {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = PIXEL_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function initializePixel(
  pixelId: string,
  initParams: { external_id: string; country?: string },
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__vvPixelsInitialized) return false;
  if (typeof window.fbq !== 'function') return false;

  try {
    window.fbq('init', pixelId, initParams);
    window.__vvPixelsInitialized = true;
    return true;
  } catch (err) {
    return false;
  }
}

export function trackPageView(eventId: string): boolean {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  try {
    window.fbq('track', 'PageView', {}, { eventID: eventId });
    return true;
  } catch (err) {
    return false;
  }
}

export function trackViewContent(
  eventId: string,
  customData: Record<string, unknown>,
): boolean {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  try {
    window.fbq('track', 'ViewContent', customData, { eventID: eventId });
    return true;
  } catch (err) {
    return false;
  }
}
