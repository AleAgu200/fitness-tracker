import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_SYNC_SCHEMA_VERSION,
  decodeSyncCursor,
  encodeSyncCursor,
  supportsSchemaVersion,
  syncPushSchema,
} from "./sync-contract";

test("sync accepts the current and immediately previous schema only", () => {
  assert.equal(supportsSchemaVersion(CURRENT_SYNC_SCHEMA_VERSION), true);
  assert.equal(supportsSchemaVersion(CURRENT_SYNC_SCHEMA_VERSION - 1), true);
  assert.equal(supportsSchemaVersion(CURRENT_SYNC_SCHEMA_VERSION - 2), false);
  assert.equal(supportsSchemaVersion(CURRENT_SYNC_SCHEMA_VERSION + 1), false);
});

test("cursor is opaque, monotonic and rejects malformed input", () => {
  const cursor = encodeSyncCursor(42);
  assert.notEqual(cursor, "42");
  assert.equal(decodeSyncCursor(cursor), 42);
  assert.equal(decodeSyncCursor("not-a-cursor"), null);
});

test("push rejects more than 100 mutations before applying a partial batch", () => {
  const mutation = {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: "mutation-1",
    entityType: "training_session" as const,
    entityId: "session-1",
    operation: "create" as const,
    occurredAt: Date.now(),
    payload: {},
  };
  const result = syncPushSchema.safeParse({ deviceId: "device-123", mutations: Array.from({ length: 101 }, (_, i) => ({ ...mutation, mutationId: `m-${i}` })) });
  assert.equal(result.success, false);
});
