export type DetailedMuscleKey =
  | 'chest'
  | 'upper_back'
  | 'lower_back'
  | 'trapezius'
  | 'deltoids'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'upper_abs'
  | 'lower_abs'
  | 'abs'
  | 'obliques'
  | 'quadriceps'
  | 'hamstrings'
  | 'gluteals'
  | 'adductors'
  | 'calves'
  | 'tibialis'
  | 'neck';

type BroadMuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full' | null;

const FALLBACKS: Record<Exclude<BroadMuscleGroup, null>, DetailedMuscleKey[]> = {
  chest: ['chest', 'triceps', 'deltoids'],
  back: ['upper_back', 'biceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'gluteals'],
  shoulders: ['deltoids', 'trapezius', 'triceps'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['upper_abs', 'lower_abs', 'obliques'],
  full: ['chest', 'upper_back', 'deltoids', 'quadriceps', 'hamstrings', 'gluteals', 'upper_abs'],
};

const RULES: { terms: string[]; muscles: DetailedMuscleKey[] }[] = [
  { terms: ['sentadilla', 'squat'], muscles: ['quadriceps', 'gluteals', 'hamstrings', 'adductors'] },
  { terms: ['peso muerto', 'deadlift'], muscles: ['hamstrings', 'gluteals', 'lower_back', 'upper_back', 'forearms'] },
  { terms: ['hip thrust', 'puente de glúteo', 'glute bridge'], muscles: ['gluteals', 'hamstrings'] },
  { terms: ['prensa de pierna', 'leg press'], muscles: ['quadriceps', 'gluteals', 'hamstrings'] },
  { terms: ['zancada', 'lunge', 'split squat'], muscles: ['quadriceps', 'gluteals', 'hamstrings', 'adductors'] },
  { terms: ['extensión de pierna', 'leg extension'], muscles: ['quadriceps'] },
  { terms: ['curl femoral', 'leg curl'], muscles: ['hamstrings'] },
  { terms: ['aductor', 'adduction'], muscles: ['adductors'] },
  { terms: ['gemelo', 'pantorrilla', 'calf raise'], muscles: ['calves'] },
  { terms: ['tibial', 'tibialis'], muscles: ['tibialis'] },
  { terms: ['press banca', 'bench press', 'chest press'], muscles: ['chest', 'triceps', 'deltoids'] },
  { terms: ['apertura', 'fly', 'pec deck'], muscles: ['chest', 'deltoids'] },
  { terms: ['fondos', 'dips'], muscles: ['chest', 'triceps', 'deltoids'] },
  { terms: ['press militar', 'overhead press', 'shoulder press'], muscles: ['deltoids', 'triceps', 'trapezius'] },
  { terms: ['elevación lateral', 'lateral raise'], muscles: ['deltoids', 'trapezius'] },
  { terms: ['face pull', 'pájaros', 'reverse fly'], muscles: ['deltoids', 'upper_back', 'trapezius'] },
  { terms: ['encogimiento', 'shrug'], muscles: ['trapezius'] },
  { terms: ['dominada', 'pull-up', 'pullup', 'jalón', 'lat pulldown'], muscles: ['upper_back', 'biceps', 'forearms'] },
  { terms: ['remo', 'row'], muscles: ['upper_back', 'biceps', 'forearms', 'trapezius'] },
  { terms: ['hiperextensión', 'back extension'], muscles: ['lower_back', 'gluteals', 'hamstrings'] },
  { terms: ['curl de bíceps', 'bicep curl', 'curl martillo', 'hammer curl'], muscles: ['biceps', 'forearms'] },
  { terms: ['curl de muñeca', 'wrist curl'], muscles: ['forearms'] },
  { terms: ['extensión de tríceps', 'tricep extension', 'pushdown', 'rompecráneos'], muscles: ['triceps'] },
  { terms: ['plancha', 'plank'], muscles: ['upper_abs', 'lower_abs', 'obliques'] },
  { terms: ['crunch', 'abdominal'], muscles: ['upper_abs', 'lower_abs'] },
  { terms: ['elevación de piernas', 'leg raise'], muscles: ['lower_abs'] },
  { terms: ['russian twist', 'giro ruso', 'woodchop'], muscles: ['obliques'] },
];

export function inferExerciseMuscles(
  exerciseName: string,
  broadGroup: BroadMuscleGroup,
): DetailedMuscleKey[] {
  const normalized = exerciseName.trim().toLocaleLowerCase('es');
  const matched = RULES.find(rule => rule.terms.some(term => normalized.includes(term)));
  if (matched) return matched.muscles;
  return broadGroup ? FALLBACKS[broadGroup] : [];
}

export function exerciseTargetsMuscle(
  exerciseMuscles: DetailedMuscleKey[],
  selected: string,
): boolean {
  if (selected === 'abs') {
    return exerciseMuscles.some(key => ['abs', 'upper_abs', 'lower_abs'].includes(key));
  }
  return exerciseMuscles.includes(selected as DetailedMuscleKey);
}

export const DETAILED_MUSCLE_LABELS: Record<DetailedMuscleKey, string> = {
  chest: 'PECTORALES',
  upper_back: 'ESPALDA ALTA',
  lower_back: 'LUMBARES',
  trapezius: 'TRAPECIO',
  deltoids: 'DELTOIDES',
  biceps: 'BÍCEPS',
  triceps: 'TRÍCEPS',
  forearms: 'ANTEBRAZOS',
  upper_abs: 'ABDOMINAL SUPERIOR',
  lower_abs: 'ABDOMINAL INFERIOR',
  abs: 'ABDOMINALES',
  obliques: 'OBLICUOS',
  quadriceps: 'CUÁDRICEPS',
  hamstrings: 'ISQUIOTIBIALES',
  gluteals: 'GLÚTEOS',
  adductors: 'ADUCTORES',
  calves: 'GEMELOS',
  tibialis: 'TIBIAL ANTERIOR',
  neck: 'CUELLO',
};

export interface PopularExercise {
  name: string;
  sets: number;
  reps: number;
  weight: number;
  step: number;
}

export const POPULAR_EXERCISES: Record<DetailedMuscleKey, PopularExercise[]> = {
  chest: [
    { name: 'Press banca', sets: 4, reps: 8, weight: 40, step: 2.5 },
    { name: 'Press inclinado con mancuernas', sets: 3, reps: 10, weight: 16, step: 2 },
    { name: 'Aperturas con mancuernas', sets: 3, reps: 12, weight: 8, step: 2 },
  ],
  upper_back: [
    { name: 'Dominadas', sets: 4, reps: 8, weight: 0, step: 1 },
    { name: 'Remo con barra', sets: 4, reps: 10, weight: 40, step: 2.5 },
    { name: 'Jalón al pecho', sets: 3, reps: 10, weight: 35, step: 2.5 },
  ],
  lower_back: [
    { name: 'Peso muerto', sets: 3, reps: 5, weight: 60, step: 5 },
    { name: 'Hiperextensión lumbar', sets: 3, reps: 12, weight: 0, step: 2.5 },
    { name: 'Buenos días con barra', sets: 3, reps: 10, weight: 20, step: 2.5 },
  ],
  trapezius: [
    { name: 'Encogimientos con mancuernas', sets: 4, reps: 12, weight: 20, step: 2 },
    { name: 'Face pull', sets: 3, reps: 15, weight: 15, step: 2.5 },
    { name: 'Remo al mentón', sets: 3, reps: 10, weight: 20, step: 2.5 },
  ],
  deltoids: [
    { name: 'Press militar', sets: 4, reps: 8, weight: 25, step: 2.5 },
    { name: 'Elevación lateral', sets: 3, reps: 12, weight: 6, step: 2 },
    { name: 'Pájaros con mancuernas', sets: 3, reps: 12, weight: 6, step: 2 },
  ],
  biceps: [
    { name: 'Curl de bíceps con barra', sets: 3, reps: 10, weight: 15, step: 2.5 },
    { name: 'Curl martillo', sets: 3, reps: 12, weight: 8, step: 2 },
    { name: 'Curl inclinado con mancuernas', sets: 3, reps: 10, weight: 7, step: 2 },
  ],
  triceps: [
    { name: 'Extensión de tríceps en polea', sets: 3, reps: 12, weight: 15, step: 2.5 },
    { name: 'Press francés', sets: 3, reps: 10, weight: 12, step: 2.5 },
    { name: 'Fondos', sets: 3, reps: 8, weight: 0, step: 1 },
  ],
  forearms: [
    { name: 'Curl de muñeca', sets: 3, reps: 15, weight: 8, step: 2 },
    { name: 'Curl inverso con barra', sets: 3, reps: 12, weight: 12, step: 2.5 },
    { name: 'Caminata del granjero', sets: 3, reps: 30, weight: 20, step: 2 },
  ],
  upper_abs: [
    { name: 'Crunch abdominal', sets: 3, reps: 15, weight: 0, step: 1 },
    { name: 'Crunch en polea', sets: 3, reps: 12, weight: 15, step: 2.5 },
    { name: 'Sit-up', sets: 3, reps: 15, weight: 0, step: 1 },
  ],
  lower_abs: [
    { name: 'Elevación de piernas', sets: 3, reps: 12, weight: 0, step: 1 },
    { name: 'Crunch inverso', sets: 3, reps: 15, weight: 0, step: 1 },
    { name: 'Mountain climbers', sets: 3, reps: 30, weight: 0, step: 1 },
  ],
  abs: [
    { name: 'Plancha', sets: 3, reps: 30, weight: 0, step: 1 },
    { name: 'Crunch abdominal', sets: 3, reps: 15, weight: 0, step: 1 },
    { name: 'Dead bug', sets: 3, reps: 12, weight: 0, step: 1 },
  ],
  obliques: [
    { name: 'Giro ruso', sets: 3, reps: 20, weight: 5, step: 2 },
    { name: 'Plancha lateral', sets: 3, reps: 30, weight: 0, step: 1 },
    { name: 'Woodchop en polea', sets: 3, reps: 12, weight: 12.5, step: 2.5 },
  ],
  quadriceps: [
    { name: 'Sentadilla', sets: 4, reps: 6, weight: 60, step: 5 },
    { name: 'Prensa de pierna', sets: 4, reps: 10, weight: 80, step: 5 },
    { name: 'Extensión de pierna', sets: 3, reps: 12, weight: 25, step: 2.5 },
  ],
  hamstrings: [
    { name: 'Peso muerto rumano', sets: 4, reps: 8, weight: 50, step: 5 },
    { name: 'Curl femoral', sets: 3, reps: 12, weight: 25, step: 2.5 },
    { name: 'Buenos días con barra', sets: 3, reps: 10, weight: 20, step: 2.5 },
  ],
  gluteals: [
    { name: 'Hip thrust', sets: 4, reps: 10, weight: 60, step: 5 },
    { name: 'Sentadilla búlgara', sets: 3, reps: 10, weight: 12, step: 2 },
    { name: 'Patada de glúteo en polea', sets: 3, reps: 12, weight: 10, step: 2.5 },
  ],
  adductors: [
    { name: 'Aductor en máquina', sets: 3, reps: 15, weight: 25, step: 2.5 },
    { name: 'Sentadilla sumo', sets: 4, reps: 10, weight: 30, step: 5 },
    { name: 'Zancada lateral', sets: 3, reps: 10, weight: 8, step: 2 },
  ],
  calves: [
    { name: 'Elevación de gemelos de pie', sets: 4, reps: 15, weight: 20, step: 2.5 },
    { name: 'Elevación de gemelos sentado', sets: 4, reps: 15, weight: 20, step: 2.5 },
    { name: 'Gemelos en prensa', sets: 3, reps: 15, weight: 50, step: 5 },
  ],
  tibialis: [
    { name: 'Elevación tibial', sets: 3, reps: 20, weight: 0, step: 1 },
    { name: 'Dorsiflexión con banda', sets: 3, reps: 15, weight: 0, step: 1 },
    { name: 'Caminata sobre talones', sets: 3, reps: 30, weight: 0, step: 1 },
  ],
  neck: [
    { name: 'Flexión cervical isométrica', sets: 3, reps: 20, weight: 0, step: 1 },
    { name: 'Extensión cervical isométrica', sets: 3, reps: 20, weight: 0, step: 1 },
    { name: 'Inclinación cervical lateral', sets: 3, reps: 15, weight: 0, step: 1 },
  ],
};
