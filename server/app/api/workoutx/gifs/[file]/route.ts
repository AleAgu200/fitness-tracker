import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { fetchGif } from "@/lib/workoutx";

/**
 * GET /api/workoutx/gifs/<id>.gif — authenticated GIF proxy.
 * The WorkoutX key is added server-side and is never sent to the browser.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const { file } = await params;
    const upstream = await fetchGif(file);

    if (!upstream.ok) {
      const status = upstream.status === 404 || upstream.status === 429
        ? upstream.status
        : 502;
      return Response.json({ error: `workoutx_${upstream.status}` }, { status });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/gif";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return Response.json({ error: "workoutx_invalid_gif_response" }, { status: 502 });
    }

    const headers = new Headers({
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${file}"`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "workoutx_error";
    const status = message === "workoutx_invalid_gif"
      ? 400
      : message === "workoutx_key_missing"
        ? 503
        : 502;
    return Response.json({ error: message }, { status });
  }
}
