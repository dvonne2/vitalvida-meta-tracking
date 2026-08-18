# vitalvida-meta-tracking

Reusable Meta Pixel + CAPI foundation for VitalVida projects.

## Install

```bash
npm install vitalvida-meta-tracking
```

## Usage

### Browser

```ts
import { createMetaBrowser } from 'vitalvida-meta-tracking/browser';

const meta = createMetaBrowser({
  pixelId: process.env.VITE_META_PIXEL_ID!, // only pixel ID is public
  capiEndpoint: '/api/meta-capi',
  country: 'us',
});

await meta.firePageView(); // browser Pixel + CAPI in one call
```

### Server

```ts
import { createMetaCapi } from 'vitalvida-meta-tracking/server';

const capi = createMetaCapi({
  pixelId: process.env.META_PIXEL_ID!,
  accessToken: process.env.META_ACCESS_TOKEN!, // server-only
  apiVersion: process.env.META_API_VERSION || 'v18.0',
  testEventCode: process.env.META_TEST_EVENT_CODE,
});

export default async function handler(req, res) {
  const result = await capi.sendPageView({
    body: req.body,
    headers: req.headers,
    remoteAddress: req.socket?.remoteAddress,
  });
  res.status(result.ok ? 200 : 400).json(result);
}
```

## Security

- `accessToken` and `testEventCode` are server-only; never pass them to `createMetaBrowser`.
- `external_id` is hashed server-side before reaching Meta.
- `fbp` and `fbc` are passed to CAPI unhashed, as Meta documents.

## Live Meta Test Events verification

Use `testEventCode` only on the **server/CAPI** side, passed through configuration or an environment variable. The module places it at the top level of the Graph API request and never inside browser payloads.

When you need visual confirmation in Meta's Test Events tool:

1. Open the Test Events page and keep it open while you drive the funnel.
2. Use a real, non-headless browser user agent. Headless tools such as Playwright's default `HeadlessChrome` UA can return `events_received: 1` from Meta's API without the events appearing in the Test Events UI.
3. A recommended starting UA fixture is available in `tests/support/liveTest.ts`:

```ts
import { createMetaLiveTestContext } from 'vitalvida-meta-tracking/dist/tests/support/liveTest.js';

const ctx = createMetaLiveTestContext();
// ctx.userAgent is a realistic Chrome/Safari-style UA without HeadlessChrome/Playwright/bot identifiers.
```

4. Drive the funnel in order:

```
PageView → ViewContent → InitiateCheckout → Purchase
```

5. Verify **API acceptance** (HTTP 200 and `events_received`) separately from **UI confirmation** in Test Events. Receiving `events_received: 1` does not guarantee visual confirmation.
6. Purchase remains server-only and must be sent by the consumer backend after a real order is created. The browser module does not expose a `firePurchase` method. The Purchase `event_id` must be the consumer's real order ID.
7. Direct traffic must not fabricate `fbc`. The module only uses genuine `_fbp` and `_fbc` cookies; do not create fake attribution identifiers for testing.

## Phase 1 scope

PageView only. Future events (ViewContent, InitiateCheckout, Purchase, Lead, AddToCart) are intentionally excluded until the foundation is proven.
