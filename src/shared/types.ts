export interface MetaBaseConfig {
  pixelId: string;
}

export interface ViewContentConfig {
  scrollPercent?: number;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  value?: number;
  currency?: string;
}

export interface MetaBrowserConfig extends MetaBaseConfig {
  capiEndpoint: string;
  country?: string;
  storageKey?: string;
  viewContent?: ViewContentConfig;
  onError?: (err: unknown) => void;
}

export interface MetaCapiConfig extends MetaBaseConfig {
  accessToken: string;
  apiVersion: string;
  testEventCode?: string;
  allowedOrigins?: string[];
  allowedSourceHosts?: string[];
  onError?: (err: unknown) => void;
}

export interface PageViewPayload {
  event_name: 'PageView';
  event_id: string;
  event_time: number;
  action_source: 'website';
  event_source_url: string;
  user_data: {
    external_id: string;
    fbp?: string;
    fbc?: string;
    country?: string;
  };
  custom_data?: Record<string, unknown>;
}

export interface ViewContentPayload {
  event_name: 'ViewContent';
  event_id: string;
  event_time: number;
  action_source: 'website';
  event_source_url: string;
  user_data: {
    external_id: string;
    fbp?: string;
    fbc?: string;
    country?: string;
  };
  custom_data: Record<string, unknown>;
}

export interface CapiUserData {
  client_ip_address: string;
  client_user_agent: string;
  external_id?: string[];
  fbp?: string;
  fbc?: string;
  country?: string[];
}

export interface CapiEvent {
  event_name: 'PageView' | 'ViewContent';
  event_id: string;
  event_time: number;
  action_source: 'website';
  event_source_url: string;
  user_data: CapiUserData;
  custom_data: Record<string, unknown>;
}

export interface MetaSendResult {
  ok: boolean;
  eventName: string;
  eventId: string;
  httpStatus?: number;
  eventsReceived?: number;
  messages?: unknown[];
  fbtraceId?: string;
}

export interface BrowserPageViewResult {
  eventId: string;
  browserSent: boolean;
  capiResult: MetaSendResult | null;
}

export interface BrowserViewContentResult {
  eventId: string;
  browserSent: boolean;
  capiResult: MetaSendResult | null;
}

export interface RequestContext {
  clientIp: string;
  userAgent: string;
  origin: string;
  host: string;
}

export interface SanitizeSourceUrlOptions {
  removeParams?: string[];
  stripHash?: boolean;
}
