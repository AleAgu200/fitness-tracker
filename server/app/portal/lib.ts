// Client-side helpers and types shared by portal pages.

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface Athlete {
  linkId: string;
  kind: string;
  userId: string;
  name: string;
  email: string;
  since: number;
}

export interface Msg {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: number;
  readAt: number | null;
}

export interface Food {
  id: string;
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdBy: string | null;
}

export interface LibraryExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  createdBy: string | null;
}

export const FOOD_CATEGORIES = ["proteína", "carbohidrato", "grasa", "fruta", "verdura", "lácteo", "otro"];
export const MUSCLE_GROUPS = ["pecho", "espalda", "piernas", "hombros", "brazos", "core", "full body"];
export const EQUIPMENT = ["barra", "mancuernas", "polea", "máquina", "peso corporal", "otro"];

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
