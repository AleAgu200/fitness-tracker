import { createAuthClient } from "better-auth/client";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

// SecureStore-backed cookie jar with in-memory fallback for Expo Go
const memStore: Record<string, string> = {};

async function getStorage() {
  try {
    const SS = await import("expo-secure-store");
    return {
      get: (key: string) => SS.getItemAsync(key),
      set: (key: string, val: string) => SS.setItemAsync(key, val),
      del: (key: string) => SS.deleteItemAsync(key),
    };
  } catch {
    return {
      get: async (key: string) => memStore[key] ?? null,
      set: async (key: string, val: string) => { memStore[key] = val; },
      del: async (key: string) => { delete memStore[key]; },
    };
  }
}

let _cookieHeader = "";

export const authClient = createAuthClient({
  baseURL: `${SERVER_URL}/api/auth`,
  fetchOptions: {
    onRequest: (ctx) => {
      // React Native has no browser Origin — set it explicitly so Better Auth's
      // CSRF check sees a trusted origin instead of blocking with 403.
      ctx.headers.set("origin", SERVER_URL);
      if (_cookieHeader) ctx.headers.set("cookie", _cookieHeader);
    },
    onResponse: async (ctx) => {
      // Log non-OK responses so we can debug server errors in Metro console
      if (!ctx.response.ok) {
        const body = await ctx.response.clone().text();
        console.error(
          `[auth] ${ctx.response.status} ${ctx.response.url}\n`,
          body,
        );
      }
      const setCookie = ctx.response.headers.get("set-cookie");
      if (setCookie) {
        _cookieHeader = setCookie.split(";")[0];
        const storage = await getStorage();
        await storage.set("pulso_cookie", _cookieHeader);
      }
    },
  },
});

export async function restoreCookieFromStorage() {
  const storage = await getStorage();
  const saved = await storage.get("pulso_cookie");
  if (saved) _cookieHeader = saved;
}

export async function clearStoredCookie() {
  _cookieHeader = "";
  const storage = await getStorage();
  await storage.del("pulso_cookie");
}
