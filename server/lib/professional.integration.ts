import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { POST as professionalSignup } from "@/app/api/portal/signup/route";
import { db } from "@/db";
import { professionalProfiles, professionalSettings, user } from "@/db/schema";
import { createExercise } from "@/lib/library";
import { getProfessionalProfile, updateProfessionalProfile, updateProfessionalSettings } from "@/lib/professional-profile";

test("professional signup provisions profile, settings, organization and exercise provenance", async () => {
  const nonce = randomUUID();
  const email = `coach-${nonce}@pulso.test`;
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const request = new Request(`${baseUrl}/api/portal/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(baseUrl).origin },
    body: JSON.stringify({
      name: "Coach Integration",
      email,
      password: "test1234",
      discipline: "coach",
      organizationName: "PULSO Lab",
      signupCode: process.env.PROFESSIONAL_SIGNUP_CODE,
    }),
  });

  const response = await professionalSignup(request);
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie") ?? "", /session_token/i);

  const [createdUser] = await db.select().from(user).where(eq(user.email, email));
  assert.equal(createdUser.role, "coach");
  assert.equal((await db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, createdUser.id))).length, 1);
  assert.equal((await db.select().from(professionalSettings).where(eq(professionalSettings.userId, createdUser.id))).length, 1);

  await updateProfessionalProfile(createdUser.id, {
    name: "Coach Integration Updated",
    organizationName: "PULSO Performance Lab",
    headline: "Fuerza y rendimiento",
    bio: "Trabajo basado en progresiones medibles.",
    phone: null,
    location: "Tegucigalpa",
    timezone: "America/Tegucigalpa",
    credentials: "CSCS",
  });
  await updateProfessionalSettings(createdUser.id, {
    emailNotifications: false,
    attentionDigest: true,
    weeklySummary: true,
    defaultPortalSection: "exercises",
  });
  const profile = await getProfessionalProfile(createdUser.id);
  assert.equal(profile?.name, "Coach Integration Updated");
  assert.equal(profile?.organizationName, "PULSO Performance Lab");

  const first = await createExercise(createdUser.id, {
    name: "Integration squat",
    muscleGroup: "piernas",
    equipment: "barra",
    source: "workoutx",
    externalId: `wx-${nonce}`,
    mediaUrl: "https://example.com/squat.gif",
    instructions: "Controlar la profundidad.",
  });
  const repeated = await createExercise(createdUser.id, {
    name: "Integration squat",
    muscleGroup: "piernas",
    equipment: "barra",
    source: "workoutx",
    externalId: `wx-${nonce}`,
  });
  assert.equal(first.duplicate, false);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.exercise.id, first.exercise.id);
});
