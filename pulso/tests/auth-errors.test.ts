/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTH_ERROR_MESSAGES, classifyAuthError } from '../src/lib/auth-errors';

describe('classifyAuthError', () => {
  it('uses Better Auth codes', () => {
    assert.equal(classifyAuthError({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }), 'invalid_credentials');
    assert.equal(classifyAuthError({ status: 403, code: 'EMAIL_NOT_VERIFIED' }), 'email_not_verified');
    assert.equal(classifyAuthError({ status: 422, code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }), 'user_exists');
    assert.equal(classifyAuthError({ status: 400, code: 'PASSWORD_TOO_SHORT' }), 'weak_password');
    assert.equal(classifyAuthError({ status: 400, code: 'RESET_PASSWORD_DISABLED' }), 'feature_unavailable');
  });

  it('never reads a bare 422 as an existing account', () => {
    assert.equal(classifyAuthError({ status: 422 }), 'unknown');
    assert.equal(classifyAuthError({ status: 422, code: 'VALIDATION_ERROR' }), 'unknown');
  });

  it('tells no connection, rate limits and server failures apart', () => {
    assert.equal(classifyAuthError({ status: 0 }), 'offline');
    assert.equal(classifyAuthError({}), 'offline');
    assert.equal(classifyAuthError({ status: 429 }), 'rate_limited');
    assert.equal(classifyAuthError({ status: 503 }), 'temporary');
  });

  it('tells a suspended account apart from wrong credentials', () => {
    assert.equal(classifyAuthError({ status: 403, code: 'ACCOUNT_SUSPENDED' }), 'account_suspended');
    assert.equal(classifyAuthError({ status: 0, code: 'MAGIC_LINK_INVALID' }), 'link_expired');
  });

  it('explains an unlinked social account without merging it', () => {
    assert.equal(classifyAuthError({ status: 401, code: 'OAUTH_LINK_ERROR', message: 'account not linked' }), 'account_not_linked');
    assert.equal(classifyAuthError({ status: 401, code: 'OAUTH_LINK_ERROR', message: 'unable to create user' }), 'temporary');
    assert.equal(classifyAuthError({ status: 401, code: 'INVALID_TOKEN' }), 'social_invalid');
  });

  it('has a message for every kind except a cancelled social sign-in', () => {
    for (const [kind, message] of Object.entries(AUTH_ERROR_MESSAGES)) {
      if (kind === 'social_cancelled') assert.equal(message, '');
      else assert.ok(message.length > 0, kind);
    }
  });
});
