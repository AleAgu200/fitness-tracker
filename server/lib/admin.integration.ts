import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { adminAuditEvents, catalogExercises, organizationMemberships, session, user } from "@/db/schema";
import { AdminActionError, applyUserAction, getUserDetail, listProfessionals, listUsers, reviewProfessional } from "@/lib/admin";
import { adminCreateFood, adminDeleteFood, createCatalogExercise, setCatalogExerciseHidden } from "@/lib/admin-catalog";
import { effectiveRole } from "@/lib/admin-policy";
import { ensureCatalogOverlay } from "@/lib/catalog-overlay";
import { getCatalogExercise, searchCatalog, setCatalogOverrides } from "@/lib/exercise-catalog";
import { listFoods } from "@/lib/library";
import { initializeProfessionalAccount } from "@/lib/professional-profile";

async function seedUser(role: string, extra: Partial<typeof user.$inferInsert> = {}) {
  const id = `adm_${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({ id, name: `Test ${role}`, email: `${id}@pulso.test`, role, createdAt: now, updatedAt: now, ...extra });
  return id;
}

test("admin: a professional sign-up waits for review and approval activates the workspace", async () => {
  const actor = await seedUser("athlete", { isSuperAdmin: true });
  const proId = await seedUser("athlete");
  await db.update(user).set({ role: "coach" }).where(eq(user.id, proId));
  await initializeProfessionalAccount({ userId: proId, name: "Pro", discipline: "coach", reviewStatus: "pending" });

  const [pending] = await db.select().from(user).where(eq(user.id, proId));
  assert.equal(effectiveRole(pending.role, pending.professionalStatus), "athlete", "no portal access while pending");
  const [membership] = await db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, proId));
  assert.equal(membership.status, "invited");
  assert.ok((await listProfessionals("pending")).some(p => p.id === proId));

  await reviewProfessional({ id: actor }, proId, "approve");
  const [approved] = await db.select().from(user).where(eq(user.id, proId));
  assert.equal(effectiveRole(approved.role, approved.professionalStatus), "coach");
  const [active] = await db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, proId));
  assert.equal(active.status, "active");

  await reviewProfessional({ id: actor }, proId, "reject", "credenciales vencidas");
  const [revoked] = await db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, proId));
  assert.equal(revoked.status, "revoked");
  const audit = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.subjectId, proId));
  assert.deepEqual(audit.map(a => a.action).sort(), ["professional.approved", "professional.rejected"]);
});

test("admin: suspension signs the user out and super admins cannot be touched", async () => {
  const actor = await seedUser("athlete", { isSuperAdmin: true });
  const other = await seedUser("athlete", { isSuperAdmin: true });
  const target = await seedUser("athlete");
  const now = new Date();
  await db.insert(session).values({ id: `s_${randomUUID()}`, token: randomUUID(), userId: target, expiresAt: new Date(Date.now() + 86_400_000), createdAt: now, updatedAt: now });

  await applyUserAction({ id: actor }, target, { action: "suspend", reason: "spam" });
  assert.equal((await db.select().from(session).where(eq(session.userId, target))).length, 0);
  const detail = await getUserDetail(target);
  assert.ok(detail?.suspendedAt);
  assert.ok((await listUsers({ status: "suspended", q: target })).users.some(u => u.id === target));

  await assert.rejects(applyUserAction({ id: actor }, other, { action: "suspend" }), AdminActionError);
  await assert.rejects(applyUserAction({ id: actor }, actor, { action: "set_role", role: "coach" }), AdminActionError);

  await applyUserAction({ id: actor }, target, { action: "reactivate" });
  assert.equal((await getUserDetail(target))?.suspendedAt, null);
});

test("admin: promoting to a professional opens an approved workspace, demoting revokes it", async () => {
  const actor = await seedUser("athlete", { isSuperAdmin: true });
  const target = await seedUser("athlete");
  await applyUserAction({ id: actor }, target, { action: "set_role", role: "nutritionist" });
  const [promoted] = await db.select().from(user).where(eq(user.id, target));
  assert.equal(effectiveRole(promoted.role, promoted.professionalStatus), "nutritionist");
  assert.equal((await db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, target)))[0]?.status, "active");

  await applyUserAction({ id: actor }, target, { action: "set_role", role: "athlete" });
  assert.equal((await db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, target)))[0]?.status, "revoked");
});

test("admin: catalog edits reach search and deleted base foods are not re-seeded", async () => {
  const actor = await seedUser("athlete", { isSuperAdmin: true });
  const name = `Ejercicio integración ${randomUUID().slice(0, 8)}`;
  const id = await createCatalogExercise(actor, { name, muscleGroup: "core", equipment: "otro", target: "abs", secondaryMuscles: [], instructions: "x", mediaPath: null });
  assert.equal(searchCatalog(name, 1)[0]?.id, id);
  await setCatalogExerciseHidden(actor, id, true);
  assert.equal(getCatalogExercise(id), undefined);

  const foodName = `Alimento ${randomUUID().slice(0, 8)}`;
  const created = await adminCreateFood(actor, { name: foodName, category: "otro", kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 });
  if (!created.id) throw new Error("food was not created");
  assert.deepEqual(await adminCreateFood(actor, { name: foodName.toUpperCase(), category: "otro", kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }), { error: "duplicate_name" });
  assert.ok(await adminDeleteFood(actor, created.id));
  assert.ok(!(await listFoods(foodName)).some(f => f.name === foodName));

  await db.delete(catalogExercises).where(eq(catalogExercises.id, id));
  setCatalogOverrides([]);
  await ensureCatalogOverlay();
});
