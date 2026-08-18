const SCRIPT_ID = 'vitalvida-fbevents';
const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    __vvInitializedPixelIds?: Set<string>;
    __vvPixelLoaded?: boolean;
    __vvPixelLoadPromise?: Promise<void>;
  }
}

function createFbqStub(): (...args: unknown[]) => void {
  const fbq = ((...args: unknown[]) => {
    const f = fbq as unknown as { callMethod?: (...args: unknown[]) => unknown; queue: unknown[] };
    if (f.callMethod) {
      f.callMethod.apply(f, args);
    } else {
      f.queue.push(args);
    }
  }) as unknown as (...args: unknown[]) => void;

  (fbq as unknown as { push: typeof fbq }).push = fbq;
  (fbq as unknown as { loaded: boolean }).loaded = true;
  (fbq as unknown as { version: string }).version = '2.0';
  (fbq as unknown as { queue: unknown[] }).queue = [] as unknown[];

  return fbq;
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

  // An existing Pixel implementation (official or another source) is already present.
  // Do not create a conflicting stub or load a second fbevents.js instance.
  if (typeof window.fbq === 'function') {
    window.__vvPixelLoaded = true;
    return Promise.resolve();
  }

  window.fbq = createFbqStub();
  if (!window._fbq) {
    window._fbq = window.fbq;
  }

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    window.__vvPixelLoadPromise = new Promise<void>((resolve) => {
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
  if (typeof window.fbq !== 'function') return false;

  const ids = (window.__vvInitializedPixelIds ??= new Set<string>());
  if (ids.has(pixelId)) return false;

  try {
    window.fbq('init', pixelId, initParams);
    ids.add(pixelId);
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
