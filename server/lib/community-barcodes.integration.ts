import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { user } from "@/db/schema";
import { contributeCommunityProduct, findCommunityProduct } from "@/lib/community-barcodes";
import { COMMUNITY_ATTRIBUTION } from "@/lib/community-product";

async function seedAthlete(): Promise<string> {
  const id = `athlete_${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({ id, name: "Atleta Catálogo", email: `${id}@pulso.test`, role: "athlete", createdAt: now, updatedAt: now });
  return id;
}

// A per-run code (valid EAN-13 check digit not required here: storage doesn't validate).
const barcode = () => `99${Date.now()}`.slice(0, 13);

const product = (kcal: number) => ({
  productName: "Avena integral",
  brand: null,
  basis: { amount: 100, unit: "g" as const },
  serving: null,
  nutrients: { kcal, proteinG: 11, carbsG: 68, fatG: 6.5, fiberG: null, sugarsG: null, saturatedFatG: null, sodiumMg: null },
});

test("a contributed product is found by the next scan, for anyone", async () => {
  const code = barcode();
  assert.equal(await findCommunityProduct(code), null);
  await contributeCommunityProduct(code, await seedAthlete(), product(380));
  const draft = await findCommunityProduct(code);
  assert.equal(draft?.nutrients.kcal, 380);
  assert.equal(draft?.attribution, COMMUNITY_ATTRIBUTION);
});

test("an athlete replaces only their own contribution; the newest one is served", async () => {
  const code = barcode() + "1";
  const first = await seedAthlete();
  const second = await seedAthlete();
  const t = Date.now();
  await contributeCommunityProduct(code, first, product(380), t);
  await contributeCommunityProduct(code, second, product(390), t + 1);
  assert.equal((await findCommunityProduct(code))?.nutrients.kcal, 390);
  await contributeCommunityProduct(code, first, product(385), t + 2);
  assert.equal((await findCommunityProduct(code))?.nutrients.kcal, 385);
});
