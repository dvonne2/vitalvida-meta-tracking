import type {
  BrowserInitiateCheckoutResult,
  BrowserPageViewResult,
  BrowserViewContentResult,
  CheckoutUpdate,
  InitiateCheckoutPayload,
  MetaBrowserConfig,
  MetaSendResult,
  PageViewPayload,
  ViewContentConfig,
  ViewContentPayload,
} from '../shared/types.js';
import type { SplitName } from '../shared/checkout.js';
import { assertBrowserConfig, normalizeBrowserConfig } from '../shared/config.js';
import {
  generatePageViewEventId,
  generateViewContentEventId,
  generateInitiateCheckoutEventId,
} from '../shared/eventId.js';
import { sanitizeSourceUrl } from '../shared/sourceUrl.js';
import { normalizePhone, splitName, isValidEmail } from '../shared/checkout.js';
import { getVisitorId } from './identity.js';
import { captureFbc, getFbp } from './attribution.js';
import { initializePixel, loadPixel, trackPageView, trackViewContent, trackInitiateCheckout, updatePixelAdvancedMatching } from './pixel.js';

declare global {
  interface Window {
    __vvPageViewEventId?: string;
    __vvVisitorId?: string;
    __vvViewContentCleanup?: () => void;
  }
}

const DEFAULT_VIEWCONTENT_THRESHOLD_PERCENT = 20;

async function postCapi(
  endpoint: string,
  payload: PageViewPayload | ViewContentPayload | InitiateCheckoutPayload,
): Promise<MetaSendResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await res.json()) as Partial<MetaSendResult> & Record<string, unknown>;

    return {
      ok: res.ok && (result.ok === true || (res.status >= 200 && res.status < 300)),
      eventName: payload.event_name,
      eventId: payload.event_id,
      httpStatus: res.status,
      eventsReceived: typeof result.eventsReceived === 'number' ? result.eventsReceived : undefined,
      messages: Array.isArray(result.messages) ? result.messages : undefined,
      fbtraceId: typeof result.fbtraceId === 'string' ? result.fbtraceId : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      eventName: payload.event_name,
      eventId: payload.event_id,
    };
  }
}

function buildViewContentCustomData(viewContent?: ViewContentConfig): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!viewContent) return data;
  if (viewContent.contentName) data.content_name = viewContent.contentName;
  if (Array.isArray(viewContent.contentIds) && viewContent.contentIds.length > 0) {
    data.content_ids = viewContent.contentIds;
  }
  if (viewContent.contentType) data.content_type = viewContent.contentType;
  if (typeof viewContent.value === 'number') data.value = viewContent.value;
  if (viewContent.currency) data.currency = viewContent.currency;
  return data;
}

function buildInitiateCheckoutCustomData(checkout: CheckoutUpdate): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (checkout.contentName) data.content_name = checkout.contentName;
  if (Array.isArray(checkout.contentIds) && checkout.contentIds.length > 0) {
    data.content_ids = checkout.contentIds;
    data.contents = checkout.contentIds.map((id) => ({
      id,
      quantity: typeof checkout.numItems === 'number' ? checkout.numItems : 1,
    }));
  }
  if (checkout.contentType) data.content_type = checkout.contentType;
  if (typeof checkout.numItems === 'number') data.num_items = checkout.numItems;
  if (typeof checkout.value === 'number') data.value = checkout.value;
  if (checkout.currency) data.currency = checkout.currency;
  return data;
}

function getScrollPercent(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const scrollTop = window.scrollY ?? 0;
  const scrollHeight = document.documentElement?.scrollHeight ?? 0;
  const innerHeight = window.innerHeight ?? 0;
  const scrollable = scrollHeight - innerHeight;
  if (scrollable <= 0) return 0;
  return scrollTop / scrollable;
}

export function createMetaBrowser(rawConfig: MetaBrowserConfig) {
  const config = normalizeBrowserConfig(rawConfig);
  assertBrowserConfig(config);
  const viewContentData = buildViewContentCustomData(config.viewContent);
  const viewContentThreshold = (config.viewContent?.scrollPercent ?? DEFAULT_VIEWCONTENT_THRESHOLD_PERCENT) / 100;

  let viewContentPromise: Promise<BrowserViewContentResult> | null = null;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let onScroll: EventListener | null = null;
  let detached = false;

  let checkoutData: CheckoutUpdate = {};
  let initiateCheckoutPromise: Promise<BrowserInitiateCheckoutResult> | null = null;

  async function firePageView(): Promise<BrowserPageViewResult> {
    const result: BrowserPageViewResult = {
      eventId: '',
      browserSent: false,
      capiResult: null,
    };

    try {
      const visitorId = getVisitorId(config.storageKey);
      const fbc = captureFbc();
      const fbp = getFbp();
      const eventId = generatePageViewEventId();

      result.eventId = eventId;

      if (typeof window !== 'undefined') {
        window.__vvVisitorId = visitorId;
        window.__vvPageViewEventId = eventId;
      }

      try {
        await loadPixel();
      } catch (err) {
        if (config.onError) config.onError(err);
      }

      const initParams: { external_id: string; country?: string } = { external_id: visitorId };
      if (config.country) initParams.country = config.country;
      initializePixel(config.pixelId, initParams);

      result.browserSent = trackPageView(eventId);

      const payload: PageViewPayload = {
        event_name: 'PageView',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: sanitizeSourceUrl(globalThis.location?.href || '', {}) ?? '',
        user_data: {
          external_id: visitorId,
          ...(fbc ? { fbc } : {}),
          ...(fbp ? { fbp } : {}),
          ...(config.country ? { country: config.country } : {}),
        },
      };

      result.capiResult = await postCapi(config.capiEndpoint, payload);
    } catch (err) {
      if (config.onError) config.onError(err);
    }

    return result;
  }

  async function fireViewContent(): Promise<BrowserViewContentResult> {
    if (viewContentPromise) return viewContentPromise;

    viewContentPromise = (async () => {
      const result: BrowserViewContentResult = {
        eventId: '',
        browserSent: false,
        capiResult: null,
      };

      try {
        const visitorId = getVisitorId(config.storageKey);
        const fbc = captureFbc();
        const fbp = getFbp();
        const eventId = generateViewContentEventId();

        result.eventId = eventId;

        result.browserSent = trackViewContent(eventId, viewContentData);

        const payload: ViewContentPayload = {
          event_name: 'ViewContent',
          event_id: eventId,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: sanitizeSourceUrl(globalThis.location?.href || '', {}) ?? '',
          user_data: {
            external_id: visitorId,
            ...(fbc ? { fbc } : {}),
            ...(fbp ? { fbp } : {}),
            ...(config.country ? { country: config.country } : {}),
          },
          custom_data: viewContentData,
        };

        result.capiResult = await postCapi(config.capiEndpoint, payload);
      } catch (err) {
        if (config.onError) config.onError(err);
      }

      return result;
    })();

    return viewContentPromise;
  }

  async function fireInitiateCheckout(
    phone: string,
    name: SplitName,
  ): Promise<BrowserInitiateCheckoutResult> {
    const result: BrowserInitiateCheckoutResult = {
      eventId: '',
      browserSent: false,
      capiResult: null,
    };

    try {
      const visitorId = getVisitorId(config.storageKey);
      const fbc = captureFbc();
      const fbp = getFbp();
      const eventId = generateInitiateCheckoutEventId();

      result.eventId = eventId;

      try {
        await loadPixel();
      } catch (err) {
        if (config.onError) config.onError(err);
      }

      const email = isValidEmail(checkoutData.email);
      const city = checkoutData.city?.trim().toLowerCase();
      const state = checkoutData.state?.trim().toLowerCase();
      const country = config.country;

      const advancedMatchingData: Record<string, unknown> = {
        external_id: visitorId,
        ph: phone,
        fn: name.firstName,
      };

      if (email) advancedMatchingData.em = email;
      if (name.surname) advancedMatchingData.ln = name.surname;
      if (city) advancedMatchingData.ct = city;
      if (state) advancedMatchingData.st = state;
      if (country) advancedMatchingData.country = country;

      updatePixelAdvancedMatching(config.pixelId, advancedMatchingData);

      const customData = buildInitiateCheckoutCustomData(checkoutData);
      result.browserSent = trackInitiateCheckout(eventId, customData);

      const payload: InitiateCheckoutPayload = {
        event_name: 'InitiateCheckout',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: sanitizeSourceUrl(globalThis.location?.href || '', {}) ?? '',
        user_data: {
          external_id: visitorId,
          phone,
          first_name: name.firstName,
          ...(name.surname ? { surname: name.surname } : {}),
          ...(email ? { email } : {}),
          ...(state ? { state } : {}),
          ...(city ? { city } : {}),
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          ...(country ? { country } : {}),
        },
        custom_data: customData,
      };

      result.capiResult = await postCapi(config.capiEndpoint, payload);
    } catch (err) {
      if (config.onError) config.onError(err);
    }

    return result;
  }

  async function updateCheckout(update: CheckoutUpdate): Promise<BrowserInitiateCheckoutResult | null> {
    if (initiateCheckoutPromise) return initiateCheckoutPromise;
    checkoutData = { ...checkoutData, ...update };
    const phone = normalizePhone(checkoutData.phone);
    const name = splitName(checkoutData.name);
    if (phone && name) {
      initiateCheckoutPromise = fireInitiateCheckout(phone, name);
      return initiateCheckoutPromise;
    }
    return null;
  }

  function getTrackingContext(): { externalId: string; fbp: string | null; fbc: string | null } {
    return {
      externalId: getVisitorId(config.storageKey),
      fbp: getFbp(),
      fbc: captureFbc(),
    };
  }

  function resetCheckout(): void {
    checkoutData = {};
    initiateCheckoutPromise = null;
  }

  function checkScroll(): void {
    if (detached || viewContentPromise || !config.viewContent) return;
    if (viewContentThreshold <= 0 || viewContentThreshold > 1) return;
    const percent = getScrollPercent();
    if (percent >= viewContentThreshold) {
      detachScroll();
      fireViewContent().catch((err) => {
        if (config.onError) config.onError(err);
      });
    }
  }

  onScroll = () => {
    if (detached || viewContentPromise || scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      checkScroll();
    }, 0);
  };

  function attachScroll(): void {
    if (typeof window === 'undefined' || !config.viewContent || !onScroll) return;
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    // Check immediately in case the page is already scrolled past the threshold.
    setTimeout(checkScroll, 0);
  }

  function detachScroll(): void {
    detached = true;
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && onScroll) {
      window.removeEventListener('scroll', onScroll);
    }
    onScroll = null;
  }

  function cleanup(): void {
    detachScroll();
  }

  if (config.viewContent) {
    if (typeof window !== 'undefined' && typeof window.__vvViewContentCleanup === 'function') {
      window.__vvViewContentCleanup();
    }
    if (typeof window !== 'undefined') {
      window.__vvViewContentCleanup = cleanup;
    }
    attachScroll();
  }

  return {
    firePageView,
    fireViewContent,
    updateCheckout,
    resetCheckout,
    cleanup,
    getTrackingContext,
  };
}
