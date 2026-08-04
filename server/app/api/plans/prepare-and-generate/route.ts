import { getSessionUser, unauthorized } from "@/lib/api-auth";
import {
  assembleAndGenerate,
  rawGenerationRequestSchema,
} from "@/lib/generation/assemble";
import {
  GenerationTimeoutError,
  GenerationValidationError,
} from "@/lib/generation/openrouter";

/**
 * POST /api/plans/prepare-and-generate
 * Body: raw onboarding answers and body stats. Catalog assembly, eligibility
 * filtering, target calculation, and plan generation all happen server-side.
 *
 * Never log the request body: it contains onboarding-derived health data.
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsedInput = rawGenerationRequestSchema.safeParse(body);
  if (!parsedInput.success) {
    return Response.json(
      {
        error: "invalid_input",
        issues: parsedInput.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  try {
    const result = await assembleAndGenerate(parsedInput.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      console.error("[plans/prepare-and-generate] upstream timeout");
      return Response.json({ error: "generation_timeout", retryable: true }, { status: 504 });
    }
    if (error instanceof GenerationValidationError) {
      return Response.json({ error: "generation_invalid", issues: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.startsWith("openrouter_key_missing") ||
      message.startsWith("openrouter_model_missing") ||
      message.startsWith("openrouter_model_must_be_pinned")
    ) {
      console.error("[plans/prepare-and-generate] misconfigured:", message);
      return Response.json({ error: "generation_unavailable" }, { status: 500 });
    }
    if (message === "openrouter_empty_response" || message.startsWith("openrouter_")) {
      console.error("[plans/prepare-and-generate] upstream error:", message);
      return Response.json({ error: "generation_upstream_error" }, { status: 502 });
    }
    console.error("[plans/prepare-and-generate] unexpected error:", message);
    return Response.json({ error: "generation_failed" }, { status: 500 });
  }
}
