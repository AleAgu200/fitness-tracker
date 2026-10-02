import { mediaContentType, readMedia } from "@/lib/media-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const relative = (await params).path.join("/");
  const body = await readMedia(relative);
  const contentType = mediaContentType(relative);
  if (!body || !contentType) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      // Names are random and never reused, so the file can be cached forever.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
