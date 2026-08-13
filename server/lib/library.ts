import { randomBytes } from "crypto";

import { and, asc, eq, ilike } from "drizzle-orm";

import { db } from "@/db";
import { libraryExercises, libraryFoods } from "@/db/schema";

export interface Food {
  id: string;
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdBy: string | null;
  createdAt: number;
}

export interface LibraryExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  createdBy: string | null;
  createdAt: number;
}

export const FOOD_CATEGORIES = ["proteína", "carbohidrato", "grasa", "fruta", "verdura", "lácteo", "otro"] as const;
export const MUSCLE_GROUPS = ["pecho", "espalda", "piernas", "hombros", "brazos", "core", "full body"] as const;
export const EQUIPMENT = ["barra", "mancuernas", "polea", "máquina", "peso corporal", "otro"] as const;

function newId(): string {
  return randomBytes(12).toString("hex");
}

// ── seed (per 100 g for foods) ───────────────────────────────────────────────

const SEED_FOODS: Omit<Food, "id" | "createdBy" | "createdAt">[] = [
  { name: "Pechuga de pollo",   category: "proteína",     kcal: 165, proteinG: 31,   carbsG: 0,    fatG: 3.6 },
  { name: "Carne magra (nalga)",category: "proteína",     kcal: 155, proteinG: 28,   carbsG: 0,    fatG: 4.5 },
  { name: "Huevo entero",       category: "proteína",     kcal: 143, proteinG: 12.6, carbsG: 0.7,  fatG: 9.5 },
  { name: "Clara de huevo",     category: "proteína",     kcal: 52,  proteinG: 10.9, carbsG: 0.7,  fatG: 0.2 },
  { name: "Merluza",            category: "proteína",     kcal: 90,  proteinG: 17,   carbsG: 0,    fatG: 2.2 },
  { name: "Atún al natural",    category: "proteína",     kcal: 116, proteinG: 26,   carbsG: 0,    fatG: 1 },
  { name: "Proteína whey",      category: "proteína",     kcal: 400, proteinG: 80,   carbsG: 8,    fatG: 6 },
  { name: "Arroz blanco cocido",category: "carbohidrato", kcal: 130, proteinG: 2.7,  carbsG: 28,   fatG: 0.3 },
  { name: "Avena",              category: "carbohidrato", kcal: 389, proteinG: 16.9, carbsG: 66,   fatG: 6.9 },
  { name: "Papa hervida",       category: "carbohidrato", kcal: 87,  proteinG: 1.9,  carbsG: 20,   fatG: 0.1 },
  { name: "Batata",             category: "carbohidrato", kcal: 86,  proteinG: 1.6,  carbsG: 20,   fatG: 0.1 },
  { name: "Fideos cocidos",     category: "carbohidrato", kcal: 158, proteinG: 5.8,  carbsG: 31,   fatG: 0.9 },
  { name: "Pan integral",       category: "carbohidrato", kcal: 247, proteinG: 13,   carbsG: 41,   fatG: 3.4 },
  { name: "Lentejas cocidas",   category: "carbohidrato", kcal: 116, proteinG: 9,    carbsG: 20,   fatG: 0.4 },
  { name: "Palta",              category: "grasa",        kcal: 160, proteinG: 2,    carbsG: 8.5,  fatG: 14.7 },
  { name: "Aceite de oliva",    category: "grasa",        kcal: 884, proteinG: 0,    carbsG: 0,    fatG: 100 },
  { name: "Maní",               category: "grasa",        kcal: 567, proteinG: 25.8, carbsG: 16,   fatG: 49 },
  { name: "Almendras",          category: "grasa",        kcal: 579, proteinG: 21.2, carbsG: 21.6, fatG: 49.9 },
  { name: "Banana",             category: "fruta",        kcal: 89,  proteinG: 1.1,  carbsG: 22.8, fatG: 0.3 },
  { name: "Manzana",            category: "fruta",        kcal: 52,  proteinG: 0.3,  carbsG: 13.8, fatG: 0.2 },
  { name: "Frutillas",          category: "fruta",        kcal: 32,  proteinG: 0.7,  carbsG: 7.7,  fatG: 0.3 },
  { name: "Brócoli",            category: "verdura",      kcal: 34,  proteinG: 2.8,  carbsG: 6.6,  fatG: 0.4 },
  { name: "Espinaca",           category: "verdura",      kcal: 23,  proteinG: 2.9,  carbsG: 3.6,  fatG: 0.4 },
  { name: "Tomate",             category: "verdura",      kcal: 18,  proteinG: 0.9,  carbsG: 3.9,  fatG: 0.2 },
  { name: "Yogur griego natural",category: "lácteo",      kcal: 97,  proteinG: 9,    carbsG: 3.9,  fatG: 5 },
  { name: "Queso port salut light",category: "lácteo",    kcal: 230, proteinG: 24,   carbsG: 2,    fatG: 14 },
  { name: "Leche descremada",   category: "lácteo",       kcal: 35,  proteinG: 3.4,  carbsG: 5,    fatG: 0.1 },

  // ── básicos hondureños/latinos ──
  // Values per 100 g, edible portion. The generator can only propose what is in
  // this table, so a catalog without local staples produces plans nobody cooks —
  // and one without enough protein-dense entries makes the macro fitter miss its
  // targets and burn a correction call.
  { name: "Frijol rojo cocido", category: "carbohidrato", kcal: 127, proteinG: 8.7,  carbsG: 22.8, fatG: 0.5 },
  { name: "Frijol negro cocido",category: "carbohidrato", kcal: 132, proteinG: 8.9,  carbsG: 23.7, fatG: 0.5 },
  { name: "Garbanzo cocido",    category: "carbohidrato", kcal: 164, proteinG: 8.9,  carbsG: 27.4, fatG: 2.6 },
  { name: "Tortilla de maíz",   category: "carbohidrato", kcal: 218, proteinG: 5.7,  carbsG: 44.6, fatG: 2.8 },
  { name: "Tortilla de harina", category: "carbohidrato", kcal: 306, proteinG: 8.2,  carbsG: 51.4, fatG: 7.4 },
  { name: "Plátano verde cocido",category: "carbohidrato",kcal: 121, proteinG: 1.1,  carbsG: 29.2, fatG: 0.1 },
  { name: "Tajadas de plátano frito",category: "carbohidrato",kcal: 309,proteinG: 1.5,carbsG: 49.2,fatG: 11.8 },
  { name: "Yuca cocida",        category: "carbohidrato", kcal: 112, proteinG: 0.8,  carbsG: 27,   fatG: 0.2 },
  { name: "Elote (maíz dulce)", category: "carbohidrato", kcal: 86,  proteinG: 3.3,  carbsG: 19,   fatG: 1.2 },

  { name: "Tilapia",            category: "proteína",     kcal: 96,  proteinG: 20.1, carbsG: 0,    fatG: 1.7 },
  { name: "Camarón",            category: "proteína",     kcal: 85,  proteinG: 20.1, carbsG: 0,    fatG: 0.5 },
  { name: "Carne molida de res 90/10",category: "proteína",kcal: 176, proteinG: 20,  carbsG: 0,    fatG: 10 },
  { name: "Chuleta de cerdo magra",category: "proteína",  kcal: 143, proteinG: 21,   carbsG: 0,    fatG: 6 },
  { name: "Muslo de pollo sin piel",category: "proteína", kcal: 119, proteinG: 19.7, carbsG: 0,    fatG: 3.9 },

  { name: "Queso fresco",       category: "lácteo",       kcal: 299, proteinG: 18.2, carbsG: 3.9,  fatG: 23.8 },
  { name: "Cuajada",            category: "lácteo",       kcal: 174, proteinG: 14.5, carbsG: 3.2,  fatG: 11.5 },
  { name: "Crema",              category: "lácteo",       kcal: 198, proteinG: 2.4,  carbsG: 4.6,  fatG: 19.4 },
  { name: "Requesón",           category: "lácteo",       kcal: 98,  proteinG: 11.1, carbsG: 3.4,  fatG: 4.3 },
  { name: "Leche entera",       category: "lácteo",       kcal: 61,  proteinG: 3.2,  carbsG: 4.8,  fatG: 3.3 },

  { name: "Papaya",             category: "fruta",        kcal: 43,  proteinG: 0.5,  carbsG: 10.8, fatG: 0.3 },
  { name: "Piña",               category: "fruta",        kcal: 50,  proteinG: 0.5,  carbsG: 13.1, fatG: 0.1 },
  { name: "Mango",              category: "fruta",        kcal: 60,  proteinG: 0.8,  carbsG: 15,   fatG: 0.4 },
  { name: "Sandía",             category: "fruta",        kcal: 30,  proteinG: 0.6,  carbsG: 7.6,  fatG: 0.2 },
  { name: "Naranja",            category: "fruta",        kcal: 47,  proteinG: 0.9,  carbsG: 11.8, fatG: 0.1 },

  { name: "Repollo",            category: "verdura",      kcal: 25,  proteinG: 1.3,  carbsG: 5.8,  fatG: 0.1 },
  { name: "Zanahoria",          category: "verdura",      kcal: 41,  proteinG: 0.9,  carbsG: 9.6,  fatG: 0.2 },
  { name: "Chile dulce",        category: "verdura",      kcal: 31,  proteinG: 1,    carbsG: 6,    fatG: 0.3 },
  { name: "Cebolla",            category: "verdura",      kcal: 40,  proteinG: 1.1,  carbsG: 9.3,  fatG: 0.1 },
  { name: "Pepino",             category: "verdura",      kcal: 15,  proteinG: 0.7,  carbsG: 3.6,  fatG: 0.1 },
  { name: "Coliflor",           category: "verdura",      kcal: 25,  proteinG: 1.9,  carbsG: 5,    fatG: 0.3 },

  // Plant proteins. Without these the vegan catalog held exactly one
  // protein-dense food, which is the case where the macro fitter cannot reach
  // the protein target and spends a correction call failing at it.
  { name: "Tofu firme",         category: "proteína",     kcal: 144, proteinG: 17.3, carbsG: 2.8,  fatG: 8.7 },
  { name: "Tempeh",             category: "proteína",     kcal: 192, proteinG: 20.3, carbsG: 7.6,  fatG: 10.8 },
  { name: "Seitán",             category: "proteína",     kcal: 370, proteinG: 75,   carbsG: 14,   fatG: 1.9 },
  { name: "Soya texturizada",   category: "proteína",     kcal: 327, proteinG: 51,   carbsG: 33,   fatG: 1.2 },
  { name: "Edamame",            category: "proteína",     kcal: 121, proteinG: 11.9, carbsG: 8.9,  fatG: 5.2 },
  { name: "Proteína vegetal en polvo",category: "proteína",kcal: 375, proteinG: 80,  carbsG: 7,    fatG: 3 },
  { name: "Quinoa cocida",      category: "carbohidrato", kcal: 120, proteinG: 4.4,  carbsG: 21.3, fatG: 1.9 },

  { name: "Semillas de chía",   category: "grasa",        kcal: 486, proteinG: 16.5, carbsG: 42.1, fatG: 30.7 },
  { name: "Marañón (semilla)",  category: "grasa",        kcal: 553, proteinG: 18.2, carbsG: 30.2, fatG: 43.8 },
  { name: "Mantequilla",        category: "grasa",        kcal: 717, proteinG: 0.9,  carbsG: 0.1,  fatG: 81.1 },
];

const SEED_EXERCISES: Omit<LibraryExercise, "id" | "createdBy" | "createdAt">[] = [
  { name: "Sentadilla",             muscleGroup: "piernas",   equipment: "barra" },
  { name: "Sentadilla frontal",     muscleGroup: "piernas",   equipment: "barra" },
  { name: "Peso muerto",            muscleGroup: "espalda",   equipment: "barra" },
  { name: "Peso muerto rumano",     muscleGroup: "piernas",   equipment: "barra" },
  { name: "Prensa 45°",             muscleGroup: "piernas",   equipment: "máquina" },
  { name: "Estocadas",              muscleGroup: "piernas",   equipment: "mancuernas" },
  { name: "Press banca",            muscleGroup: "pecho",     equipment: "barra" },
  { name: "Press inclinado c/ mancuernas", muscleGroup: "pecho", equipment: "mancuernas" },
  { name: "Aperturas en polea",     muscleGroup: "pecho",     equipment: "polea" },
  { name: "Flexiones de brazos",    muscleGroup: "pecho",     equipment: "peso corporal" },
  { name: "Press militar",          muscleGroup: "hombros",   equipment: "barra" },
  { name: "Vuelos laterales",       muscleGroup: "hombros",   equipment: "mancuernas" },
  { name: "Dominadas",              muscleGroup: "espalda",   equipment: "peso corporal" },
  { name: "Remo con barra",         muscleGroup: "espalda",   equipment: "barra" },
  { name: "Jalón al pecho",         muscleGroup: "espalda",   equipment: "polea" },
  { name: "Remo en polea baja",     muscleGroup: "espalda",   equipment: "polea" },
  { name: "Curl de bíceps",         muscleGroup: "brazos",    equipment: "mancuernas" },
  { name: "Extensiones de tríceps en polea", muscleGroup: "brazos", equipment: "polea" },
  { name: "Plancha",                muscleGroup: "core",      equipment: "peso corporal" },
  { name: "Rueda abdominal",        muscleGroup: "core",      equipment: "otro" },
  { name: "Burpees",                muscleGroup: "full body", equipment: "peso corporal" },
  { name: "Clean & press",          muscleGroup: "full body", equipment: "barra" },
];

// Top up by name rather than only seeding an empty table: every existing local
// and deployed database was created before the Honduran/Latin staples were
// added, and an all-or-nothing seed would never reach them. Entries a
// nutritionist edited or created keep their own values — only names absent from
// the table are inserted.
let seedPromise: Promise<void> | null = null;

async function seed(): Promise<void> {
  const existingFoods = await db.select({ name: libraryFoods.name }).from(libraryFoods);
  const existingFoodNames = new Set(existingFoods.map(f => f.name));
  const newFoods = SEED_FOODS.filter(f => !existingFoodNames.has(f.name));
  if (newFoods.length) {
    const now = Date.now();
    await db.insert(libraryFoods).values(
      newFoods.map(f => ({ id: newId(), ...f, createdBy: null, createdAt: now })),
    );
  }

  const existingExercises = await db.select({ name: libraryExercises.name }).from(libraryExercises);
  const existingExerciseNames = new Set(existingExercises.map(e => e.name));
  const newExercises = SEED_EXERCISES.filter(e => !existingExerciseNames.has(e.name));
  if (newExercises.length) {
    const now = Date.now();
    await db.insert(libraryExercises).values(
      newExercises.map(e => ({ id: newId(), ...e, createdBy: null, createdAt: now })),
    );
  }
}

function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = seed();
  return seedPromise;
}

// ── foods CRUD ───────────────────────────────────────────────────────────────

export async function listFoods(q = ""): Promise<Food[]> {
  await ensureSeeded();
  return db.select().from(libraryFoods)
    .where(ilike(libraryFoods.name, `%${q}%`))
    .orderBy(asc(libraryFoods.category), asc(libraryFoods.name));
}

export async function createFood(userId: string, f: { name: string; category: string; kcal: number; proteinG: number; carbsG: number; fatG: number }): Promise<Food> {
  await ensureSeeded();
  const food: Food = { id: newId(), ...f, createdBy: userId, createdAt: Date.now() };
  await db.insert(libraryFoods).values(food);
  return food;
}

/** Only the creator can modify custom items; seeded items are read-only */
export async function updateFood(userId: string, id: string, f: { name: string; category: string; kcal: number; proteinG: number; carbsG: number; fatG: number }): Promise<boolean> {
  const result = await db.update(libraryFoods)
    .set(f)
    .where(and(eq(libraryFoods.id, id), eq(libraryFoods.createdBy, userId)));
  return (result.count ?? 0) > 0;
}

export async function deleteFood(userId: string, id: string): Promise<boolean> {
  const result = await db.delete(libraryFoods).where(and(eq(libraryFoods.id, id), eq(libraryFoods.createdBy, userId)));
  return (result.count ?? 0) > 0;
}

// ── exercises CRUD ───────────────────────────────────────────────────────────

export async function listExercises(q = ""): Promise<LibraryExercise[]> {
  await ensureSeeded();
  return db.select().from(libraryExercises)
    .where(ilike(libraryExercises.name, `%${q}%`))
    .orderBy(asc(libraryExercises.muscleGroup), asc(libraryExercises.name));
}

export async function createExercise(userId: string, e: { name: string; muscleGroup: string; equipment: string }): Promise<LibraryExercise> {
  await ensureSeeded();
  const ex: LibraryExercise = { id: newId(), ...e, createdBy: userId, createdAt: Date.now() };
  await db.insert(libraryExercises).values(ex);
  return ex;
}

export async function updateExercise(userId: string, id: string, e: { name: string; muscleGroup: string; equipment: string }): Promise<boolean> {
  const result = await db.update(libraryExercises)
    .set(e)
    .where(and(eq(libraryExercises.id, id), eq(libraryExercises.createdBy, userId)));
  return (result.count ?? 0) > 0;
}

export async function deleteExercise(userId: string, id: string): Promise<boolean> {
  const result = await db.delete(libraryExercises).where(and(eq(libraryExercises.id, id), eq(libraryExercises.createdBy, userId)));
  return (result.count ?? 0) > 0;
}
