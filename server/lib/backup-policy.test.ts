import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_BACKUP_BYTES, sha256Hex, shrinkNeedsConfirmation, validateBackupUpload, versionsToPrune } from "./backup-policy";

function upload(payload: unknown, ownerId = "u1") {
  const payloadJson = JSON.stringify(payload);
  return { ownerId, checksum: sha256Hex(payloadJson), payloadJson };
}

const valid = {
  format: "pulso-backup",
  formatVersion: 1,
  owner: "u1",
  createdAt: 1000,
  bootstrap: { profile: null },
  tables: { workout_sessions: [{ id: "s1" }, { id: "s2" }], consumptions: [{ id: "c1" }] },
  excluded: [{ area: "progress_photos", reason: "images_stay_on_device" }],
};

describe("validateBackupUpload", () => {
  it("accepts a verified copy and counts rows from the payload", () => {
    const result = validateBackupUpload(upload(valid));
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.manifest.counts, { workout_sessions: 2, consumptions: 1 });
    assert.equal(result.manifest.totalRows, 3);
    assert.deepEqual(result.manifest.excluded, [{ area: "progress_photos", reason: "images_stay_on_device" }]);
  });

  it("rejects a payload whose checksum does not match the exact bytes", () => {
    const input = upload(valid);
    assert.deepEqual(validateBackupUpload({ ...input, payloadJson: input.payloadJson.replace("s2", "s3") }), { ok: false, error: "checksum_mismatch" });
  });

  it("rejects another account's copy", () => {
    assert.deepEqual(validateBackupUpload(upload(valid, "someone-else")), { ok: false, error: "foreign_account" });
  });

  it("rejects unknown formats and malformed tables", () => {
    assert.deepEqual(validateBackupUpload(upload({ ...valid, formatVersion: 99 })), { ok: false, error: "unsupported_format" });
    assert.deepEqual(validateBackupUpload(upload({ ...valid, format: "pulso-export" })), { ok: false, error: "invalid_payload" });
    assert.deepEqual(validateBackupUpload(upload({ ...valid, tables: { a: "x" } })), { ok: false, error: "invalid_payload" });
    const notJson = "{";
    assert.deepEqual(validateBackupUpload({ ownerId: "u1", checksum: sha256Hex(notJson), payloadJson: notJson }), { ok: false, error: "invalid_payload" });
  });

  it("rejects oversized payloads before hashing them", () => {
    const payloadJson = "x".repeat(MAX_BACKUP_BYTES + 1);
    assert.deepEqual(validateBackupUpload({ ownerId: "u1", checksum: "0", payloadJson }), { ok: false, error: "payload_too_large" });
  });
});

describe("shrinkNeedsConfirmation", () => {
  const manifest = (totalRows: number) => ({ formatVersion: 1, counts: {}, totalRows, excluded: [], createdAt: 0 });
  it("asks before a much smaller copy replaces a full one", () => {
    assert.equal(shrinkNeedsConfirmation(manifest(1000), manifest(10)), true);
    assert.equal(shrinkNeedsConfirmation(manifest(1000), manifest(900)), false);
    assert.equal(shrinkNeedsConfirmation(null, manifest(0)), false);
  });
});

describe("versionsToPrune", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ id: `b${9 - i}` }));
  it("keeps seven copies with Plus", () => {
    assert.deepEqual(versionsToPrune(rows, true, true), ["b2", "b1"]);
  });
  it("keeps only the newest verified copy without Plus", () => {
    assert.deepEqual(versionsToPrune(rows, false, true), rows.slice(1).map(row => row.id));
  });
  it("prunes nothing when the newest copy could not be verified", () => {
    assert.deepEqual(versionsToPrune(rows, false, false), []);
  });
});
