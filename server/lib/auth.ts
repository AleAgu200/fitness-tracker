import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { socialProvidersFromEnv } from "@/lib/auth-providers";
import { emailEnabled, passwordResetEmail, sendEmail, verificationEmail } from "@/lib/email";

// Recovery and verification only exist when email can really be delivered;
// without it Better Auth answers "not enabled" and the app says so honestly.
const canEmail = emailEnabled();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    autoSignIn: true,
    // Off until every existing account had a chance to verify; turning it on
    // would lock out athletes who signed up before verification existed.
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
    // One-time link, one hour. A new password ends every other session.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    ...(canEmail ? {
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(passwordResetEmail(user.email, url));
      },
    } : {}),
  },

  ...(canEmail ? {
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(verificationEmail(user.email, url));
      },
    },
  } : {}),

  socialProviders: socialProvidersFromEnv(process.env),

  account: {
    accountLinking: {
      // A Google or Apple sign-in never joins an existing PULSO account just
      // because the address matches; linking needs the athlete signed in.
      disableImplicitLinking: true,
    },
  },

  rateLimit: {
    customRules: {
      // Each of these sends an email: keep them scarce per client.
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/send-verification-email": { window: 15 * 60, max: 3 },
    },
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
