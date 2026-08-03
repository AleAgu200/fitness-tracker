import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_ACCENT,
  DEFAULT_WEIGHT_UNIT,
  loadAccentColor,
  loadWeightUnit,
  setAccentColor as persistAccentColor,
  setWeightUnit as persistWeightUnit,
  WeightUnit,
} from '@/lib/settings';

interface PreferencesValue {
  accent: string;
  weightUnit: WeightUnit;
  setAccent: (hex: string) => void;
  setWeightUnit: (unit: WeightUnit) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);

  useEffect(() => {
    Promise.all([loadAccentColor(), loadWeightUnit()])
      .then(([savedAccent, savedUnit]) => {
        setAccentState(savedAccent);
        setWeightUnitState(savedUnit);
      })
      .catch(e => console.error('[preferences]', e));
  }, []);

  const setAccent = useCallback((hex: string) => {
    setAccentState(hex);
    persistAccentColor(hex).catch(e => console.error('[preferences]', e));
  }, []);

  const setWeightUnit = useCallback((unit: WeightUnit) => {
    setWeightUnitState(unit);
    persistWeightUnit(unit).catch(e => console.error('[preferences]', e));
  }, []);

  const value = useMemo(
    () => ({ accent, weightUnit, setAccent, setWeightUnit }),
    [accent, weightUnit, setAccent, setWeightUnit],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
