import type { CapiEvent, MetaCapiConfig, MetaSendResult, RequestContext } from '../shared/types.js';

export interface CapiSendArgs {
  event: CapiEvent;
  requestContext: RequestContext;
  onDiagnostic?: (data: Record<string, unknown>) => void;
}

function sanitizeMetaError(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return { message: 'Unknown Meta error' };
  const err = (body as { error?: Record<string, unknown> }).error;
  return {
    code: err?.code,
    subcode: err?.error_subcode,
    message: typeof err?.message === 'string' ? (err.message as string).slice(0, 300) : undefined,
    type: err?.type,
  };
}

export function buildMetaRequestBody(event: CapiEvent, testEventCode?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { data: [event] };
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }
  return body;
}

export function logCapiDiagnostic(
  config: MetaCapiConfig,
  event: CapiEvent,
  status: number,
  body: unknown,
  ok: boolean,
): void {
  const custom = event.custom_data as { order_id?: string };
  const ctx = {
    event: event.event_name,
    event_id: event.event_id,
    order_id: custom.order_id,
    pixel_id: config.pixelId,
    status,
    events_received: (body as { events_received?: number }).events_received,
    messages: (body as { messages?: unknown[] }).messages,
    fbtrace_id: (body as { fbtrace_id?: string }).fbtrace_id,
    fbp_present: !!event.user_data.fbp,
    fbc_present: !!event.user_data.fbc,
    external_id_present: !!event.user_data.external_id,
    test_event_code_present: !!config.testEventCode,
    ok,
  };

  console.log(JSON.stringify(ctx));
}

export async function sendCapiEvent(
  config: MetaCapiConfig,
  { event, onDiagnostic }: CapiSendArgs,
): Promise<MetaSendResult> {
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.pixelId}/events`);
  url.searchParams.set('access_token', config.accessToken);

  const body = buildMetaRequestBody(event, config.testEventCode);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const status = res.status;
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }

    const ok = res.ok;
    logCapiDiagnostic(config, event, status, parsed, ok);

    if (onDiagnostic) {
      onDiagnostic({
        event: event.event_name,
        event_id: event.event_id,
        status,
        body: ok ? parsed : sanitizeMetaError(parsed),
        ok,
      });
    }

    return {
      ok,
      eventName: event.event_name,
      eventId: event.event_id,
      httpStatus: status,
      eventsReceived: (parsed as { events_received?: number }).events_received,
      messages: (parsed as { messages?: unknown[] }).messages,
      fbtraceId: (parsed as { fbtrace_id?: string }).fbtrace_id,
    };
  } catch (err) {
    console.warn(JSON.stringify({
      event: event.event_name,
      event_id: event.event_id,
      pixel_id: config.pixelId,
      error: err instanceof Error ? err.message : String(err),
    }));

    return {
      ok: false,
      eventName: event.event_name,
      eventId: event.event_id,
    };
  }
}
