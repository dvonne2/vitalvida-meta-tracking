import type { MetaBrowserConfig, MetaCapiConfig } from './types.js';

export const DEFAULT_VISITOR_ID_KEY = '__vv_visitor_id';
export const DEFAULT_COUNTRY = 'ng';

export function normalizeBrowserConfig(config: MetaBrowserConfig): Required<Pick<MetaBrowserConfig, 'country' | 'storageKey'>> & MetaBrowserConfig {
  return {
    ...config,
    country: (config.country || DEFAULT_COUNTRY).toLowerCase(),
    storageKey: config.storageKey || DEFAULT_VISITOR_ID_KEY,
  };
}

export function assertBrowserConfig(config: MetaBrowserConfig): void {
  if (!config.pixelId || !/^\d+$/.test(config.pixelId)) {
    throw new Error('vitalvida-meta-tracking: pixelId must be a numeric string');
  }
  if (!config.capiEndpoint) {
    throw new Error('vitalvida-meta-tracking: capiEndpoint is required');
  }
}

export function assertCapiConfig(config: MetaCapiConfig): void {
  if (!config.pixelId || !/^\d+$/.test(config.pixelId)) {
    throw new Error('vitalvida-meta-tracking: pixelId must be a numeric string');
  }
  if (!config.accessToken) {
    throw new Error('vitalvida-meta-tracking: accessToken is required');
  }
  if (!config.apiVersion) {
    throw new Error('vitalvida-meta-tracking: apiVersion is required');
  }
}
