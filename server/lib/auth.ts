import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { passwordMustGoOnLink } from "@/lib/auth-linking";
import { socialProvidersFromEnv } from "@/lib/auth-providers";
import { emailEnabled, magicLinkEmail, magicLinkNoAccountEmail, passwordResetEmail, sendEmail, verificationEmail, welcomeEmail } from "@/lib/email";
import { appMagicLinkUrl, isAppClient } from "@/lib/magic-link";

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
    // A new account confirms its address before it can sign in. Only possible
    // when email is delivered; REQUIRE_EMAIL_VERIFICATION=false is the escape
    // hatch if delivery breaks. Unverified accounts get "confirm your email" with
    // a resend button (app and portal) instead of a session.
    requireEmailVerification: canEmail && process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
    // One-time link, one hour. A new password ends every other session.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    ...(canEmail ? {
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(passwordResetEmail(user.email, url, user.name));
      },
    } : {}),
  },

  ...(canEmail ? {
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(verificationEmail(user.email, url, user.name));
      },
    },
  } : {}),

  socialProviders: socialProvidersFromEnv(process.env),

  account: {
    accountLinking: {
      // Google or Apple sign-in joins the PULSO account with the same
      // (provider-verified) address, even one never confirmed here: the hook
      // below drops whatever password that account carried.
      requireLocalEmailVerified: false,
    },
  },

  plugins: canEmail ? [
    // Passwordless sign-in for the portal and the app. The app asks with
    // metadata { client: "app", scheme }, and its email points to a web page
    // that hands the one-time token to the app (lib/magic-link.ts): mail
    // clients drop custom-scheme links.
    magicLink({
      expiresIn: 10 * 60,
      storeToken: "hashed",
      rateLimit: { window: 15 * 60, max: 3 },
      // Sign-in only: creating an account needs a name and the onboarding
      // consent, so magic links never sign anyone up.
      disableSignUp: true,
      sendMagicLink: async ({ email, url, token, metadata }, ctx) => {
        const forApp = isAppClient(metadata);
        const existing = await ctx?.context.internalAdapter.findUserByEmail(email);
        if (!existing) {
          await sendEmail(magicLinkNoAccountEmail(email, forApp));
          return;
        }
        // Suspended accounts get nothing: the session would be refused anyway.
        if ((existing.user as { suspendedAt?: Date | null }).suspendedAt) return;
        const appUrl = forApp ? appMagicLinkUrl(token, metadata) : null;
        await sendEmail(magicLinkEmail(email, appUrl ?? url, forApp));
      },
    }),
  ] : [],

  databaseHooks: {
    session: {
      create: {
        // A suspended account can't sign in by any method (password, Google,
        // Apple, magic link): no session is ever created for it.
        before: async (session, ctx) => {
          const owner = await ctx?.context.internalAdapter.findUserById(session.userId);
          if ((owner as { suspendedAt?: Date | null } | null)?.suspendedAt) {
            throw new APIError("FORBIDDEN", { message: "Account suspended", code: "ACCOUNT_SUSPENDED" });
          }
        },
      },
    },
    user: {
      create: {
        // The welcome email speaks to athletes, so it goes only to accounts the
        // app creates; professionals get their own email from the portal flow.
        after: async (created, ctx) => {
          if (!canEmail || !isAppClient({ client: ctx?.request?.headers.get("x-pulso-client") ?? undefined })) return;
          await sendEmail(welcomeEmail(created.email, created.name));
        },
      },
    },
    account: {
      create: {
        // "before" runs ahead of Better Auth marking the address verified, so
        // `emailVerified` still says whether the password's owner proved it.
        before: async (account, ctx) => {
          if (!ctx || account.providerId === "credential") return;
          const internal = ctx.context.internalAdapter;
          const passwords = (await internal.findAccounts(account.userId))
            .filter(existing => existing.providerId === "credential");
          if (!passwords.length) return;
          const owner = await internal.findUserById(account.userId);
          if (!owner) return;
          const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)
            .catch(() => null);
          const current = ctx.context.session ?? (token ? await internal.findSession(token) : null);
          const linkedBySignedInOwner = current?.session.userId === account.userId
            && new Date(current.session.expiresAt).getTime() > Date.now();
          if (!passwordMustGoOnLink({ providerId: account.providerId, emailVerified: owner.emailVerified, linkedBySignedInOwner })) return;
          for (const password of passwords) await internal.deleteAccount(password.id);
          await internal.deleteUserSessions(account.userId);
        },
      },
    },
  },

  rateLimit: {
    customRules: {
      // Each of these sends an email: keep them scarce per client.
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/send-verification-email": { window: 15 * 60, max: 3 },
      "/sign-in/magic-link": { window: 15 * 60, max: 3 },
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
      // Review state of a professional account (lib/admin-policy.ts). Only the
      // portal's sign-up flow and the admin panel set it.
      professionalStatus: {
        type: "string",
        required: false,
        input: false,
      },
      // Set by the admin panel; the session hook above refuses sign-in.
      suspendedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User    = typeof auth.$Infer.Session.user;
