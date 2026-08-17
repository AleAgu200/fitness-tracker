import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { initializeProfessionalAccount } from "@/lib/professional-profile";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  discipline: z.enum(["coach", "nutritionist"]),
  organizationName: z.string().trim().max(100).optional(),
  signupCode: z.string().max(120).optional(),
});

export function GET() {
  return Response.json({ requiresCode: Boolean(process.env.PROFESSIONAL_SIGNUP_CODE) });
}

export async function POST(request: Request) {
  let input: z.infer<typeof signupSchema>;
  try {
    input = signupSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const requiredCode = process.env.PROFESSIONAL_SIGNUP_CODE;
  if (requiredCode && input.signupCode !== requiredCode) {
    return Response.json({ error: "invalid_signup_code" }, { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const authRequest = new Request(new URL("/api/auth/sign-up/email", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
    }),
  });
  const authResponse = await auth.handler(authRequest);
  if (!authResponse.ok) return authResponse;

  const payload = await authResponse.clone().json() as { user?: { id?: string } };
  const userId = payload.user?.id;
  if (!userId) return Response.json({ error: "signup_failed" }, { status: 500 });

  try {
    await initializeProfessionalAccount({
      userId,
      name: input.name,
      discipline: input.discipline,
      organizationName: input.organizationName,
    });
  } catch (error) {
    console.error("[professional signup setup error]", error);
    await db.delete(user).where(eq(user.id, userId)).catch(() => undefined);
    return Response.json({ error: "professional_setup_failed" }, { status: 500 });
  }

  const responseHeaders = new Headers(authResponse.headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: responseHeaders,
  });
}
