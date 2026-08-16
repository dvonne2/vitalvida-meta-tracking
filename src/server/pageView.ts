import type { CapiEvent, CapiUserData, MetaCapiConfig, MetaSendResult, PageViewPayload } from '../shared/types.js';
import { assertCapiConfig } from '../shared/config.js';
import { isValidEventId } from '../shared/eventId.js';
import { sanitizeSourceUrl, isAllowedHost } from '../shared/sourceUrl.js';
import { extractClientContext, type HeadersLike } from './requestContext.js';
import { hashExternalId, normalizeCountry, sha256 } from './hashing.js';
import { sendCapiEvent } from './capi.js';

const MAX_EVENT_AGE = 7 * 24 * 60 * 60;
const MAX_EVENT_FUTURE = 5 * 60;
const MAX_BODY_SIZE = 64 * 1024;

function validateEventTime(eventTime: number): boolean {
  if (!Number.isFinite(eventTime) || eventTime <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - eventTime > MAX_EVENT_AGE) return false;
  if (eventTime - now > MAX_EVENT_FUTURE) return false;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOriginAllowed(origin: string, requestHost: string, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).hostname.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

export interface SendPageViewArgs {
  body: unknown;
  headers: HeadersLike;
  remoteAddress?: string;
}

export function createMetaCapi(rawConfig: MetaCapiConfig) {
  const config: MetaCapiConfig = {
    ...rawConfig,
    allowedOrigins: rawConfig.allowedOrigins || [],
    allowedSourceHosts: rawConfig.allowedSourceHosts || [],
  };
  assertCapiConfig(config);

  return {
    async sendPageView({ body, headers, remoteAddress }: SendPageViewArgs): Promise<MetaSendResult> {
      const requestContext = extractClientContext(headers, remoteAddress);

      if (!isOriginAllowed(requestContext.origin, requestContext.host, config.allowedOrigins!)) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      if (!isPlainObject(body)) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      if (new TextEncoder().encode(JSON.stringify(body)).length > MAX_BODY_SIZE) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      const payload = body as unknown as PageViewPayload;

      if (payload.event_name !== 'PageView') {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      if (!isValidEventId(payload.event_id)) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      if (!validateEventTime(payload.event_time)) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
        };
      }

      if (payload.action_source !== 'website') {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: '',
          messages: ['Invalid action_source'],
        };
      }

      const sanitized = sanitizeSourceUrl(payload.event_source_url, {
        removeParams: ['fbclid'],
        stripHash: true,
      });
      if (!sanitized) {
        return {
          ok: false,
          eventName: 'PageView',
          eventId: payload.event_id,
          messages: ['Invalid event_source_url'],
        };
      }

      try {
        const u = new URL(sanitized);
        if (u.protocol !== 'https:') {
          return { ok: false, eventName: 'PageView', eventId: payload.event_id, messages: ['HTTPS required'] };
        }
        const allowedHosts = [...(config.allowedSourceHosts || []), requestContext.host];
        if (!isAllowedHost(u.hostname, allowedHosts)) {
          return { ok: false, eventName: 'PageView', eventId: payload.event_id, messages: ['Source host not allowed'] };
        }
      } catch {
        return { ok: false, eventName: 'PageView', eventId: payload.event_id, messages: ['Invalid source URL'] };
      }

      const userData = payload.user_data || { external_id: '' };
      if (!userData.external_id) {
        return { ok: false, eventName: 'PageView', eventId: payload.event_id, messages: ['Missing external_id'] };
      }

      const externalIdHash = await hashExternalId(userData.external_id);
      const finalUserData: Record<string, unknown> = {
        client_ip_address: requestContext.clientIp,
        client_user_agent: requestContext.userAgent,
        external_id: [externalIdHash],
      };

      if (userData.fbp) finalUserData.fbp = userData.fbp;
      if (userData.fbc) finalUserData.fbc = userData.fbc;

      const country = userData.country;
      if (country) {
        const normalized = normalizeCountry(country);
        if (normalized) finalUserData.country = [await sha256(normalized)];
      }

      const event: CapiEvent = {
        event_name: 'PageView',
        event_id: payload.event_id,
        event_time: payload.event_time,
        action_source: 'website',
        event_source_url: sanitized,
        user_data: finalUserData as unknown as CapiUserData,
        custom_data: isPlainObject(payload.custom_data) ? payload.custom_data : {},
      };

      return sendCapiEvent(config, { event, requestContext });
    },
  };
}
