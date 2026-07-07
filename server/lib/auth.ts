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
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "athlete",
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User    = typeof auth.$Infer.Session.user;
