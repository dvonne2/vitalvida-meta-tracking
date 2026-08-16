import type { BrowserPageViewResult, MetaBrowserConfig, MetaSendResult, PageViewPayload } from '../shared/types.js';
import { assertBrowserConfig, normalizeBrowserConfig } from '../shared/config.js';
import { generatePageViewEventId } from '../shared/eventId.js';
import { sanitizeSourceUrl } from '../shared/sourceUrl.js';
import { getVisitorId } from './identity.js';
import { captureFbc, getFbp } from './attribution.js';
import { initializePixel, loadPixel, trackPageView } from './pixel.js';

declare global {
  interface Window {
    __vvPageViewEventId?: string;
    __vvVisitorId?: string;
  }
}

async function sendCapiPageView(
  endpoint: string,
  payload: PageViewPayload,
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

export function createMetaBrowser(rawConfig: MetaBrowserConfig) {
  const config = normalizeBrowserConfig(rawConfig);
  assertBrowserConfig(config);

  return {
    async firePageView(): Promise<BrowserPageViewResult> {
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

        result.capiResult = await sendCapiPageView(config.capiEndpoint, payload);
      } catch (err) {
        if (config.onError) config.onError(err);
      }

      return result;
    },
  };
}
