/**
 * Generic test support for live Meta events verification.
 *
 * This is NOT production tracking logic. It is a reusable fixture for running
 * real browser tests against Meta's Test Events tool with a normal, non-headless
 * user agent, because headless browsers such as Playwright's default
 * HeadlessChrome UA can be accepted by Meta's API without appearing in the Test
 * Events UI.
 */

export interface MetaLiveTestContext {
  /** A realistic desktop browser user agent. */
  userAgent: string;
  /** A reasonable desktop viewport for live verification. */
  viewport: { width: number; height: number };
  /** Optional extra headers (e.g., Accept-Language). */
  extraHTTPHeaders?: Record<string, string>;
  /** Locale to use for the browser context. */
  locale: string;
}

/** A realistic Chrome on macOS user agent with no headless, bot, or Playwright identifiers. */
export const META_LIVE_TEST_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Returns a generic browser context configuration for live Meta verification.
 *
 * The default user agent is a realistic Chrome string. Consumers may override
 * it, but they should avoid HeadlessChrome, Playwright, or crawler identifiers
 * when visual confirmation in Meta Test Events is required.
 */
export function createMetaLiveTestContext(
  overrides?: Partial<MetaLiveTestContext>,
): MetaLiveTestContext {
  return {
    userAgent: overrides?.userAgent ?? META_LIVE_TEST_USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    ...overrides,
  };
}

/**
 * Returns true if the supplied user agent contains identifiers that commonly
 * prevent events from appearing in Meta's Test Events UI.
 */
export function isSuspiciousUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const forbidden = ['headlesschrome', 'headless', 'playwright', 'puppeteer', 'selenium', 'crawler', 'bot', 'spider'];
  return forbidden.some((term) => ua.includes(term));
}
