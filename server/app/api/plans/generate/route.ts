import { getSessionUser, unauthorized } from "@/lib/api-auth";
import {
  GenerationTimeoutError,
  GenerationValidationError,
  generatePlan,
} from "@/lib/generation/openrouter";
import { generationInputSchema } from "@/lib/generation/schema";

/**
 * POST /api/plans/generate
 * Body: GenerationInput (targets + profile summary + eligible foods/exercises —
 * all already computed/filtered by the deterministic pipeline upstream).
 *
 * Stateless for now: no plan_generation_jobs persistence, idempotency, or rate
 * limiting yet — those land with the onboarding/data-model phase. Never logs
 * the request body (it may carry onboarding-derived health data).
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

  const parsedInput = generationInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return Response.json(
      { error: "invalid_input", issues: parsedInput.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  try {
    const plan = await generatePlan(parsedInput.data);
    return Response.json({ plan });
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      console.error("[plans/generate] upstream timeout");
      return Response.json({ error: "generation_timeout", retryable: true }, { status: 504 });
    }
    if (error instanceof GenerationValidationError) {
      return Response.json({ error: "generation_invalid", issues: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("openrouter_key_missing") || message.startsWith("openrouter_model_missing") || message.startsWith("openrouter_model_must_be_pinned")) {
      console.error("[plans/generate] misconfigured:", message);
      return Response.json({ error: "generation_unavailable" }, { status: 500 });
    }
    if (message === "openrouter_empty_response" || message.startsWith("openrouter_")) {
      console.error("[plans/generate] upstream error:", message);
      return Response.json({ error: "generation_upstream_error" }, { status: 502 });
    }
    console.error("[plans/generate] unexpected error:", message);
    return Response.json({ error: "generation_failed" }, { status: 500 });
  }
}
