import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildMetaRequestBody } from '../../src/server/capi.js';
import type { CapiEvent } from '../../src/shared/types.js';

describe('server/capi', () => {
  it('places test_event_code at the top level when configured', () => {
    const event: CapiEvent = {
      event_name: 'PageView',
      event_id: 'pv_1234567890abcdef',
      event_time: 1234567890,
      action_source: 'website',
      event_source_url: 'https://example.com/',
      user_data: {
        client_ip_address: '1.2.3.4',
        client_user_agent: 'Test',
        external_id: ['hash'],
      },
      custom_data: {},
    };
    const body = buildMetaRequestBody(event, 'TEST123');
    assert.ok(Array.isArray(body.data));
    assert.equal((body.data as CapiEvent[])[0], event);
    assert.equal(body.test_event_code, 'TEST123');
  });

  it('does not include test_event_code when not configured', () => {
    const event: CapiEvent = {
      event_name: 'PageView',
      event_id: 'pv_1234567890abcdef',
      event_time: 1234567890,
      action_source: 'website',
      event_source_url: 'https://example.com/',
      user_data: {
        client_ip_address: '1.2.3.4',
        client_user_agent: 'Test',
        external_id: ['hash'],
      },
      custom_data: {},
    };
    const body = buildMetaRequestBody(event, undefined);
    assert.equal('test_event_code' in body, false);
  });
});
