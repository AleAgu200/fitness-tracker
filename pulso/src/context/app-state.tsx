import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { getAthleteProfile, getLatestWeight } from '@/db/profile';
import { useSession } from './session';

export type MealStatus = 'cumplido' | 'sustituido' | 'pendiente';
export type MetricKey = 'peso' | 'grasa' | 'musculo';

export interface ExerciseSet {
  reps: number;
  peso: number;
  rpe: number;
  pr: boolean;
}

export interface Exercise {
  id: string;
  nombre: string;
  sub: string;
  target: number;
  reps: number;
  peso: number;
  step: number;
  basePR: number;
}

export interface Meal {
  id: string;
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface UserProfile {
  name: string;
  initials: string;
  firstName: string;
}

export interface AppState {
  profile: UserProfile | null;
  racha: number;
  mealStatus: Record<string, MealStatus>;
  mealNotes: Record<string, string>;
  meals: Meal[];
  water: number;
  exercises: Exercise[];
  exIndex: number;
  log: Record<string, ExerciseSet[]>;
  prMap: Record<string, number>;
  curReps: number;
  curPeso: number;
  curRpe: number;
  editingEx: boolean;
  addingEx: boolean;
  draft: { nombre: string; target: number; reps: number; peso: number; step: number };
  restActive: boolean;
  restLeft: number;
  prFlash: { ej: string; val: string } | null;
  metric: MetricKey;
  weighIn: number;
  pesoHist: number[];
  weighed: boolean;
}

const initialState: AppState = {
  profile: null,
  racha: 0,
  mealStatus: {},
  mealNotes: {},
  meals: [],
  water: 0,
  exercises: [],
  exIndex: 0,
  log: {},
  prMap: {},
  curReps: 8,
  curPeso: 0,
  curRpe: 8,
  editingEx: false,
  addingEx: false,
  draft: { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5 },
  restActive: false,
  restLeft: 90,
  prFlash: null,
  metric: 'peso',
  weighIn: 70.0,
  pesoHist: [],
  weighed: false,
};

interface AppContextValue {
  state: AppState;
  setMeal: (id: string, st: MealStatus) => void;
  setMealNote: (id: string, txt: string) => void;
  setWater: (n: number) => void;
  selectEx: (i: number) => void;
  incPeso: () => void;
  decPeso: () => void;
  incReps: () => void;
  decReps: () => void;
  setRpe: (v: number) => void;
  guardarSet: () => void;
  startEditEx: () => void;
  startAddEx: () => void;
  cancelExForm: () => void;
  setDraft: (f: keyof AppState['draft'], v: string | number) => void;
  saveEditEx: () => void;
  saveAddEx: () => void;
  deleteEx: () => void;
  addRest: () => void;
  skipRest: () => void;
  dismissPrFlash: () => void;
  setMetric: (m: MetricKey) => void;
  incWeighIn: () => void;
  decWeighIn: () => void;
  registrarPeso: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const { userId } = useSession();
  const restTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load profile and latest weight from DB when user signs in
  useEffect(() => {
    if (!userId) {
      setState(initialState);
      return;
    }
    (async () => {
      try {
        const [p, latestWeight] = await Promise.all([
          getAthleteProfile(userId),
          getLatestWeight(userId),
        ]);
        if (!p) return;
        const firstName = p.fullName.split(' ')[0];
        setState(s => ({
          ...s,
          profile: { name: p.fullName, initials: p.initials, firstName },
          ...(latestWeight != null ? { weighIn: latestWeight } : {}),
        }));
      } catch {
        // Profile not yet created or DB error — app continues with blank state
      }
    })();
  }, [userId]);

  useEffect(() => () => {
    if (restTimer.current) clearInterval(restTimer.current);
    if (prTimer.current) clearTimeout(prTimer.current);
  }, []);

  const startRest = useCallback(() => {
    if (restTimer.current) clearInterval(restTimer.current);
    restTimer.current = setInterval(() => {
      setState(s => {
        if (s.restLeft <= 1) {
          if (restTimer.current) clearInterval(restTimer.current);
          return { ...s, restLeft: 0, restActive: false };
        }
        return { ...s, restLeft: s.restLeft - 1 };
      });
    }, 1000);
  }, []);

  const setMeal = useCallback((id: string, st: MealStatus) =>
    setState(s => ({ ...s, mealStatus: { ...s.mealStatus, [id]: st } })), []);

  const setMealNote = useCallback((id: string, txt: string) =>
    setState(s => ({ ...s, mealNotes: { ...s.mealNotes, [id]: txt } })), []);

  const setWater = useCallback((n: number) =>
    setState(s => ({ ...s, water: s.water === n ? n - 1 : n })), []);

  const selectEx = useCallback((i: number) =>
    setState(s => {
      const e = s.exercises[i];
      if (!e) return s;
      return { ...s, exIndex: i, curReps: e.reps, curPeso: e.peso, curRpe: 8, editingEx: false, addingEx: false };
    }), []);

  const incPeso = useCallback(() =>
    setState(s => {
      const e = s.exercises[s.exIndex];
      if (!e) return s;
      return { ...s, curPeso: +(s.curPeso + e.step).toFixed(1) };
    }), []);

  const decPeso = useCallback(() =>
    setState(s => {
      const e = s.exercises[s.exIndex];
      if (!e) return s;
      return { ...s, curPeso: Math.max(0, +(s.curPeso - e.step).toFixed(1)) };
    }), []);

  const incReps = useCallback(() =>
    setState(s => ({ ...s, curReps: s.curReps + 1 })), []);

  const decReps = useCallback(() =>
    setState(s => ({ ...s, curReps: Math.max(1, s.curReps - 1) })), []);

  const setRpe = useCallback((v: number) =>
    setState(s => ({ ...s, curRpe: v })), []);

  const guardarSet = useCallback(() => {
    setState(s => {
      const ex = s.exercises[s.exIndex];
      if (!ex) return s;
      const prev = s.prMap[ex.id] || 0;
      const isPR = s.curPeso > prev;
      const set: ExerciseSet = { reps: s.curReps, peso: s.curPeso, rpe: s.curRpe, pr: isPR };
      return {
        ...s,
        log: { ...s.log, [ex.id]: [...(s.log[ex.id] || []), set] },
        prMap: isPR ? { ...s.prMap, [ex.id]: s.curPeso } : s.prMap,
        prFlash: isPR ? { ej: ex.nombre, val: s.curPeso + ' kg' } : s.prFlash,
        restActive: true,
        restLeft: 90,
      };
    });
    startRest();
    if (prTimer.current) clearTimeout(prTimer.current);
    prTimer.current = setTimeout(() => setState(s => ({ ...s, prFlash: null })), 4000);
  }, [startRest]);

  const startEditEx = useCallback(() =>
    setState(s => {
      const e = s.exercises[s.exIndex];
      if (!e) return s;
      return { ...s, editingEx: true, addingEx: false, draft: { nombre: e.nombre, target: e.target, reps: e.reps, peso: e.peso, step: e.step } };
    }), []);

  const startAddEx = useCallback(() =>
    setState(s => ({ ...s, addingEx: true, editingEx: false, draft: { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5 } })), []);

  const cancelExForm = useCallback(() =>
    setState(s => ({ ...s, editingEx: false, addingEx: false })), []);

  const setDraft = useCallback((f: keyof AppState['draft'], v: string | number) =>
    setState(s => ({ ...s, draft: { ...s.draft, [f]: v } })), []);

  const saveEditEx = useCallback(() =>
    setState(s => {
      const d = s.draft;
      const arr = [...s.exercises];
      const cur = arr[s.exIndex];
      if (!cur) return s;
      const t = Math.max(1, +d.target || 1);
      const r = Math.max(1, +d.reps || 1);
      const p = Math.max(0, +d.peso || 0);
      arr[s.exIndex] = { ...cur, nombre: String(d.nombre).trim() || cur.nombre, target: t, reps: r, peso: p, step: +d.step || 2.5, sub: `${t}×${r} · RPE 8` };
      return { ...s, exercises: arr, editingEx: false, curReps: r, curPeso: p };
    }), []);

  const saveAddEx = useCallback(() =>
    setState(s => {
      const d = s.draft;
      if (!String(d.nombre).trim()) return { ...s, addingEx: false };
      const id = 'ej' + Date.now();
      const t = Math.max(1, +d.target || 1);
      const r = Math.max(1, +d.reps || 1);
      const p = Math.max(0, +d.peso || 0);
      const ne: Exercise = { id, nombre: String(d.nombre).trim(), sub: `${t}×${r} · RPE 8`, target: t, reps: r, peso: p, step: +d.step || 2.5, basePR: p };
      const arr = [...s.exercises, ne];
      return { ...s, exercises: arr, addingEx: false, exIndex: arr.length - 1, curReps: r, curPeso: p, curRpe: 8, prMap: { ...s.prMap, [id]: p } };
    }), []);

  const deleteEx = useCallback(() =>
    setState(s => {
      if (s.exercises.length <= 1) return { ...s, editingEx: false };
      const arr = s.exercises.filter((_, i) => i !== s.exIndex);
      const ni = Math.max(0, s.exIndex - 1);
      return { ...s, exercises: arr, exIndex: ni, editingEx: false, curReps: arr[ni].reps, curPeso: arr[ni].peso };
    }), []);

  const addRest = useCallback(() =>
    setState(s => ({ ...s, restLeft: s.restLeft + 30 })), []);

  const skipRest = useCallback(() => {
    if (restTimer.current) clearInterval(restTimer.current);
    setState(s => ({ ...s, restActive: false, restLeft: 90 }));
  }, []);

  const dismissPrFlash = useCallback(() =>
    setState(s => ({ ...s, prFlash: null })), []);

  const setMetric = useCallback((m: MetricKey) =>
    setState(s => ({ ...s, metric: m })), []);

  const incWeighIn = useCallback(() =>
    setState(s => ({ ...s, weighIn: +(s.weighIn + 0.1).toFixed(1) })), []);

  const decWeighIn = useCallback(() =>
    setState(s => ({ ...s, weighIn: Math.max(30, +(s.weighIn - 0.1).toFixed(1)) })), []);

  const registrarPeso = useCallback(() =>
    setState(s => {
      if (s.weighed) return s;
      const newHist = [...s.pesoHist, s.weighIn];
      return { ...s, pesoHist: newHist, weighed: true };
    }), []);

  return (
    <AppContext.Provider value={{
      state, setMeal, setMealNote, setWater, selectEx,
      incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
      startEditEx, startAddEx, cancelExForm, setDraft, saveEditEx, saveAddEx, deleteEx,
      addRest, skipRest, dismissPrFlash, setMetric, incWeighIn, decWeighIn, registrarPeso,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
