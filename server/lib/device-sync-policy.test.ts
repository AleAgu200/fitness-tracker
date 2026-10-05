import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { incomingWins, validateChange } from "./device-sync-policy";

const NOW = 1_800_000_000_000;

describe("validateChange", () => {
  it("accepts a known table owned by the athlete", () => {
    assert.equal(validateChange({ table: "logged_sets", id: "s1", op: "upsert", payload: { id: "s1", reps: 8 }, changedAt: NOW }, "u1", NOW), null);
    assert.equal(validateChange({ table: "consumptions", id: "c1", op: "upsert", payload: { id: "c1", athleteId: "u1" }, changedAt: NOW }, "u1", NOW), null);
    assert.equal(validateChange({ table: "consumptions", id: "c1", op: "delete", changedAt: NOW }, "u1", NOW), null);
  });

  it("refuses unknown tables, other accounts and bad payloads", () => {
    assert.equal(validateChange({ table: "user", id: "u1", op: "upsert", payload: {}, changedAt: NOW }, "u1", NOW), "unknown_table");
    assert.equal(validateChange({ table: "health_samples", id: "h1", op: "upsert", payload: {}, changedAt: NOW }, "u1", NOW), "unknown_table");
    assert.equal(validateChange({ table: "consumptions", id: "c1", op: "upsert", payload: { athleteId: "u2" }, changedAt: NOW }, "u1", NOW), "foreign_account");
    assert.equal(validateChange({ table: "consumptions", id: "", op: "upsert", payload: {}, changedAt: NOW }, "u1", NOW), "invalid_id");
    assert.equal(validateChange({ table: "consumptions", id: "c1", op: "upsert", payload: [1], changedAt: NOW }, "u1", NOW), "invalid_payload");
    assert.equal(validateChange({ table: "consumptions", id: "c1", op: "upsert", payload: { n: "x".repeat(70_000) }, changedAt: NOW }, "u1", NOW), "payload_too_large");
  });

  it("refuses a clock far in the future, which would win every conflict", () => {
    assert.equal(validateChange({ table: "programs", id: "p1", op: "delete", changedAt: NOW + 3 * 86_400_000 }, "u1", NOW), "invalid_time");
  });
});

describe("incomingWins", () => {
  it("lets the most recent change win", () => {
    assert.equal(incomingWins(null, { changedAt: 1, deviceId: "a" }), true);
    assert.equal(incomingWins({ changedAt: 10, deviceId: "a" }, { changedAt: 11, deviceId: "a" }), true);
    assert.equal(incomingWins({ changedAt: 10, deviceId: "a" }, { changedAt: 9, deviceId: "z" }), false);
  });

  it("breaks exact ties by device so all devices agree", () => {
    assert.equal(incomingWins({ changedAt: 10, deviceId: "a" }, { changedAt: 10, deviceId: "b" }), true);
    assert.equal(incomingWins({ changedAt: 10, deviceId: "b" }, { changedAt: 10, deviceId: "a" }), false);
  });
});
