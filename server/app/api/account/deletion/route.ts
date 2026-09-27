import {
  cancelAccountDeletion,
  getPendingDeletion,
  ProfessionalAccountError,
  requestAccountDeletion,
} from "@/lib/account";
import { getSessionUser, unauthorized } from "@/lib/api-auth";

/** GET /api/account/deletion — the athlete's pending deletion, if any. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json({ deletion: await getPendingDeletion(user.id) });
}

/**
 * POST /api/account/deletion — schedule the account for deletion after the
 * grace period. Signs out every session, including the caller's.
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return Response.json({ error: "professional_account" }, { status: 409 });
  try {
    return Response.json({ deletion: await requestAccountDeletion(user.id) });
  } catch (error) {
    if (error instanceof ProfessionalAccountError) {
      return Response.json({ error: "professional_account" }, { status: 409 });
    }
    throw error;
  }
}

/** DELETE /api/account/deletion — cancel a pending deletion. */
export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const cancelled = await cancelAccountDeletion(user.id);
  if (!cancelled) return Response.json({ error: "no_pending_deletion" }, { status: 404 });
  return Response.json({ deletion: null });
}
