import assert from "node:assert/strict";
import test from "node:test";

import { parseOverviewPeriod, progressState } from "@/lib/progress-policy";

test("a missing permission is never shown as empty data", () => {
  assert.equal(progressState("revoked", 12), "revoked");
  assert.equal(progressState("not_authorized", 0), "not_authorized");
  assert.equal(progressState("granted", 0), "empty");
  assert.equal(progressState("granted", 3), "ok");
});

test("only 7, 28 and 90 day ranges are accepted, 28 by default", () => {
  assert.equal(parseOverviewPeriod(null), 28);
  assert.equal(parseOverviewPeriod("7"), 7);
  assert.equal(parseOverviewPeriod("90"), 90);
  assert.equal(parseOverviewPeriod("30"), null);
  assert.equal(parseOverviewPeriod("abc"), null);
});
