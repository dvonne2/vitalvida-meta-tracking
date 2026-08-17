import type { CapiEvent, CapiUserData, MetaCapiConfig, MetaSendResult, PageViewPayload, ViewContentPayload, InitiateCheckoutPayload, PurchasePayload, RequestContext } from '../shared/types.js';
import { assertCapiConfig } from '../shared/config.js';
import { isValidPageViewEventId, isValidViewContentEventId, isValidInitiateCheckoutEventId } from '../shared/eventId.js';
import { sanitizeSourceUrl, isAllowedHost } from '../shared/sourceUrl.js';
import { extractClientContext, type HeadersLike } from './requestContext.js';
import { hashExternalId, normalizeCountry, sha256 } from './hashing.js';
import { sendCapiEvent } from './capi.js';
import { normalizePhone, splitName, isValidEmail } from '../shared/checkout.js';

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

async function buildDefaultUserData(
  userData: Record<string, unknown>,
  requestContext: RequestContext,
): Promise<Record<string, unknown>> {
  const externalIdHash = await hashExternalId(userData.external_id as string);
  const finalUserData: Record<string, unknown> = {
    client_ip_address: requestContext.clientIp,
    client_user_agent: requestContext.userAgent,
    external_id: [externalIdHash],
  };

  if (userData.fbp) finalUserData.fbp = userData.fbp;
  if (userData.fbc) finalUserData.fbc = userData.fbc;

  const country = userData.country;
  if (country) {
    const normalized = normalizeCountry(country as string);
    if (normalized) finalUserData.country = [await sha256(normalized)];
  }

  return finalUserData;
}

async function buildInitiateCheckoutUserData(
  userData: Record<string, unknown>,
  requestContext: RequestContext,
): Promise<Record<string, unknown>> {
  const externalIdHash = await hashExternalId(userData.external_id as string);
  const finalUserData: Record<string, unknown> = {
    client_ip_address: requestContext.clientIp,
    client_user_agent: requestContext.userAgent,
    external_id: [externalIdHash],
  };

  const phone = normalizePhone(userData.phone as string | undefined);
  if (phone) finalUserData.ph = await sha256(phone);

  const firstName = typeof userData.first_name === 'string' ? userData.first_name.trim().toLowerCase() : '';
  if (firstName) finalUserData.fn = await sha256(firstName);

  const surname = typeof userData.surname === 'string' ? userData.surname.trim().toLowerCase() : '';
  if (surname) finalUserData.ln = await sha256(surname);

  const email = isValidEmail(userData.email as string | undefined);
  if (email) finalUserData.em = await sha256(email);

  const city = typeof userData.city === 'string' ? userData.city.trim().toLowerCase() : '';
  if (city) finalUserData.ct = await sha256(city);

  const state = typeof userData.state === 'string' ? userData.state.trim().toLowerCase() : '';
  if (state) finalUserData.st = await sha256(state);

  const country = typeof userData.country === 'string' ? normalizeCountry(userData.country) : null;
  if (country) finalUserData.country = [await sha256(country)];

  if (userData.fbp) finalUserData.fbp = userData.fbp;
  if (userData.fbc) finalUserData.fbc = userData.fbc;

  return finalUserData;
}

async function buildPurchaseUserData(
  userData: Record<string, unknown>,
  requestContext: RequestContext,
): Promise<Record<string, unknown>> {
  const externalIdHash = await hashExternalId(userData.external_id as string);
  const finalUserData: Record<string, unknown> = {
    client_ip_address: requestContext.clientIp,
    client_user_agent: requestContext.userAgent,
    external_id: [externalIdHash],
  };

  const phone = normalizePhone(userData.phone as string | undefined);
  if (phone) finalUserData.ph = await sha256(phone);

  let firstName: string | undefined;
  let surname: string | undefined;

  if (typeof userData.first_name === 'string') {
    firstName = userData.first_name.trim().toLowerCase();
  } else if (typeof userData.name === 'string') {
    const split = splitName(userData.name);
    firstName = split?.firstName;
    surname = split?.surname;
  }

  if (typeof userData.surname === 'string' && !surname) {
    surname = userData.surname.trim().toLowerCase();
  }

  if (firstName) finalUserData.fn = await sha256(firstName);
  if (surname) finalUserData.ln = await sha256(surname);

  const email = isValidEmail(userData.email as string | undefined);
  if (email) finalUserData.em = await sha256(email);

  const city = typeof userData.city === 'string' ? userData.city.trim().toLowerCase() : '';
  if (city) finalUserData.ct = await sha256(city);

  const state = typeof userData.state === 'string' ? userData.state.trim().toLowerCase() : '';
  if (state) finalUserData.st = await sha256(state);

  const country = typeof userData.country === 'string' ? normalizeCountry(userData.country) : null;
  if (country) finalUserData.country = [await sha256(country)];

  if (userData.fbp) finalUserData.fbp = userData.fbp;
  if (userData.fbc) finalUserData.fbc = userData.fbc;

  return finalUserData;
}

export function createMetaCapi(rawConfig: MetaCapiConfig) {
  const config: MetaCapiConfig = {
    ...rawConfig,
    allowedOrigins: rawConfig.allowedOrigins || [],
    allowedSourceHosts: rawConfig.allowedSourceHosts || [],
  };
  assertCapiConfig(config);

  async function sendEvent(
    { body, headers, remoteAddress }: SendPageViewArgs,
    expectedName: 'PageView' | 'ViewContent' | 'InitiateCheckout',
    isValidId: (value: unknown) => value is string,
    buildUserData?: (userData: Record<string, unknown>, requestContext: RequestContext) => Promise<Record<string, unknown>>,
  ): Promise<MetaSendResult> {
    const requestContext = extractClientContext(headers, remoteAddress);

    if (!isOriginAllowed(requestContext.origin, requestContext.host, config.allowedOrigins!)) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    if (!isPlainObject(body)) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    if (new TextEncoder().encode(JSON.stringify(body)).length > MAX_BODY_SIZE) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    const payload = body as unknown as PageViewPayload | ViewContentPayload | InitiateCheckoutPayload;

    if (payload.event_name !== expectedName) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    if (!isValidId(payload.event_id)) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    if (!validateEventTime(payload.event_time)) {
      return {
        ok: false,
        eventName: expectedName,
        eventId: '',
      };
    }

    if (payload.action_source !== 'website') {
      return {
        ok: false,
        eventName: expectedName,
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
        eventName: expectedName,
        eventId: payload.event_id,
        messages: ['Invalid event_source_url'],
      };
    }

    try {
      const u = new URL(sanitized);
      if (u.protocol !== 'https:') {
        return { ok: false, eventName: expectedName, eventId: payload.event_id, messages: ['HTTPS required'] };
      }
      const allowedHosts = [...(config.allowedSourceHosts || []), requestContext.host];
      if (!isAllowedHost(u.hostname, allowedHosts)) {
        return { ok: false, eventName: expectedName, eventId: payload.event_id, messages: ['Source host not allowed'] };
      }
    } catch {
      return { ok: false, eventName: expectedName, eventId: payload.event_id, messages: ['Invalid source URL'] };
    }

    const userData = (payload.user_data as Record<string, unknown> | undefined) || { external_id: '' };
    if (!userData.external_id) {
      return { ok: false, eventName: expectedName, eventId: payload.event_id, messages: ['Missing external_id'] };
    }

    const finalUserData = buildUserData
      ? await buildUserData(userData, requestContext)
      : await buildDefaultUserData(userData, requestContext);

    const event: CapiEvent = {
      event_name: payload.event_name,
      event_id: payload.event_id,
      event_time: payload.event_time,
      action_source: 'website',
      event_source_url: sanitized,
      user_data: finalUserData as unknown as CapiUserData,
      custom_data: isPlainObject(payload.custom_data) ? payload.custom_data : {},
    };

    return sendCapiEvent(config, { event, requestContext });
  }

  return {
    async sendPageView(args: SendPageViewArgs): Promise<MetaSendResult> {
      return sendEvent(args, 'PageView', isValidPageViewEventId);
    },
    async sendViewContent(args: SendPageViewArgs): Promise<MetaSendResult> {
      return sendEvent(args, 'ViewContent', isValidViewContentEventId);
    },
    async sendInitiateCheckout(args: SendPageViewArgs): Promise<MetaSendResult> {
      const payload = args.body as Partial<InitiateCheckoutPayload>;
      const phone = normalizePhone(payload.user_data?.phone);
      const firstName = payload.user_data?.first_name?.trim();
      if (!phone || !firstName) {
        return { ok: false, eventName: 'InitiateCheckout', eventId: payload.event_id || '', messages: ['Missing phone or first name'] };
      }
      return sendEvent(args, 'InitiateCheckout', isValidInitiateCheckoutEventId, buildInitiateCheckoutUserData);
    },
    async sendPurchase(args: SendPageViewArgs): Promise<MetaSendResult> {
      const requestContext = extractClientContext(args.headers, args.remoteAddress);

      if (!isOriginAllowed(requestContext.origin, requestContext.host, config.allowedOrigins!)) {
        return { ok: false, eventName: 'Purchase', eventId: '' };
      }

      if (!isPlainObject(args.body)) {
        return { ok: false, eventName: 'Purchase', eventId: '' };
      }

      if (new TextEncoder().encode(JSON.stringify(args.body)).length > MAX_BODY_SIZE) {
        return { ok: false, eventName: 'Purchase', eventId: '' };
      }

      const payload = args.body as unknown as PurchasePayload;

      if (payload.event_name !== 'Purchase') {
        return { ok: false, eventName: 'Purchase', eventId: '' };
      }

      if (!payload.event_id) {
        return { ok: false, eventName: 'Purchase', eventId: '', messages: ['Missing order ID'] };
      }

      let alreadySent = false;
      if (config.idempotency) {
        try {
          alreadySent = await config.idempotency.has(payload.event_id);
        } catch (err) {
          if (config.onError) config.onError(err);
        }
        if (alreadySent) {
          return {
            ok: true,
            eventName: 'Purchase',
            eventId: payload.event_id,
            skipped: true,
            reason: 'already_sent',
          };
        }
      }

      if (!validateEventTime(payload.event_time)) {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Invalid event_time'] };
      }

      if (payload.action_source !== 'website') {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Invalid action_source'] };
      }

      const customData = isPlainObject(payload.custom_data) ? payload.custom_data : {};

      if (typeof customData.value !== 'number') {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Missing or invalid value'] };
      }

      if (!customData.currency || typeof customData.currency !== 'string') {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Missing or invalid currency'] };
      }

      if (!customData.order_id || typeof customData.order_id !== 'string') {
        customData.order_id = payload.event_id;
      }

      const sanitized = sanitizeSourceUrl(payload.event_source_url, {
        removeParams: ['fbclid'],
        stripHash: true,
      });
      if (!sanitized) {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Invalid event_source_url'] };
      }

      try {
        const u = new URL(sanitized);
        if (u.protocol !== 'https:') {
          return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['HTTPS required'] };
        }
        const allowedHosts = [...(config.allowedSourceHosts || []), requestContext.host];
        if (!isAllowedHost(u.hostname, allowedHosts)) {
          return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Source host not allowed'] };
        }
      } catch {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Invalid source URL'] };
      }

      const userData = payload.user_data || { external_id: '' };
      if (!userData.external_id) {
        return { ok: false, eventName: 'Purchase', eventId: payload.event_id, messages: ['Missing external_id'] };
      }

      const finalUserData = await buildPurchaseUserData(userData as unknown as Record<string, unknown>, requestContext);

      const event: CapiEvent = {
        event_name: 'Purchase',
        event_id: payload.event_id,
        event_time: payload.event_time,
        action_source: 'website',
        event_source_url: sanitized,
        user_data: finalUserData as unknown as CapiUserData,
        custom_data: customData,
      };

      const result = await sendCapiEvent(config, { event, requestContext });
      if (result.ok && config.idempotency) {
        try {
          await config.idempotency.mark(payload.event_id);
        } catch (err) {
          if (config.onError) config.onError(err);
        }
      }
      return result;
    },
  };
}
