/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from '../src/lib/crash-scrub';

describe('scrubText', () => {
  it('removes emails, bearer tokens, JWTs and long tokens', () => {
    const text = 'failed for ana@example.com with Bearer abc.def-123 and eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM and key 0123456789abcdef0123456789abcdef99';
    const result = scrubText(text);
    assert.ok(!result.includes('ana@example.com'));
    assert.ok(!result.includes('abc.def-123'));
    assert.ok(!result.includes('eyJhbGciOi'));
    assert.ok(!result.includes('0123456789abcdef0123456789abcdef99'));
    assert.ok(result.startsWith('failed for [redacted-email]'));
  });

  it('drops query strings from URLs inside messages', () => {
    assert.equal(scrubText('GET https://pulsofitness.tech/api/sync?token=x&w=82 failed'), 'GET https://pulsofitness.tech/api/sync failed');
    assert.equal(scrubText('route /meal?kcal=500 broke'), 'route /meal broke');
  });

  it('keeps ordinary error messages readable', () => {
    assert.equal(scrubText("Cannot read property 'map' of undefined"), "Cannot read property 'map' of undefined");
  });
});

describe('scrubUrl', () => {
  it('keeps only the path', () => {
    assert.equal(scrubUrl('https://pulsofitness.tech/api/plans/123?x=1#frag'), 'https://pulsofitness.tech/api/plans/123');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs, which can echo any value', () => {
    assert.equal(scrubBreadcrumb({ category: 'console', message: 'weight 82.4 kg' }), null);
  });

  it('keeps only method, status and path of HTTP breadcrumbs', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: { method: 'POST', status_code: 500, url: 'https://pulsofitness.tech/api/sync/push?device=1', request_body: '{"weight":82}' },
    });
    assert.deepEqual(crumb, { category: 'fetch', data: { method: 'POST', status_code: 500, url: 'https://pulsofitness.tech/api/sync/push' } });
  });

  it('keeps our own breadcrumbs as codes only', () => {
    const crumb = scrubBreadcrumb({ category: 'pulso.recovery', message: 'snapshot_checksum_mismatch', data: { code: 'E1', payload: { meals: [] } } });
    assert.deepEqual(crumb, { category: 'pulso.recovery', message: 'snapshot_checksum_mismatch', data: { code: 'E1' } });
  });

  it('drops UI breadcrumbs that could carry typed text', () => {
    assert.equal(scrubBreadcrumb({ category: 'touch', message: 'Pollo 200 g' }), null);
    assert.equal(scrubBreadcrumb({ category: 'ui.input', message: 'x' }), null);
  });
});

describe('scrubEvent', () => {
  it('removes user, extra, request body and unknown contexts', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'ana@example.com', ip_address: '1.2.3.4' },
      extra: { plan: { meals: ['pollo'] } },
      request: { method: 'POST', url: 'https://x.test/a?b=1', data: '{"weight":82}', headers: { cookie: 'session=1' }, cookies: 'a=b' },
      contexts: {
        os: { name: 'Android', version: '15' },
        device: { model: 'Pixel 8', name: "Ana's phone", family: 'Pixel' },
        athlete: { weightKg: 82 },
      },
      tags: { platform: 'android', athlete_weight: '82', error_code: 'restore_failed' },
      server_name: 'Ana-PC',
    });
    assert.equal(event.user, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.server_name, undefined);
    assert.deepEqual(event.request, { method: 'POST', url: 'https://x.test/a' });
    assert.deepEqual(event.contexts, { os: { name: 'Android', version: '15' }, device: { model: 'Pixel 8', family: 'Pixel' } });
    assert.deepEqual(event.tags, { platform: 'android', error_code: 'restore_failed' });
  });

  it('scrubs exception messages and strips frame variables, keeping the stack', () => {
    const event = scrubEvent({
      exception: {
        values: [{
          type: 'Error',
          value: 'sync failed for ana@example.com',
          stacktrace: { frames: [{ filename: 'app:///index.bundle', lineno: 10, vars: { weight: 82 } }] },
        }],
      },
    });
    const exception = event.exception?.values?.[0];
    assert.equal(exception?.type, 'Error');
    assert.equal(exception?.value, 'sync failed for [redacted-email]');
    assert.deepEqual(exception?.stacktrace?.frames, [{ filename: 'app:///index.bundle', lineno: 10 }]);
  });

  it('drops logentry params and filters breadcrumbs', () => {
    const event = scrubEvent({
      logentry: { message: 'saved %s', params: ['82 kg'] },
      breadcrumbs: [{ category: 'console', message: 'x' }, { category: 'navigation', data: { from: '/hoy', to: '/dieta?date=2026-10-04' } }],
    });
    assert.deepEqual(event.logentry, { message: 'saved %s' });
    assert.deepEqual(event.breadcrumbs, [{ category: 'navigation', data: { from: '/hoy', to: '/dieta' } }]);
  });

  it('does not mutate its input', () => {
    const input = { user: { id: 'u1' }, message: 'a@b.co' };
    scrubEvent(input);
    assert.deepEqual(input, { user: { id: 'u1' }, message: 'a@b.co' });
  });
});
