# React + Vercel example

Example consumer of `vitalvida-meta-tracking` in a React client and Vercel serverless function.

## Browser

```tsx
import { createMetaBrowser } from 'vitalvida-meta-tracking/browser';
import { useEffect } from 'react';

export function useMetaPageView() {
  useEffect(() => {
    const meta = createMetaBrowser({
      pixelId: import.meta.env.VITE_META_PIXEL_ID,
      capiEndpoint: '/api/meta-capi',
      country: 'us',
    });
    meta.firePageView();
  }, []);
}
```

## Vercel API

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMetaCapi } from 'vitalvida-meta-tracking/server';

const capi = createMetaCapi({
  pixelId: process.env.META_PIXEL_ID!,
  accessToken: process.env.META_ACCESS_TOKEN!,
  apiVersion: process.env.META_API_VERSION || 'v18.0',
  testEventCode: process.env.META_TEST_EVENT_CODE,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const result = await capi.sendPageView({
    body: req.body,
    headers: req.headers,
    remoteAddress: req.socket?.remoteAddress,
  });
  res.status(result.ok ? 200 : 400).json(result);
}
```
