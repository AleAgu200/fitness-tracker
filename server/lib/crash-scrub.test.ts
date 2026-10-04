import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scrubServerEvent, scrubServerText } from "./crash-scrub";

describe("server crash scrubbing", () => {
  it("redacts Postgres row details, emails and tokens", () => {
    assert.equal(
      scrubServerText('duplicate key: Key (email)=(ana@example.com) already exists'),
      "duplicate key: Key (email)= ([redacted]) already exists",
    );
    assert.equal(scrubServerText("Failing row contains (u1, 82.4, ana@example.com)."), "Failing row contains ([redacted]).");
    assert.equal(scrubServerText("auth Bearer abc.def"), "auth Bearer [redacted]");
  });

  it("keeps method and path of the request, never headers, cookies or body", () => {
    const event = scrubServerEvent({
      request: { method: "POST", url: "https://pulsofitness.tech/api/sync/push?x=1", headers: { authorization: "Bearer t", cookie: "s=1" }, data: "{}", cookies: {} },
      user: { id: "u1", ip_address: "1.2.3.4" },
      extra: { body: "{}" },
      server_name: "ip-10-0-0-1",
      tags: { runtime: "nodejs", userEmail: "x" },
      contexts: { runtime: { name: "node" }, culture: { locale: "es" } },
    });
    assert.deepEqual(event.request, { method: "POST", url: "https://pulsofitness.tech/api/sync/push" });
    assert.equal(event.user, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.server_name, undefined);
    assert.deepEqual(event.tags, { runtime: "nodejs" });
    assert.deepEqual(event.contexts, { runtime: { name: "node" } });
  });

  it("drops console breadcrumbs and frame variables", () => {
    const event = scrubServerEvent({
      breadcrumbs: [{ category: "console", message: "weight 82" }, { category: "http", data: { method: "GET", url: "https://api.revenuecat.com/v1/subscribers/u1?x=1", status_code: 200 } }],
      exception: { values: [{ value: "boom", stacktrace: { frames: [{ filename: "a.js", vars: { token: "t" } }] } }] },
    });
    assert.deepEqual(event.breadcrumbs, [{ category: "http", data: { method: "GET", status_code: 200, url: "https://api.revenuecat.com/v1/subscribers/u1" } }]);
    assert.deepEqual(event.exception?.values?.[0]?.stacktrace?.frames, [{ filename: "a.js" }]);
  });
});
