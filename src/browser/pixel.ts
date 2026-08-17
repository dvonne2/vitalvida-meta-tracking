const SCRIPT_ID = 'vitalvida-fbevents';
const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __vvPixelsInitialized?: boolean;
    __vvPixelLoaded?: boolean;
    __vvPixelLoadPromise?: Promise<void>;
  }
}

export function loadPixel(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  if (window.__vvPixelLoaded) {
    return Promise.resolve();
  }

  if (window.__vvPixelLoadPromise) {
    return window.__vvPixelLoadPromise;
  }

  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      (fbq as unknown as { queue: unknown[] }).queue.push(args);
    }) as unknown as (...args: unknown[]) => void;
    (fbq as unknown as { queue: unknown[] }).queue = [] as unknown[];
    window.fbq = fbq;
  }

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    window.__vvPixelLoadPromise = new Promise<void>((resolve) => {
      if (window.__vvPixelLoaded) {
        resolve();
        return;
      }
      const onLoad = () => {
        window.__vvPixelLoaded = true;
        resolve();
      };
      const onError = () => {
        resolve();
      };
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
    });
    return window.__vvPixelLoadPromise;
  }

  window.__vvPixelLoadPromise = new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = PIXEL_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.__vvPixelLoaded = true;
      resolve();
    };
    script.onerror = () => {
      resolve();
    };
    document.head.appendChild(script);
  });

  return window.__vvPixelLoadPromise;
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

export function updatePixelAdvancedMatching(
  pixelId: string,
  advancedMatchingData: Record<string, unknown>,
): boolean {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  try {
    window.fbq('init', pixelId, advancedMatchingData);
    return true;
  } catch (err) {
    return false;
  }
}

export function trackInitiateCheckout(
  eventId: string,
  customData: Record<string, unknown>,
): boolean {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  try {
    window.fbq('track', 'InitiateCheckout', customData, { eventID: eventId });
    return true;
  } catch (err) {
    return false;
  }
}
