import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database("./data/auth.db"),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    autoSignIn: true,
  },

  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),

  onAPIError: {
    onError(error, ctx) {
      const request = (ctx as { request?: Request }).request;
      console.error("[Better Auth error]", {
        path:    request?.url,
        method:  request?.method,
        origin:  request?.headers?.get?.("origin"),
        status:  (error as any)?.statusCode,
        message: (error as any)?.message ?? String(error),
      });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,        // 30 days
    updateAge: 60 * 60 * 24,             // refresh token if older than 1 day
    // cookieCache stays off: it makes Better Auth set a second, short-lived
    // (5 min) cookie alongside the real session cookie. The mobile client
    // only captures a single Set-Cookie value (no real cookie jar), so once
    // that second cookie won the capture it made every request 401 after
    // 5 minutes with no way to fall back to the real session token.
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "athlete",
        input: false,
      },
      // Gates admin-only features (e.g. the PULSO tab). Never settable via the
      // API (input: false) — only server/scripts/grant-superadmin.mjs can flip it.
      isSuperAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User    = typeof auth.$Infer.Session.user;
