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

## Phase 1 scope

PageView only. Future events (ViewContent, InitiateCheckout, Purchase, Lead, AddToCart) are intentionally excluded until the foundation is proven.
