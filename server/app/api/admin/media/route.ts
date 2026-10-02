import { recordAdminAction } from "@/lib/admin";
import { badRequest } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";
import { MAX_MEDIA_BYTES, storeMedia } from "@/lib/media-storage";

/** Multipart upload of one exercise animation (field "file"). */
export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 64 * 1024) return badRequest("too_large", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("invalid_body");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("missing_file");
  if (file.size > MAX_MEDIA_BYTES) return badRequest("too_large", 413);

  const result = await storeMedia("exercises", new Uint8Array(await file.arrayBuffer()));
  if ("error" in result) return badRequest(result.error, result.error === "too_large" ? 413 : 415);
  await recordAdminAction({ actorUserId: admin.id, action: "media.upload", subjectType: "media", subjectId: result.path, metadata: { size: file.size } });
  return Response.json(result, { status: 201 });
}
