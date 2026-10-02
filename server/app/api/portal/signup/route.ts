import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { initialProfessionalStatus } from "@/lib/admin-policy";
import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { googleWebSignInEnabled } from "@/lib/auth-providers";
import { emailEnabled, professionalRequestEmail, sendEmail } from "@/lib/email";
import { canFinishProfessionalSignup } from "@/lib/portal-access";
import { initializeProfessionalAccount } from "@/lib/professional-profile";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  discipline: z.enum(["coach", "nutritionist"]),
  organizationName: z.string().trim().max(100).optional(),
  signupCode: z.string().max(120).optional(),
});

const finishSchema = signupSchema.pick({ discipline: true, organizationName: true, signupCode: true });

/** Tells the new professional their account is waiting for review. */
async function notifyRequest(to: string, name: string, discipline: "coach" | "nutritionist") {
  if (initialProfessionalStatus() === "pending" && emailEnabled()) {
    await sendEmail(professionalRequestEmail(to, name, discipline));
  }
}

/** What the portal's login/signup screen should offer. */
export function GET() {
  return Response.json({
    requiresCode: Boolean(process.env.PROFESSIONAL_SIGNUP_CODE),
    // New professionals wait for a super admin's review (PROFESSIONAL_APPROVAL=off disables it).
    requiresApproval: initialProfessionalStatus() === "pending",
    magicLink: emailEnabled(),
    // Sign-in and sign-up: a new Google account finishes its setup with PUT.
    google: googleWebSignInEnabled(process.env),
  });
}

/**
 * Finishes a sign-up that started with Google: Better Auth already created the
 * account, this gives it the professional workspace the email form would have.
 */
export async function PUT(request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return unauthorized();
  let input: z.infer<typeof finishSchema>;
  try {
    input = finishSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const requiredCode = process.env.PROFESSIONAL_SIGNUP_CODE;
  if (requiredCode && input.signupCode !== requiredCode) {
    return Response.json({ error: "invalid_signup_code" }, { status: 403 });
  }

  const [account] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, sessionUser.id));
  if (!account || !canFinishProfessionalSignup(sessionUser.role, account.createdAt)) return forbidden();

  await initializeProfessionalAccount({
    userId: sessionUser.id,
    name: sessionUser.name,
    discipline: input.discipline,
    organizationName: input.organizationName,
    reviewStatus: initialProfessionalStatus(),
  });
  await notifyRequest(sessionUser.email, sessionUser.name, input.discipline);
  return Response.json({ ok: true, status: initialProfessionalStatus() });
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
      reviewStatus: initialProfessionalStatus(),
    });
  } catch (error) {
    console.error("[professional signup setup error]", error);
    await db.delete(user).where(eq(user.id, userId)).catch(() => undefined);
    return Response.json({ error: "professional_setup_failed" }, { status: 500 });
  }

  await notifyRequest(input.email, input.name, input.discipline);
  const responseHeaders = new Headers(authResponse.headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify({ ok: true, status: initialProfessionalStatus() }), {
    status: 201,
    headers: responseHeaders,
  });
}
