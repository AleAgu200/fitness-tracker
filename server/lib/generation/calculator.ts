// Deterministic calorie/macro targets and safety screening. The LLM never
// computes these — everything here is plain arithmetic so results are
// reproducible and auditable, independent of which model generates the plan.

export type Sex = 'M' | 'F' | 'X';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'fat_loss' | 'muscle_gain' | 'strength' | 'recomposition' | 'maintenance';
export type Pace = 'slow' | 'moderate' | 'aggressive';

export interface CalculatorInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  pace: Pace;
}

export interface CalculatorResult {
  bmr: number;
  tdee: number;
  dailyCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
  assumptions: string[];
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'sedentario',
  light: 'actividad ligera',
  moderate: 'actividad moderada',
  active: 'activo',
  very_active: 'muy activo',
};

// Fraction of TDEE added/subtracted by goal + desired pace
const GOAL_PACE_ADJUSTMENT: Record<Goal, Record<Pace, number>> = {
  fat_loss: { slow: -0.10, moderate: -0.20, aggressive: -0.25 },
  muscle_gain: { slow: 0.05, moderate: 0.10, aggressive: 0.15 },
  recomposition: { slow: -0.05, moderate: -0.10, aggressive: -0.10 },
  strength: { slow: 0, moderate: 0.05, aggressive: 0.08 },
  maintenance: { slow: 0, moderate: 0, aggressive: 0 },
};

const PROTEIN_G_PER_KG: Record<Goal, number> = {
  fat_loss: 2.2,
  muscle_gain: 1.9,
  recomposition: 2.1,
  strength: 1.8,
  maintenance: 1.6,
};

const FAT_PCT_OF_CALORIES = 0.28;

// Never prescribe below these regardless of the calculated deficit — a floor,
// not a target; the actual recommendation for very low BMRs should come from
// a professional, which is exactly what the safety screening below flags.
const MIN_SAFE_CALORIES: Record<Sex, number> = { M: 1500, F: 1200, X: 1350 };

function bmrMifflinStJeor(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === 'M') return base + 5;
  if (sex === 'F') return base - 161;
  return base - 78; // 'X' — midpoint of the M/F offsets, no better default exists
}

export function calculateTargets(input: CalculatorInput): CalculatorResult {
  const bmr = bmrMifflinStJeor(input.sex, input.weightKg, input.heightCm, input.ageYears);
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
  const adjustment = GOAL_PACE_ADJUSTMENT[input.goal][input.pace];

  const assumptions: string[] = [
    `Tasa metabólica basal estimada (Mifflin-St Jeor): ${Math.round(bmr)} kcal`,
    `Gasto energético total estimado: ${Math.round(tdee)} kcal (${ACTIVITY_LABELS[input.activityLevel]})`,
  ];

  let dailyCalories = Math.round(tdee * (1 + adjustment));
  const floor = MIN_SAFE_CALORIES[input.sex];
  if (dailyCalories < floor) {
    assumptions.push(`Calorías ajustadas al mínimo seguro de ${floor} kcal — el ritmo elegido implicaba un déficit mayor`);
    dailyCalories = floor;
  }

  const proteinGrams = Math.round(input.weightKg * PROTEIN_G_PER_KG[input.goal]);
  const fatGrams = Math.round((dailyCalories * FAT_PCT_OF_CALORIES) / 9);
  const proteinKcal = proteinGrams * 4;
  const fatKcal = fatGrams * 9;
  const carbsKcal = Math.max(0, dailyCalories - proteinKcal - fatKcal);
  const carbsGrams = Math.round(carbsKcal / 4);

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), dailyCalories, proteinGrams, fatGrams, carbsGrams, assumptions };
}

// ── safety screening ─────────────────────────────────────────────────────────
// A "no" here means automatic generation should stop and recommend professional
// review instead — this never blocks the app, only the auto-generation path.

export interface SafetyScreeningInput {
  ageYears: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  isPregnantOrBreastfeeding?: boolean;
  hasEatingDisorderHistory?: boolean;
  hasUncontrolledMedicalCondition?: boolean;
}

export interface SafetyScreeningResult {
  eligibleForAutoGeneration: boolean;
  reasons: string[];
}

const MIN_AUTO_GENERATION_AGE = 16;
const MIN_SAFE_BMI = 16;
const MAX_SAFE_BMI = 45;

export function screenSafety(input: SafetyScreeningInput): SafetyScreeningResult {
  const reasons: string[] = [];

  if (input.ageYears < MIN_AUTO_GENERATION_AGE) {
    reasons.push('Menor de 16 años: requiere revisión de un profesional');
  }
  if (input.isPregnantOrBreastfeeding) {
    reasons.push('Embarazo o lactancia: requiere revisión de un profesional');
  }
  if (input.hasEatingDisorderHistory) {
    reasons.push('Historial de trastorno alimentario: requiere revisión de un profesional');
  }
  if (input.hasUncontrolledMedicalCondition) {
    reasons.push('Condición médica no controlada: requiere revisión de un profesional');
  }

  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  if (bmi < MIN_SAFE_BMI || bmi > MAX_SAFE_BMI) {
    reasons.push(`IMC fuera del rango seguro para generación automática (${bmi.toFixed(1)})`);
  }

  return { eligibleForAutoGeneration: reasons.length === 0, reasons };
}
