import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { passwordMustGoOnLink } from "./auth-linking";

describe("passwordMustGoOnLink", () => {
  it("drops a password nobody proved when Google joins the account", () => {
    assert.equal(passwordMustGoOnLink({ providerId: "google", emailVerified: false, linkedBySignedInOwner: false }), true);
    assert.equal(passwordMustGoOnLink({ providerId: "apple", emailVerified: false, linkedBySignedInOwner: false }), true);
  });

  it("keeps the password of a confirmed address", () => {
    assert.equal(passwordMustGoOnLink({ providerId: "google", emailVerified: true, linkedBySignedInOwner: false }), false);
  });

  it("keeps the password when its owner links from Perfil", () => {
    assert.equal(passwordMustGoOnLink({ providerId: "google", emailVerified: false, linkedBySignedInOwner: true }), false);
  });

  it("never applies to the password account itself", () => {
    assert.equal(passwordMustGoOnLink({ providerId: "credential", emailVerified: false, linkedBySignedInOwner: false }), false);
  });
});
